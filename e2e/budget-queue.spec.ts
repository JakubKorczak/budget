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

async function mockSheets(context: BrowserContext) {
  await context.route("https://sheets.googleapis.com/**", async (route: Route) => {
    const url = decodeURIComponent(route.request().url());
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
