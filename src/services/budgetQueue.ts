import type { IDBPDatabase } from "idb";

import {
  buildCellKey,
  dayAmountToCanonical,
  getBudgetDatabase,
  getBudgetDaySnapshot,
  patchBudgetDayCell,
  type BudgetDatabase,
  type BudgetQueueRecord,
  type CanonicalCellValue,
} from "./budgetDb";
import {
  applyBudgetEntryCommands,
  setDayAmountsCache,
  type ApplyBudgetEntryResult,
  type BudgetEntryType,
} from "./googleSheets";

export interface EnqueueBudgetEntryInput {
  entryType: BudgetEntryType;
  month: string;
  day: number;
  category: string;
  expected?: CanonicalCellValue;
  desired: Exclude<CanonicalCellValue, { mode: "empty" }>;
}

export interface BudgetQueueSnapshot {
  pending: number;
  syncing: number;
  problems: BudgetQueueRecord[];
  offline: boolean;
}

type QueueListener = (snapshot: BudgetQueueSnapshot) => void;

const listeners = new Set<QueueListener>();
const ownerId = createCommandId();
const RETRY_DELAYS = [1_000, 2_000, 5_000, 15_000, 30_000];
const LEASE_KEY = "queue-sync-lease";
const LEASE_DURATION = 15_000;

let activeSync: Promise<void> | null = null;
let retryTimer: number | null = null;

export async function enqueueBudgetEntry(
  input: EnqueueBudgetEntryInput
): Promise<BudgetQueueRecord> {
  const database = await getBudgetDatabase();
  const now = Date.now();
  const cellKey = buildCellKey(
    input.entryType,
    input.month,
    input.day,
    input.category
  );
  const existingForCell = await database.getAllFromIndex("queue", "cellKey", cellKey);
  const mergeTarget = existingForCell
    .filter((record) => record.state === "pending")
    .sort((left, right) => left.createdAt - right.createdAt)[0];

  const snapshot = await getBudgetDaySnapshot(input.month, input.day, true);
  const currentEntry = snapshot?.[input.entryType]?.[input.category];
  const expected =
    mergeTarget?.expected ??
    input.expected ??
    dayAmountToCanonical(currentEntry);
  const record: BudgetQueueRecord = mergeTarget
    ? {
        ...mergeTarget,
        desired: input.desired,
        attempts: 0,
        updatedAt: now,
        nextAttemptAt: now,
        lastError: undefined,
      }
    : {
        commandId: createCommandId(),
        cellKey,
        entryType: input.entryType,
        month: input.month,
        day: input.day,
        category: input.category,
        expected,
        desired: input.desired,
        state: "pending",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        nextAttemptAt: now,
      };

  await database.put("queue", record);
  await patchClientCell(
    input.entryType,
    input.month,
    input.day,
    input.category,
    input.desired
  );
  await emitQueueSnapshot();

  if (isOnline()) {
    void syncBudgetEntries();
  }

  return record;
}

export function syncBudgetEntries(): Promise<void> {
  if (!isOnline()) {
    return emitQueueSnapshot();
  }
  if (activeSync) {
    return activeSync;
  }

  activeSync = runWithOriginLock(drainQueue).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export async function getQueueProblems(): Promise<BudgetQueueRecord[]> {
  const database = await getBudgetDatabase();
  const all = await database.getAll("queue");
  return all
    .filter((record) => record.state === "conflict" || record.state === "failed")
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function getBudgetQueueSnapshot(): Promise<BudgetQueueSnapshot> {
  const database = await getBudgetDatabase();
  const all = await database.getAll("queue");
  return {
    pending: all.filter((record) => record.state === "pending").length,
    syncing: all.filter((record) => record.state === "syncing").length,
    problems: all
      .filter((record) => record.state === "conflict" || record.state === "failed")
      .sort((left, right) => left.createdAt - right.createdAt),
    offline: !isOnline(),
  };
}

export function subscribeBudgetQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  void getBudgetQueueSnapshot().then(listener);
  return () => listeners.delete(listener);
}

export function startBudgetQueueSync(): () => void {
  const handleOnline = () => {
    void emitQueueSnapshot();
    void syncBudgetEntries();
  };
  const handleOffline = () => void emitQueueSnapshot();
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      void syncBudgetEntries();
    }
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibility);
  void recoverInterruptedRecords().then(() => syncBudgetEntries());

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    document.removeEventListener("visibilitychange", handleVisibility);
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}

export async function retryBudgetQueueRecord(commandId: string): Promise<void> {
  const database = await getBudgetDatabase();
  const record = await database.get("queue", commandId);
  if (!record) {
    return;
  }
  await database.put("queue", {
    ...record,
    state: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: undefined,
  });
  await emitQueueSnapshot();
  await syncBudgetEntries();
}

export async function overwriteBudgetQueueConflict(
  commandId: string
): Promise<void> {
  const database = await getBudgetDatabase();
  const record = await database.get("queue", commandId);
  if (!record || record.state !== "conflict" || !record.current) {
    return;
  }
  await database.put("queue", {
    ...record,
    expected: record.current,
    state: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
    updatedAt: Date.now(),
    lastError: undefined,
    current: undefined,
  });
  await patchClientCell(
    record.entryType,
    record.month,
    record.day,
    record.category,
    record.desired
  );
  await emitQueueSnapshot();
  await syncBudgetEntries();
}

export async function discardBudgetQueueRecord(commandId: string): Promise<void> {
  const database = await getBudgetDatabase();
  const record = await database.get("queue", commandId);
  if (!record) {
    return;
  }
  if (record.current) {
    await patchClientCell(
      record.entryType,
      record.month,
      record.day,
      record.category,
      record.current
    );
  }
  await database.delete("queue", commandId);
  await emitQueueSnapshot();
  void syncBudgetEntries();
}

async function drainQueue(): Promise<void> {
  if (!isOnline()) {
    await emitQueueSnapshot();
    return;
  }

  const database = await getBudgetDatabase();
  while (isOnline()) {
    const records = await selectReadyRecords(database);
    if (!records.length) {
      await emitQueueSnapshot();
      scheduleNextRetry(database);
      return;
    }

    const now = Date.now();
    await Promise.all(
      records.map((record) =>
        database.put("queue", {
          ...record,
          state: "syncing",
          updatedAt: now,
        })
      )
    );
    await emitQueueSnapshot();

    try {
      const results = await applyBudgetEntryCommands(records);
      await applyServerResults(database, records, results);
    } catch (error) {
      await markTransportFailure(database, records, error);
      await emitQueueSnapshot();
      scheduleNextRetry(database);
      return;
    }
    await emitQueueSnapshot();
  }
}

async function selectReadyRecords(
  database: IDBPDatabase<BudgetDatabase>
): Promise<BudgetQueueRecord[]> {
  const all = await database.getAll("queue");
  const blockedCells = new Set(
    all
      .filter((record) => record.state === "conflict" || record.state === "failed")
      .map((record) => record.cellKey)
  );
  const batchSize = Math.max(
    1,
    Math.min(10, Number(import.meta.env.VITE_QUEUE_BATCH_SIZE || 1))
  );
  const now = Date.now();
  const selected: BudgetQueueRecord[] = [];
  const selectedCells = new Set<string>();

  for (const record of all.sort((left, right) => left.createdAt - right.createdAt)) {
    if (
      record.state !== "pending" ||
      record.nextAttemptAt > now ||
      blockedCells.has(record.cellKey) ||
      selectedCells.has(record.cellKey)
    ) {
      continue;
    }
    selected.push(record);
    selectedCells.add(record.cellKey);
    if (selected.length >= batchSize) {
      break;
    }
  }
  return selected;
}

async function applyServerResults(
  database: IDBPDatabase<BudgetDatabase>,
  records: BudgetQueueRecord[],
  results: ApplyBudgetEntryResult[]
): Promise<void> {
  const byId = new Map(results.map((result) => [result.commandId, result]));
  for (const record of records) {
    const result = byId.get(record.commandId);
    if (!result) {
      await applyRetry(database, record, "Brak wyniku operacji z Apps Script");
      continue;
    }

    if (result.status === "applied" || result.status === "alreadyApplied") {
      await patchClientCell(
        record.entryType,
        record.month,
        record.day,
        record.category,
        result.current
      );
      await database.delete("queue", record.commandId);
      continue;
    }

    if (result.status === "conflict") {
      await patchClientCell(
        record.entryType,
        record.month,
        record.day,
        record.category,
        result.current
      );
      await database.put("queue", {
        ...record,
        state: "conflict",
        current: result.current,
        lastError: result.message || "Wartość w arkuszu została zmieniona",
        updatedAt: Date.now(),
      });
      continue;
    }

    if (result.status === "retryable") {
      await applyRetry(database, record, result.message || "Apps Script jest zajęty");
      continue;
    }

    await database.put("queue", {
      ...record,
      state: "failed",
      current: result.current,
      lastError: result.message || "Nieprawidłowa operacja",
      updatedAt: Date.now(),
    });
  }
}

async function markTransportFailure(
  database: IDBPDatabase<BudgetDatabase>,
  records: BudgetQueueRecord[],
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : "Błąd połączenia";
  await Promise.all(records.map((record) => applyRetry(database, record, message)));
}

async function applyRetry(
  database: IDBPDatabase<BudgetDatabase>,
  record: BudgetQueueRecord,
  message: string
): Promise<void> {
  const attempts = record.attempts + 1;
  if (attempts > RETRY_DELAYS.length) {
    await database.put("queue", {
      ...record,
      state: "failed",
      attempts,
      lastError: message,
      updatedAt: Date.now(),
    });
    return;
  }
  const baseDelay = RETRY_DELAYS[attempts - 1] ?? RETRY_DELAYS.at(-1) ?? 30_000;
  const jitter = Math.round(baseDelay * (Math.random() * 0.2 - 0.1));
  await database.put("queue", {
    ...record,
    state: "pending",
    attempts,
    nextAttemptAt: Date.now() + baseDelay + jitter,
    lastError: message,
    updatedAt: Date.now(),
  });
}

async function recoverInterruptedRecords(): Promise<void> {
  const database = await getBudgetDatabase();
  const all = await database.getAll("queue");
  await Promise.all(
    all
      .filter((record) => record.state === "syncing")
      .map((record) =>
        database.put("queue", {
          ...record,
          state: "pending",
          nextAttemptAt: Date.now(),
        })
      )
  );
  await emitQueueSnapshot();
}

async function emitQueueSnapshot(): Promise<void> {
  const snapshot = await getBudgetQueueSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function scheduleNextRetry(database: IDBPDatabase<BudgetDatabase>): void {
  if (retryTimer !== null || !isOnline()) {
    return;
  }
  void database.getAll("queue").then((records: BudgetQueueRecord[]) => {
    const blockedCells = new Set(
      records
        .filter((record) => record.state === "conflict" || record.state === "failed")
        .map((record) => record.cellKey)
    );
    const next = records
      .filter(
        (record) =>
          record.state === "pending" && !blockedCells.has(record.cellKey)
      )
      .reduce<number | null>(
        (minimum, record) =>
          minimum === null ? record.nextAttemptAt : Math.min(minimum, record.nextAttemptAt),
        null
      );
    if (next === null) {
      return;
    }
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void syncBudgetEntries();
    }, Math.max(0, next - Date.now()));
  });
}

async function runWithOriginLock(task: () => Promise<void>): Promise<void> {
  if ("locks" in navigator) {
    await navigator.locks.request("budget-queue-sync", task);
    return;
  }

  const database = await getBudgetDatabase();
  const acquired = await acquireLease(database);
  if (!acquired) {
    return;
  }
  const renewalTimer = window.setInterval(() => {
    void renewLease(database);
  }, Math.floor(LEASE_DURATION / 2));
  try {
    await task();
  } finally {
    window.clearInterval(renewalTimer);
    const lease = await database.get("meta", LEASE_KEY);
    if (String(lease?.value ?? "").startsWith(`${ownerId}:`)) {
      await database.delete("meta", LEASE_KEY);
    }
  }
}

async function acquireLease(
  database: IDBPDatabase<BudgetDatabase>
): Promise<boolean> {
  const transaction = database.transaction("meta", "readwrite");
  const current = await transaction.store.get(LEASE_KEY);
  const [currentOwner, expiresAtRaw] = String(current?.value ?? "").split(":");
  const expiresAt = Number(expiresAtRaw || 0);
  if (currentOwner && currentOwner !== ownerId && expiresAt > Date.now()) {
    await transaction.done;
    return false;
  }
  await transaction.store.put({
    key: LEASE_KEY,
    value: `${ownerId}:${Date.now() + LEASE_DURATION}`,
  });
  await transaction.done;
  return true;
}

async function renewLease(
  database: IDBPDatabase<BudgetDatabase>
): Promise<void> {
  const current = await database.get("meta", LEASE_KEY);
  if (!String(current?.value ?? "").startsWith(`${ownerId}:`)) {
    return;
  }
  await database.put("meta", {
    key: LEASE_KEY,
    value: `${ownerId}:${Date.now() + LEASE_DURATION}`,
  });
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function createCommandId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `budget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function patchClientCell(
  entryType: BudgetEntryType,
  month: string,
  day: number,
  category: string,
  value: CanonicalCellValue
): Promise<void> {
  const snapshot = await patchBudgetDayCell(
    entryType,
    month,
    day,
    category,
    value
  );
  setDayAmountsCache(month, day, snapshot[entryType], entryType);
}
