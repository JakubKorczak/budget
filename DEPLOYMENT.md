# 🚀 Deployment - Wdrożenie aplikacji

Aplikację możesz wdrożyć na różne platformy hostingowe. Poniżej znajdziesz instrukcje dla najpopularniejszych opcji.

## Kolejność wdrożenia szybkiego zapisu

1. Skopiuj aktualny `google-apps-script/Code.gs` do projektu powiązanego z arkuszem i utwórz **nowe wdrożenie** Web App.
2. Ustaw nowe `VITE_APPS_SCRIPT_URL` w środowisku podglądowym frontendu.
3. Sprawdź protokół bez zapisywania danych:

```bash
VITE_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec" \
SMOKE_EXPENSE_CATEGORY="Zakupy" \
SMOKE_SALARY_CATEGORY="Pensja" \
npm run smoke:apps-script
```

4. Wdróż frontend z `VITE_QUEUE_BATCH_SIZE=1`. Stare akcje `addExpense` i `addSalary` pozostają fallbackiem, gdy POST jest niedostępny.
5. Po potwierdzeniu poprawnych wykonań, braku konfliktów i błędów `busy` można ustawić `VITE_QUEUE_BATCH_SIZE=10`.

Smoke-test korzysta z `validateOnly`, więc sprawdza oba zakresy i compare-and-set bez modyfikowania komórek.

## Opcja 1: Vercel (ZALECANE - najłatwiejsze)

### Automatyczne wdrożenie z GitHub

1. **Wypchnij kod na GitHub:**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/twoj-username/budget-app.git
git push -u origin main
```

2. **Wdróż na Vercel:**

   - Przejdź do [vercel.com](https://vercel.com)
   - Kliknij "New Project"
   - Importuj repozytorium z GitHub
   - Vercel automatycznie wykryje Vite

3. **Dodaj zmienne środowiskowe:**

   - W Vercel Dashboard > Settings > Environment Variables
   - Dodaj:
     - `VITE_GOOGLE_API_KEY`
     - `VITE_GOOGLE_SPREADSHEET_ID`
     - `VITE_APPS_SCRIPT_URL`

4. **Deploy:**
   - Vercel automatycznie zbuduje i wdroży aplikację
   - Otrzymasz URL: `https://budget-app.vercel.app`

### Ręczne wdrożenie przez CLI

```bash
# Zainstaluj Vercel CLI
npm install -g vercel

# Wdróż
vercel

# Dodaj zmienne środowiskowe
vercel env add VITE_GOOGLE_API_KEY
vercel env add VITE_GOOGLE_SPREADSHEET_ID
vercel env add VITE_APPS_SCRIPT_URL

# Redeploy z nowymi zmiennymi
vercel --prod
```

## Opcja 2: Netlify

### Automatyczne wdrożenie

1. **Wypchnij na GitHub** (jak wyżej)

2. **Netlify Dashboard:**

   - Przejdź do [netlify.com](https://netlify.com)
   - "Add new site" > "Import from Git"
   - Wybierz repozytorium

3. **Konfiguracja budowania:**

   - Build command: `npm run build`
   - Publish directory: `dist`

4. **Zmienne środowiskowe:**
   - Site settings > Build & deploy > Environment
   - Dodaj zmienne jak w Vercel

### Ręczne wdrożenie

```bash
# Zbuduj projekt
npm run build

# Zainstaluj Netlify CLI
npm install -g netlify-cli

# Wdróż
netlify deploy --prod --dir=dist
```

## Opcja 3: GitHub Pages

### Konfiguracja

1. **Zaktualizuj `vite.config.ts`:**

```typescript
export default defineConfig({
  base: "/budget-app/", // nazwa repozytorium
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

2. **Dodaj skrypt deploy w `package.json`:**

```json
{
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

3. **Zainstaluj gh-pages:**

```bash
npm install --save-dev gh-pages
```

4. **Wdróż:**

```bash
npm run deploy
```

5. **Konfiguracja GitHub:**
   - Settings > Pages
   - Source: Deploy from branch
   - Branch: gh-pages

**⚠️ UWAGA:** GitHub Pages nie obsługuje zmiennych środowiskowych. Będziesz musiał użyć innej metody konfiguracji.

## Opcja 4: Firebase Hosting

1. **Zainstaluj Firebase CLI:**

```bash
npm install -g firebase-tools
firebase login
```

2. **Inicjalizuj projekt:**

```bash
firebase init hosting
# Wybierz 'dist' jako public directory
# Konfiguruj jako single-page app: Yes
```

3. **Zbuduj i wdróż:**

```bash
npm run build
firebase deploy
```

4. **Zmienne środowiskowe:**
   - Dodaj zmienne w Firebase Console
   - Lub użyj Firebase Config

## ⚙️ Zmienne środowiskowe w produkcji

### Bezpieczne praktyki:

1. **NIE commituj pliku `.env`**

   - Jest już w `.gitignore`

2. **Używaj zmiennych środowiskowych platformy:**

   - Vercel/Netlify: Dashboard UI
   - GitHub Actions: Secrets
   - Firebase: Environment Config

3. **Ogranicz API Key:**
   - W Google Cloud Console
   - Credentials > API Key > Restrictions
   - Application restrictions: HTTP referrers
   - Dodaj domeny: `your-domain.vercel.app`

## 🔒 Zabezpieczenie Apps Script

Po wdrożeniu, zaktualizuj Apps Script aby akceptował tylko Twoje domeny:

```javascript
function doPost(e) {
  // Sprawdź origin
  const allowedOrigins = [
    "https://your-domain.vercel.app",
    "http://localhost:5173", // dla developmentu
  ];

  const origin = e.parameter.origin || "unknown";

  if (!allowedOrigins.includes(origin)) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: "Unauthorized origin" })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // ... reszta kodu
}
```

## 📊 Monitoring

### Vercel Analytics

```bash
npm install @vercel/analytics
```

```typescript
// src/main.tsx
import { Analytics } from "@vercel/analytics/react";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
```

## 🔄 Ciągłe wdrażanie (CI/CD)

### GitHub Actions przykład:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm install
      - run: npm run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID}}
          vercel-project-id: ${{ secrets.PROJECT_ID}}
```

## 🎯 Checklist przed wdrożeniem

- [ ] Wszystkie zmienne środowiskowe są ustawione
- [ ] Projekt buduje się bez błędów (`npm run build`)
- [ ] Apps Script jest wdrożony i działa
- [ ] API Key ma odpowiednie ograniczenia
- [ ] Arkusz Google jest udostępniony poprawnie
- [ ] Przetestowano formularza na różnych urządzeniach
- [ ] `.env` jest w `.gitignore`

## 📱 PWA (Progressive Web App) - Opcjonalne

Jeśli chcesz, aby aplikacja działała jak natywna aplikacja mobilna:

1. **Zainstaluj Vite PWA:**

```bash
npm install -D vite-plugin-pwa
```

2. **Zaktualizuj `vite.config.ts`:**

```typescript
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Budżet Domowy",
        short_name: "Budżet",
        description: "Zarządzaj wydatkami domowymi",
        theme_color: "#ffffff",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
```

## 🆘 Troubleshooting

### Błąd CORS

- Sprawdź Apps Script deployment
- Upewnij się, że "Who has access" = "Anyone"

### Zmienne środowiskowe nie działają

- Upewnij się, że zaczynają się od `VITE_`
- Zrestartuj serwer deweloperski
- W produkcji: sprawdź panel platformy

### Build fails

- Sprawdź błędy TypeScript: `npm run build`
- Sprawdź zależności: `npm install`
