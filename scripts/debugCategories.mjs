import axios from "axios";

const SPREADSHEET_ID = process.env.VITE_GOOGLE_SPREADSHEET_ID || "";
const API_KEY = process.env.VITE_GOOGLE_API_KEY || "";
const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

async function main() {
  if (!SPREADSHEET_ID || !API_KEY) {
    throw new Error("Missing spreadsheet envs");
  }

  const range = "Wzorzec kategorii!B34:B213";
  const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
  const response = await axios.get(url);
  const values = response.data.values || [];

  const result = [];
  let currentCategory = null;
  let expectCategoryName = false;

  values.forEach((row) => {
    const entry = row?.[0]?.trim();
    if (!entry || entry === ".") {
      return;
    }
    if (entry === "nazwa kategorii") {
      expectCategoryName = true;
      currentCategory = null;
      return;
    }
    if (expectCategoryName) {
      currentCategory = { [entry]: [] };
      result.push(currentCategory);
      expectCategoryName = false;
      return;
    }
    if (!currentCategory) {
      return;
    }
    const categoryName = Object.keys(currentCategory)[0];
    currentCategory[categoryName].push(entry);
  });

  console.log("Categories:", result.length);
  console.log(JSON.stringify(result.slice(0, 2), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
