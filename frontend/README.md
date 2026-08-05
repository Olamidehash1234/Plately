# Plately web client

React + TypeScript single-page app for the food classification and dietary
monitoring system: signup and login, meal capture, the classification result,
the daily dashboard and the meal journal.

## Setup

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_URL, if the API is not on localhost:8000
```

## Running

```bash
npm run dev               # http://localhost:5173
```

The API must be running as well — see `../backend/README.md`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck (`tsc -b`) then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Re-run tests as files change |
| `npm run lint` | Oxlint |

## Layout

```
src/
  lib/
    api.ts         typed client for every endpoint, plus token storage
    auth.tsx       AuthProvider and useAuth
    useApi.ts      loading/error/reload wrapper for a fetch
    format.ts      date, time and percentage helpers
  components/
    layout/        AppShell — top bar, mobile menu, bottom nav
    plately/       app-specific pieces (MacroBar, …)
    ui/            shadcn-style primitives
    ProtectedRoute.tsx
  pages/           one file per route
  test/            setup file and shared fixtures
```

## Tests

Vitest with Testing Library, in a jsdom environment. Test files sit beside the
code they cover, as `*.test.ts(x)`.

```bash
npm test
npm test -- src/pages/Classify.test.tsx     # one file
```

They cover the API client's error handling, the auth provider's session
lifecycle, route protection, and each page's main flows — sign-up and login,
capture and classify, the dashboard, the journal (including delete and
paging), the result screen's portion edit and class correction, and the
profile's goal editing. The network is mocked at `fetch` or at the `api`
module, so no backend is needed to run them.

Backend tests live in `../backend/tests` and run with pytest.
