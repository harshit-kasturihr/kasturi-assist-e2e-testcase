# Playwright E2E Automation (POM + API layer)

Migrated from flat `setup.ts` + `utils/admin.ts` into a scalable structure.

## Structure

```text
tests/e2e-pw/
├── tests/
│   ├── ui/
│   │   ├── auth/login.spec.ts        # login + dashboard (migrated from check-url-navigation.spec.ts)
│   │   ├── company/company.spec.ts   # company tab smoke
│   │   └── location/location.spec.ts # migrated from tests/master/my-company/add-location.spec.ts
│   └── api/
│       ├── auth.api.spec.ts          # POST /login reachability
│       └── company.api.spec.ts       # company page reachability
├── pages/            # Page Objects
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── CompanyPage.ts
│   └── LocationPage.ts
├── fixtures/test-fixtures.ts  # adminPage + page-object fixtures (replaces setup.ts)
├── api/              # API layer (ApiClient, AuthApi, CompanyApi)
├── test-data/        # users.json, company.json, locations.json
├── types/            # user/company/location types
├── utils/            # commonUtils, dateUtils, testData (+ legacy admin.ts shim)
├── constants/        # routes, messages
├── config/           # env.ts + dev.env + qa.env (TEST_ENV=dev|qa)
├── auth/             # admin.json storageState (gitignored, generated on first run)
├── reports/ screenshots/ videos/ traces/
├── setup.ts          # deprecated re-export shim (use fixtures/test-fixtures.ts)
├── playwright.config.ts
├── tsconfig.json
└── package.json
```

## Env / config

* `config/env.ts` loads (lowest → highest): repo root `../../.env` → `config/<TEST_ENV>.env` → process env.
* `APP_URL` default `http://localhost:5003`. `ADMIN_USERNAME`/`ADMIN_PASSWORD` default to `test-data/users.json` admin.
* Run with: `TEST_ENV=qa npx playwright test` to use `config/qa.env`.

## Auth

* First run logs in via `LoginPage` and writes `auth/admin.json`.
* Legacy `.state/admin-auth.json` is still accepted as fallback.
* `auth/admin.json` is gitignored; never commit real sessions.

## Scripts

```bash
npm run test        # all
npm run test:ui     # tests/ui only
npm run test:api    # tests/api only
npm run lint        # tsc --noEmit
```

## Migration notes

* `tests/check-url-navigation.spec.ts` → `tests/ui/auth/login.spec.ts`
* `tests/master/my-company/add-location.spec.ts` → `tests/ui/location/location.spec.ts` (via `LocationPage.addLocation()`)
* `utils/admin.ts:loginAsAdmin()` → `pages/LoginPage.loginAsAdmin()` (old export kept as wrapper)
* `setup.ts:adminPage` → `fixtures/test-fixtures.ts:adminPage` (old file kept as re-export shim)
