import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const MONTHS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem("budget_app_session", "budżet2025");
  });
  await mockSheets(context);
});

test("dolna nawigacja pozostaje w całości widoczna nad dolnym obszarem iPhone", async ({
  page,
}) => {
  for (const viewport of [
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--sab", "34px");
    });

    const navigation = page.getByRole("navigation", {
      name: "Główna nawigacja",
    });
    const actions = navigation.locator(".budget-bottom-nav-actions");
    const activeButton = navigation.getByRole("button", {
      name: "Dodaj",
      exact: true,
    });
    const box = await navigation.boundingBox();
    const actionsBox = await actions.boundingBox();
    const buttonBox = await activeButton.boundingBox();

    expect(box).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(viewport.width);
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
      viewport.height
    );
    expect(Math.round((buttonBox?.y ?? 0) - (actionsBox?.y ?? 0))).toBe(6);
    expect(
      Math.round(
        (actionsBox?.y ?? 0) +
          (actionsBox?.height ?? 0) -
          (buttonBox?.y ?? 0) -
          (buttonBox?.height ?? 0)
      )
    ).toBe(6);
    expect(buttonBox?.x).toBe(viewport.width < 420 ? 12 : 16);
    expect(Math.round((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0))).toBe(
      viewport.height - 6
    );
    expect(
      Math.round(
        (box?.y ?? 0) +
          (box?.height ?? 0) -
          (actionsBox?.y ?? 0) -
          (actionsBox?.height ?? 0)
      )
    ).toBe(0);
    await expect(navigation).toHaveCSS("background-color", "rgb(0, 0, 0)");

    const outerCanvas = await page.evaluate(() => ({
      htmlColor: getComputedStyle(document.documentElement).backgroundColor,
      htmlImage: getComputedStyle(document.documentElement).backgroundImage,
      bodyColor: getComputedStyle(document.body).backgroundColor,
      bodyImage: getComputedStyle(document.body).backgroundImage,
      rootImage: getComputedStyle(document.getElementById("root")!).backgroundImage,
    }));
    expect(outerCanvas).toMatchObject({
      htmlColor: "rgb(0, 0, 0)",
      htmlImage: "none",
      bodyColor: "rgb(0, 0, 0)",
      bodyImage: "none",
    });
    expect(outerCanvas.rootImage).not.toBe("none");

    const manifest = await page.evaluate(async () => {
      const response = await fetch("/manifest.json");
      return (await response.json()) as { background_color: string };
    });
    expect(manifest.background_color).toBe("#000000");
  }
});

test("formularz jest gotowy na kolejny wydatek przed odpowiedzią Apps Script", async ({
  context,
  page,
}) => {
  let snapshotRequests = 0;
  await context.route("https://sheets.googleapis.com/**", async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (!url.includes("/values/") && url.includes("!B58:")) {
      snapshotRequests += 1;
    }
    await route.fallback();
  });
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await context.route("**/test-apps-script*", async (route) => {
    const request = route.request();
    const payload = JSON.parse(request.postData() || "{}") as {
      commands: Array<{ commandId: string; desired: unknown }>;
    };
    await responseGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        results: payload.commands.map((command) => ({
          commandId: command.commandId,
          status: "applied",
          current: command.desired,
        })),
      }),
    });
  });

  await page.goto("/");
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await page.getByPlaceholder("0.00").fill("100+20");
  await page.getByRole("button", { name: "Zapisz wydatek" }).click();

  await expect(page.getByRole("button", { name: "Wybierz kategorię..." })).toBeEnabled();
  await expect(page.getByPlaceholder("0.00")).toHaveValue("");
  expect(snapshotRequests).toBe(1);
  releaseResponse?.();
});

test("po wyborze kategorii pokazuje realizację jej planu", async ({ page }) => {
  await page.goto("/");
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");

  const summary = page.getByRole("region", {
    name: "Realizacja planu kategorii",
  });
  await expect(summary).toContainText("25%");
  await expect(summary).toContainText("Plan1000,00 zł");
  await expect(summary).toContainText("Wydano250,00 zł");
  await expect(summary).toContainText("Pozostało 750,00 zł");
});

test("ekran miesiąca pokazuje podsumowanie i zachowuje szkic formularza", async ({
  context,
  page,
}) => {
  let dashboardRequests = 0;
  await context.route("https://sheets.googleapis.com/**", async (route) => {
    if (decodeURIComponent(route.request().url()).includes("/values:batchGet")) {
      dashboardRequests += 1;
    }
    await route.fallback();
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dodaj", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await page.getByPlaceholder("0.00").fill("120");

  await page.getByRole("button", { name: "Ten miesiąc", exact: true }).click();
  const dashboard = page.getByRole("region", {
    name: "Podsumowanie bieżącego miesiąca",
  });
  await expect(dashboard).toContainText("Zostało do wydania");
  await expect(dashboard).toContainText(/3\s?000,00\s*zł/);
  await expect(dashboard).toContainText("Nieplanowane wydatki");
  expect(dashboardRequests).toBeGreaterThanOrEqual(1);
  expect(dashboardRequests).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByPlaceholder("0.00")).toHaveValue("120");
});

test("dashboard czeka na czysty snapshot, aż aktywny zapis opuści kolejkę", async ({
  context,
  page,
}) => {
  let dashboardRequests = 0;
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  await context.route("https://sheets.googleapis.com/**", async (route) => {
    if (decodeURIComponent(route.request().url()).includes("/values:batchGet")) {
      dashboardRequests += 1;
    }
    await route.fallback();
  });
  await context.route("**/test-apps-script*", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}") as {
      commands: Array<{ commandId: string; desired: unknown }>;
    };
    await responseGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        results: payload.commands.map((command) => ({
          commandId: command.commandId,
          status: "applied",
          current: command.desired,
        })),
      }),
    });
  });

  await page.goto("/");
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await page.getByPlaceholder("0.00").fill("120");
  await page.getByRole("button", { name: "Zapisz wydatek" }).click();
  await page.getByRole("button", { name: "Ten miesiąc", exact: true }).click();

  await expect(page.getByText("Oczekiwanie na synchronizację wpisów...")).toBeVisible();
  await page.waitForTimeout(250);
  expect(dashboardRequests).toBe(0);

  releaseResponse?.();
  await expect(
    page.getByRole("region", { name: "Podsumowanie bieżącego miesiąca" })
  ).toBeVisible();
  await expect.poll(() => dashboardRequests).toBeGreaterThanOrEqual(1);
});

test("pull-to-refresh nie przechwytuje gestu poniżej góry ekranu", async ({
  context,
  page,
}) => {
  let dashboardRequests = 0;
  await context.route("https://sheets.googleapis.com/**", async (route) => {
    if (decodeURIComponent(route.request().url()).includes("/values:batchGet")) {
      dashboardRequests += 1;
    }
    await route.fallback();
  });

  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ten miesiąc", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Podsumowanie bieżącego miesiąca" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Odśwież podsumowanie" })).toBeEnabled();

  const requestsBeforeGesture = dashboardRequests;
  const movePreventedBelowTop = await dispatchPullGesture(page, 200, 100, 210);
  expect(movePreventedBelowTop).toBe(false);
  await page.waitForTimeout(250);
  expect(dashboardRequests).toBe(requestsBeforeGesture);

  const movePreventedAtTop = await dispatchPullGesture(page, 0, 100, 210);
  expect(movePreventedAtTop).toBe(true);
  await expect.poll(() => dashboardRequests).toBe(requestsBeforeGesture + 1);
});

test("niezatwierdzony wydatek pozostaje w formularzu po odtworzeniu aplikacji", async ({
  page,
}) => {
  await page.goto("/");
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await page.getByPlaceholder("0.00").fill("100+20");

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("budget:entry-draft:v1:expense")
      )
    )
    .toContain('"price":"100+20"');

  await page.reload();

  await expect(page.getByRole("button", { name: "Zakupy" })).toBeVisible();
  await expect(page.getByPlaceholder("0.00")).toHaveValue("100+20");
});

test("wybrana kwota odświeża się po zmianie wykonanej przez drugą osobę", async ({
  context,
  page,
}) => {
  let remoteAmount = 100;
  await mockChangingDayAmount(context, () => remoteAmount);

  await page.goto("/");
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await expect(page.getByPlaceholder("0.00")).toHaveValue("100");

  remoteAmount = 140;

  await expect(page.getByPlaceholder("0.00")).toHaveValue("140", {
    timeout: 3_000,
  });
});

test("odświeżenie w tle nie nadpisuje rozpoczętej edycji", async ({
  context,
  page,
}) => {
  let remoteAmount = 100;
  let snapshotReads = 0;
  await mockChangingDayAmount(context, () => {
    snapshotReads += 1;
    return remoteAmount;
  });

  await page.goto("/");
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await expect(page.getByPlaceholder("0.00")).toHaveValue("100");
  await page.getByPlaceholder("0.00").fill("100+20");

  remoteAmount = 140;
  await expect.poll(() => snapshotReads, { timeout: 3_000 }).toBeGreaterThan(1);

  await expect(page.getByPlaceholder("0.00")).toHaveValue("100+20");
});

test("wpis offline przeżywa zamknięcie strony i synchronizuje się po powrocie", async ({
  context,
  page,
}) => {
  const appliedCommands: string[] = [];
  await context.route("**/test-apps-script*", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}") as {
      commands: Array<{ commandId: string; desired: unknown }>;
    };
    appliedCommands.push(...payload.commands.map((command) => command.commandId));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        results: payload.commands.map((command) => ({
          commandId: command.commandId,
          status: "applied",
          current: command.desired,
        })),
      }),
    });
  });

  await page.goto("/");
  await context.setOffline(true);
  await selectEntry(page, "Wybierz kategorię...", "Zakupy");
  await page.getByPlaceholder("0.00").fill("49,99");
  await page.getByRole("button", { name: "Zapisz wydatek" }).click();
  await expect(page.getByText(/wpis oczekuje na internet/i)).toBeVisible();

  await page.close();
  await context.setOffline(false);
  const restoredPage = await context.newPage();
  await restoredPage.goto("/");
  await expect.poll(() => appliedCommands.length).toBe(1);
  await expect(restoredPage.getByText(/wpis oczekuje na internet/i)).toHaveCount(0);
});

test("wynagrodzenie korzysta z tej samej nieblokującej kolejki", async ({
  context,
  page,
}) => {
  const syncedTypes: string[] = [];
  await context.route("**/test-apps-script*", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}") as {
      commands: Array<{
        commandId: string;
        entryType: string;
        desired: unknown;
      }>;
    };
    syncedTypes.push(...payload.commands.map((command) => command.entryType));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        results: payload.commands.map((command) => ({
          commandId: command.commandId,
          status: "applied",
          current: command.desired,
        })),
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Przejdź do wynagrodzeń" }).click();
  await selectEntry(page, "Wybierz wynagrodzenie...", "Pensja");
  await page.getByPlaceholder("0.00").fill("5000");
  await page.getByRole("button", { name: "Zapisz wynagrodzenie" }).click();

  await expect(page.getByPlaceholder("0.00")).toHaveValue("");
  await expect.poll(() => syncedTypes).toContain("salary");
});

async function selectEntry(
  page: import("@playwright/test").Page,
  triggerName: string,
  entryName: string
) {
  await page.getByRole("button", { name: triggerName }).click();
  await page.getByRole("button", { name: entryName }).click();
}

async function dispatchPullGesture(
  page: import("@playwright/test").Page,
  scrollTop: number,
  startY: number,
  endY: number
): Promise<boolean> {
  return page.evaluate(
    ({ scrollTop, startY, endY }) => {
      const shell = document.querySelector<HTMLElement>(".budget-app-shell");
      if (!shell) throw new Error("Brak kontenera przewijania aplikacji");
      shell.scrollTop = scrollTop;

      const start = new Event("touchstart", { bubbles: true, cancelable: true });
      Object.defineProperty(start, "touches", { value: [{ clientY: startY }] });
      window.dispatchEvent(start);

      const move = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.defineProperty(move, "touches", { value: [{ clientY: endY }] });
      window.dispatchEvent(move);
      window.dispatchEvent(
        new Event("touchend", { bubbles: true, cancelable: true })
      );
      return move.defaultPrevented;
    },
    { scrollTop, startY, endY }
  );
}

async function mockSheets(context: BrowserContext) {
  await context.route("https://sheets.googleapis.com/**", async (route: Route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes("/values:batchGet")) {
      const month = MONTHS[new Date().getMonth()];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          valueRanges: [
            { range: `${month}!D2`, values: [[`${month} 2026`]] },
            {
              range: `${month}!B54:E70`,
              values: [["SUMA:", 10_000, 8_000, -2_000]],
            },
            {
              range: `${month}!B76:E257`,
              values: [
                ["Kategoria", "Planowane", "Rzeczywiste", "Różnica"],
                ["SUMA:", 6_000, 3_000, 3_000],
                ["Dom", 4_000, 4_100, -100],
                ["Zakupy", 0, 500, -500],
              ],
            },
            {
              range: "Wzorzec kategorii!B34:B213",
              values: [["nazwa kategorii"], ["Dom"], ["Zakupy"]],
            },
          ],
        }),
      });
      return;
    }
    if (url.includes("/values/Wzorzec kategorii!")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          values: [["nazwa kategorii"], ["Dom"], ["Zakupy"]],
        }),
      });
      return;
    }
    if (url.includes("/values/") && url.includes("!B58:B70")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ values: [["Pensja"]] }),
      });
      return;
    }
    if (/\/values\/[^?]+!C\d+:E\d+/.test(url)) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ values: [[1_000, 250, 750]] }),
      });
      return;
    }

    const today = new Date();
    const month = MONTHS[today.getMonth()];
    const valueOffset = today.getDate() + 6;
    const isExpenseCategoryGrid =
      url.includes("ranges=") &&
      url.includes("!B79:B257") &&
      !url.includes("!B58:");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sheets: [
          {
            properties: { title: month },
            data: isExpenseCategoryGrid
              ? [buildGrid(78, "Zakupy", 0)]
              : [
                  buildGrid(57, "Pensja", valueOffset),
                  buildGrid(78, "Zakupy", valueOffset),
                ],
          },
        ],
      }),
    });
  });
}

async function mockChangingDayAmount(
  context: BrowserContext,
  getAmount: () => number
) {
  await context.route("https://sheets.googleapis.com/**", async (route: Route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes("/values/")) {
      await route.fallback();
      return;
    }

    const today = new Date();
    const month = MONTHS[today.getMonth()];
    const valueOffset = today.getDate() + 6;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sheets: [
          {
            properties: { title: month },
            data: [
              buildGrid(57, "Pensja", valueOffset),
              buildGrid(78, "Zakupy", valueOffset, getAmount()),
            ],
          },
        ],
      }),
    });
  });
}

function buildGrid(
  startRow: number,
  label: string,
  valueOffset: number,
  amount?: number
) {
  const values = Array.from({ length: valueOffset + 1 }, () => ({}));
  values[0] = { formattedValue: label };
  if (amount !== undefined) {
    values[valueOffset] = {
      formattedValue: amount.toString(),
      userEnteredValue: { numberValue: amount },
      effectiveValue: { numberValue: amount },
    };
  }
  return { startRow, rowData: [{ values }] };
}
