import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CalendarDays,
  CircleAlert,
  Clock3,
  Loader2,
  RefreshCw,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buildMonthlyDashboardModel } from "@/lib/monthlyDashboard";
import type { AppTheme } from "@/lib/theme";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import {
  getCachedMonthlyDashboardSnapshot,
  getCurrentMonth,
  getMonthlyDashboard,
} from "@/services/googleSheets";
import {
  getMonthlyBudgetQueueRecords,
  type BudgetQueueSnapshot,
} from "@/services/budgetQueue";
import type { BudgetQueueRecord } from "@/services/budgetDb";

const currencyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentageFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 0,
});

type MonthDashboardProps = {
  theme: AppTheme;
  onThemeToggle: () => void;
  queueSnapshot: BudgetQueueSnapshot;
  onOpenEntries: () => void;
  scrollContainerRef: RefObject<HTMLElement | null>;
};

type AlertItem = {
  key: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
  actionable?: boolean;
};

export function MonthDashboard({
  theme,
  onThemeToggle,
  queueSnapshot,
  onOpenEntries,
  scrollContainerRef,
}: MonthDashboardProps) {
  const month = getCurrentMonth();
  const queryClient = useQueryClient();
  const cachedSnapshot = useMemo(
    () => getCachedMonthlyDashboardSnapshot(month),
    [month]
  );
  const [queueRecords, setQueueRecords] = useState<BudgetQueueRecord[] | null>(
    null
  );
  const problemKey = queueSnapshot.problems
    .map((problem) => `${problem.commandId}:${problem.updatedAt}`)
    .join("|");
  const queueRevision = `${queueSnapshot.pending}:${queueSnapshot.syncing}:${problemKey}`;
  const previousQueueRevision = useRef<string | null>(null);
  const activeQueueCount =
    queueRecords?.filter(
      (record) => record.state === "pending" || record.state === "syncing"
    ).length ?? 0;
  // The monthly totals do not identify whether an affected cell already includes
  // a queued write. Keep one clean server baseline and refetch only after drain.
  const canFetchCleanSnapshot = queueRecords !== null && activeQueueCount === 0;

  const query = useQuery({
    queryKey: ["monthly-dashboard", month],
    queryFn: ({ signal }) => getMonthlyDashboard(month, signal),
    initialData: cachedSnapshot ?? undefined,
    initialDataUpdatedAt: cachedSnapshot?.fetchedAt,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: canFetchCleanSnapshot,
  });

  useEffect(() => {
    let active = true;
    void getMonthlyBudgetQueueRecords(month).then((records) => {
      if (!active) return;

      const previousRevision = previousQueueRevision.current;
      previousQueueRevision.current = queueRevision;
      setQueueRecords(records);

      const hasActiveRecords = records.some(
        (record) => record.state === "pending" || record.state === "syncing"
      );
      if (
        previousRevision !== null &&
        previousRevision !== queueRevision &&
        !hasActiveRecords
      ) {
        void queryClient.invalidateQueries({
          queryKey: ["monthly-dashboard", month],
        });
      }
    });
    return () => {
      active = false;
    };
  }, [month, queryClient, queueRevision]);

  const model = useMemo(
    () =>
      query.data && queueRecords
        ? buildMonthlyDashboardModel(query.data, queueRecords, new Date())
        : null,
    [query.data, queueRecords]
  );

  const refresh = useCallback(async () => {
    if (!canFetchCleanSnapshot) return;
    await queryClient.fetchQuery({
      queryKey: ["monthly-dashboard", month],
      queryFn: ({ signal }) =>
        getMonthlyDashboard(month, signal, { forceRefresh: true }),
      staleTime: 0,
    });
  }, [canFetchCleanSnapshot, month, queryClient]);

  usePullToRefresh(refresh, canFetchCleanSnapshot, scrollContainerRef);

  if (queueRecords === null || (!model && query.isPending)) {
    return (
      <Card className="flex min-h-[32rem] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-blue-500" />
          <p>
            {activeQueueCount > 0
              ? "Oczekiwanie na synchronizację wpisów..."
              : "Ładowanie podsumowania miesiąca..."}
          </p>
        </div>
      </Card>
    );
  }

  if (!model) {
    return (
      <Card className="min-h-[24rem]">
        <CardHeader>
          <CardTitle>Ten miesiąc</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
            Nie udało się pobrać podsumowania miesiąca.
          </div>
          <Button type="button" onClick={() => void refresh()} className="w-full">
            <RefreshCw className="size-4" />
            Spróbuj ponownie
          </Button>
        </CardContent>
      </Card>
    );
  }

  const alerts = buildAlerts(model, queueSnapshot);
  const spendingWidth = Math.min(100, Math.max(0, model.spendingProgress ?? 0));
  const timePosition = Math.min(100, Math.max(0, model.timeProgress));
  const progressColor =
    model.paceState === "danger"
      ? "bg-red-500"
      : model.paceState === "warning"
        ? "bg-amber-500"
        : "bg-blue-500";

  return (
    <Card className="w-full shadow-lg" role="region" aria-label="Podsumowanie bieżącego miesiąca">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <WalletCards className="size-6 text-blue-600 dark:text-blue-400" />
              Ten miesiąc
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{model.periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full"
              onClick={() => void refresh()}
              disabled={query.isFetching || !canFetchCleanSnapshot}
              aria-label="Odśwież podsumowanie"
            >
              <RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            </Button>
            <ThemeToggle theme={theme} onToggle={onThemeToggle} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Dane z {new Date(model.fetchedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {model.problemCount > 0 ? (
            <button
              type="button"
              onClick={onOpenEntries}
              className="rounded-full border border-red-300 bg-red-50 px-2.5 py-1 font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            >
              {pendingLabel(model.pendingCount)} · {problemLabel(model.problemCount)}
            </button>
          ) : (
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-medium text-foreground">
              {pendingLabel(model.pendingCount)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {model.isOptimistic && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
            Kwoty uwzględniają {model.pendingCount} lokalnie {model.pendingCount === 1 ? "zapisany wpis" : "zapisane wpisy"}.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={<Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />}
            label="Przychody"
            actual={model.actualIncome}
            planned={model.plannedIncome}
          />
          <MetricCard
            icon={<ReceiptText className="size-4 text-blue-600 dark:text-blue-400" />}
            label="Wydatki"
            actual={model.actualExpenses}
            planned={model.plannedExpenses}
          />
        </div>

        <section className="rounded-2xl border border-border bg-muted/45 p-4" aria-labelledby="remaining-title">
          <p id="remaining-title" className="text-sm text-muted-foreground">
            {model.remaining >= 0 ? "Zostało do wydania" : "Przekroczono plan o"}
          </p>
          <p className={model.remaining < 0 ? "mt-1 text-3xl font-bold tabular-nums text-red-600 dark:text-red-400" : "mt-1 text-3xl font-bold tabular-nums"}>
            {currencyFormatter.format(Math.abs(model.remaining))}
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            Bezpiecznie dziennie: <strong className="text-foreground">{currencyFormatter.format(model.safeDaily)}</strong>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Pozostało {model.daysRemaining} dni, licząc dzisiaj.</p>
        </section>

        <section className="rounded-2xl border border-border p-4" aria-labelledby="pace-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pace-title" className="text-sm font-semibold">Tempo wydatków</h2>
            <span className="text-sm font-semibold tabular-nums">
              {model.spendingProgress === null ? "Brak planu" : `${percentageFormatter.format(model.spendingProgress)}%`}
            </span>
          </div>
          <div className="relative mt-4 h-3 rounded-full bg-muted" aria-hidden="true">
            {model.spendingProgress !== null && (
              <div className={`h-full rounded-full transition-[width] ${progressColor}`} style={{ width: `${spendingWidth}%` }} />
            )}
            <div className="absolute -top-1 h-5 w-0.5 bg-foreground" style={{ left: `${timePosition}%` }} />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>Wydano {model.spendingProgress === null ? "—" : `${percentageFormatter.format(model.spendingProgress)}%`}</span>
            <span>Czas {percentageFormatter.format(model.timeProgress)}%</span>
          </div>
        </section>

        <section aria-labelledby="alerts-title">
          <div className="mb-2 flex items-center gap-2">
            <CircleAlert className="size-4 text-amber-600" />
            <h2 id="alerts-title" className="text-sm font-semibold">Alerty</h2>
          </div>
          {alerts.length ? (
            <div className="space-y-2">
              {alerts.map((alert) => {
                const content = (
                  <>
                    <span className="block text-sm font-semibold">{alert.title}</span>
                    <span className="mt-0.5 block text-xs opacity-85">{alert.detail}</span>
                  </>
                );
                const className = `w-full rounded-xl border p-3 text-left ${alertToneClass(alert.tone)}`;
                return alert.actionable ? (
                  <button key={alert.key} type="button" onClick={onOpenEntries} className={className}>
                    {content}
                  </button>
                ) : (
                  <div key={alert.key} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Budżet nie wymaga teraz uwagi.
            </div>
          )}
        </section>

        {(queueSnapshot.offline || query.isError) && (
          <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <Clock3 className="size-3.5" />
            {queueSnapshot.offline ? "Tryb offline — pokazujemy ostatnie dane i zmiany lokalne." : "Odświeżenie nie powiodło się — pokazujemy ostatnie poprawne dane."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon, label, actual, planned }: { icon: React.ReactNode; label: string; actual: number; planned: number }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      <p className="mt-2 text-lg font-bold tabular-nums">{currencyFormatter.format(actual)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Plan {currencyFormatter.format(planned)}</p>
    </div>
  );
}

function buildAlerts(
  model: ReturnType<typeof buildMonthlyDashboardModel>,
  queueSnapshot: BudgetQueueSnapshot
): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (model.problemCount > 0) {
    alerts.push({ key: "problems", tone: "danger", title: "Synchronizacja wymaga decyzji", detail: `${model.problemCount} ${model.problemCount === 1 ? "wpis ma problem" : "wpisy mają problem"}. Dotknij, aby rozwiązać.`, actionable: true });
  }
  if (model.pendingCount > 0) {
    alerts.push({ key: "pending", tone: "info", title: `${model.pendingCount} ${model.pendingCount === 1 ? "wpis oczekuje" : "wpisy oczekują"}`, detail: queueSnapshot.offline ? "Zostaną wysłane po powrocie internetu." : "Trwa zapisywanie w arkuszu." });
  }
  for (const row of model.overBudgetCategories) {
    alerts.push({ key: `over-${row.row}`, tone: "danger", title: row.label, detail: `${currencyFormatter.format(Math.abs(row.difference))} ponad plan.` });
  }
  if (model.unplannedExpenses.length > 0) {
    const names = model.unplannedExpenses.slice(0, 3).map((row) => row.label).join(", ");
    alerts.push({ key: "unplanned", tone: "warning", title: `Nieplanowane wydatki: ${currencyFormatter.format(model.unplannedTotal)}`, detail: `${model.unplannedExpenses.length} ${model.unplannedExpenses.length === 1 ? "kategoria" : "kategorie"}: ${names}.` });
  }
  return alerts.slice(0, 5);
}

function alertToneClass(tone: AlertItem["tone"]): string {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
  return "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100";
}

function pendingLabel(count: number): string {
  if (count === 1) return "1 wpis oczekuje";
  if (count >= 2 && count <= 4) return `${count} wpisy oczekują`;
  return `${count} wpisów oczekuje`;
}

function problemLabel(count: number): string {
  if (count === 1) return "1 problem";
  if (count >= 2 && count <= 4) return `${count} problemy`;
  return `${count} problemów`;
}
