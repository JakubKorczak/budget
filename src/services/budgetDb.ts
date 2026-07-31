import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { BudgetEntryType, DayAmountEntry, DayAmountsMap } from "./googleSheets";

export type CanonicalCellValue =
  | { mode: "empty" }
  | { mode: "value"; amount: number }
  | { mode: "formula"; formula: string; amount: number };

export interface BudgetDaySnapshot {
  key: string;
  timestamp: number;
  month: string;
  day: number;
  expense: DayAmountsMap;
  salary: DayAmountsMap;
}

export type QueueRecordState = "pending" | "syncing" | "conflict" | "failed";

export interface BudgetQueueRecord {
  commandId: string;
  cellKey: string;
  entryType: BudgetEntryType;
  month: string;
  day: number;
  category: string;
  expected: CanonicalCellValue;
  desired: Exclude<CanonicalCellValue, { mode: "empty" }>;
  state: QueueRecordState;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number;
  lastError?: string;
  current?: CanonicalCellValue;
}

export interface BudgetDatabase extends DBSchema {
  daySnapshots: {
    key: string;
    value: BudgetDaySnapshot;
    indexes: { timestamp: number };
  };
  queue: {
    key: string;
    value: BudgetQueueRecord;
    indexes: {
      cellKey: string;
      state: QueueRecordState;
      createdAt: number;
    };
  };
  meta: {
    key: string;
    value: { key: string; value: string | number };
  };
}

const DATABASE_NAME = "budget-data-v3";
const SNAPSHOT_TTL = 6 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 62;

let databasePromise: Promise<IDBPDatabase<BudgetDatabase>> | null = null;

export function getBudgetDatabase(): Promise<IDBPDatabase<BudgetDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<BudgetDatabase>(DATABASE_NAME, 1, {
      upgrade(database) {
        const snapshots = database.createObjectStore("daySnapshots", {
          keyPath: "key",
        });
        snapshots.createIndex("timestamp", "timestamp");

        const queue = database.createObjectStore("queue", {
          keyPath: "commandId",
        });
        queue.createIndex("cellKey", "cellKey");
        queue.createIndex("state", "state");
        queue.createIndex("createdAt", "createdAt");

        database.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }

  return databasePromise;
}

export function buildSnapshotKey(month: string, day: number): string {
  return `${month}:${day}`;
}

export function buildCellKey(
  entryType: BudgetEntryType,
  month: string,
  day: number,
  category: string
): string {
  return `${entryType}:${month}:${day}:${category.trim().toLowerCase()}`;
}

export async function getBudgetDaySnapshot(
  month: string,
  day: number,
  allowStale = false
): Promise<BudgetDaySnapshot | null> {
  const database = await getBudgetDatabase();
  const snapshot = await database.get("daySnapshots", buildSnapshotKey(month, day));
  if (!snapshot) {
    return null;
  }

  if (!allowStale && Date.now() - snapshot.timestamp > SNAPSHOT_TTL) {
    await database.delete("daySnapshots", snapshot.key);
    return null;
  }

  return snapshot;
}

export async function putBudgetDaySnapshot(
  snapshot: Omit<BudgetDaySnapshot, "key" | "timestamp"> & {
    timestamp?: number;
  }
): Promise<BudgetDaySnapshot> {
  const database = await getBudgetDatabase();
  const stored: BudgetDaySnapshot = {
    ...snapshot,
    key: buildSnapshotKey(snapshot.month, snapshot.day),
    timestamp: snapshot.timestamp ?? Date.now(),
  };
  await database.put("daySnapshots", stored);
  await pruneSnapshots(database);
  return stored;
}

export async function applyPendingQueueOverlay(
  snapshot: Omit<BudgetDaySnapshot, "key" | "timestamp">
): Promise<Omit<BudgetDaySnapshot, "key" | "timestamp">> {
  const database = await getBudgetDatabase();
  const queued = await database.getAll("queue");
  const result = {
    ...snapshot,
    expense: { ...snapshot.expense },
    salary: { ...snapshot.salary },
  };
  queued
    .filter(
      (record) =>
        record.month === snapshot.month &&
        record.day === snapshot.day &&
        (record.state === "pending" || record.state === "syncing")
    )
    .sort((left, right) => left.createdAt - right.createdAt)
    .forEach((record) => {
      result[record.entryType][record.category] = {
        amount: record.desired.amount,
        formula:
          record.desired.mode === "formula" ? record.desired.formula : null,
        isEmpty: false,
      };
    });
  return result;
}

export async function patchBudgetDayCell(
  entryType: BudgetEntryType,
  month: string,
  day: number,
  category: string,
  value: CanonicalCellValue
): Promise<BudgetDaySnapshot> {
  const current =
    (await getBudgetDaySnapshot(month, day, true)) ??
    ({
      key: buildSnapshotKey(month, day),
      timestamp: Date.now(),
      month,
      day,
      expense: {},
      salary: {},
    } satisfies BudgetDaySnapshot);

  const data = { ...current[entryType] };
  if (value.mode === "empty") {
    data[category] = { amount: 0, formula: null, isEmpty: true };
  } else {
    data[category] = {
      amount: value.amount,
      formula: value.mode === "formula" ? value.formula : null,
      isEmpty: false,
    };
  }

  return putBudgetDaySnapshot({
    month,
    day,
    expense: entryType === "expense" ? data : current.expense,
    salary: entryType === "salary" ? data : current.salary,
  });
}

export function dayAmountToCanonical(
  entry: DayAmountEntry | null | undefined
): CanonicalCellValue {
  if (
    !entry ||
    entry.isEmpty === true ||
    (entry.isEmpty === undefined && entry.amount === 0 && !entry.formula)
  ) {
    return { mode: "empty" };
  }
  if (entry.formula) {
    return { mode: "formula", formula: entry.formula, amount: entry.amount };
  }
  return { mode: "value", amount: entry.amount };
}

export async function clearBudgetDaySnapshots(): Promise<void> {
  const database = await getBudgetDatabase();
  await database.clear("daySnapshots");
}

async function pruneSnapshots(
  database: IDBPDatabase<BudgetDatabase>
): Promise<void> {
  const count = await database.count("daySnapshots");
  if (count <= MAX_SNAPSHOTS) {
    return;
  }

  const transaction = database.transaction("daySnapshots", "readwrite");
  const index = transaction.store.index("timestamp");
  let cursor = await index.openCursor();
  let remaining = count - MAX_SNAPSHOTS;
  while (cursor && remaining > 0) {
    await cursor.delete();
    remaining -= 1;
    cursor = await cursor.continue();
  }
  await transaction.done;
}
