const endpoint = process.env.VITE_APPS_SCRIPT_URL;
const expenseCategory = process.env.SMOKE_EXPENSE_CATEGORY;
const salaryCategory = process.env.SMOKE_SALARY_CATEGORY;
const months = [
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
const month = process.env.SMOKE_MONTH || months[new Date().getMonth()];
const day = Number(process.env.SMOKE_DAY || new Date().getDate());

if (!endpoint || !expenseCategory || !salaryCategory) {
  throw new Error(
    "Ustaw VITE_APPS_SCRIPT_URL, SMOKE_EXPENSE_CATEGORY i SMOKE_SALARY_CATEGORY"
  );
}

const capabilitiesResponse = await fetch(
  `${endpoint}?action=capabilities&cacheBust=${Date.now()}`
);
const capabilities = await capabilitiesResponse.json();
if (
  !capabilitiesResponse.ok ||
  capabilities.protocolVersion !== 2 ||
  !capabilities.capabilities?.includes("compareAndSet")
) {
  throw new Error(`Apps Script v2 niedostępny: ${JSON.stringify(capabilities)}`);
}

const commands = [
  ["expense", expenseCategory],
  ["salary", salaryCategory],
].map(([entryType, category]) => ({
  commandId: `smoke-${entryType}-${Date.now()}`,
  entryType,
  month,
  day,
  category,
  expected: { mode: "empty" },
  desired: { mode: "value", amount: 0 },
}));

const validationResponse = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({
    action: "applyBudgetEntries",
    protocolVersion: 2,
    validateOnly: true,
    commands,
  }),
});
const validation = await validationResponse.json();
if (!validationResponse.ok || !validation.success) {
  throw new Error(`Walidacja Apps Script nie powiodła się: ${JSON.stringify(validation)}`);
}
const rejected = validation.results.filter(
  (result) => result.status === "invalid" || result.status === "retryable"
);
if (rejected.length) {
  throw new Error(`Nieprawidłowe wyniki smoke-testu: ${JSON.stringify(rejected)}`);
}

console.log(
  JSON.stringify(
    {
      protocolVersion: capabilities.protocolVersion,
      month,
      day,
      results: validation.results.map(({ commandId, status }) => ({
        commandId,
        status,
      })),
    },
    null,
    2
  )
);
