import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { CompanyPage } from '../pages/CompanyPage';
import { LocationPage } from '../pages/LocationPage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AUTH_STATE_PATH = path.resolve(__dirname, '../auth/admin.json');
// Back-compat: old location used by setup.ts / playwright.config.ts
export const LEGACY_AUTH_STATE_PATH = path.resolve(
  __dirname,
  '../.state/admin-auth.json',
);

export interface AdminPage extends Page {
  fillInTinymce: (iframeSelector: string, content: string) => Promise<void>;
}

type Fixtures = {
  adminPage: AdminPage;
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  companyPage: CompanyPage;
  locationPage: LocationPage;
};

function isValidAuthFile(p: string): boolean {
  try {
    const stat = fs.statSync(p);
    if (stat.size < 10) return false;
    const json = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
      cookies?: unknown[];
      origins?: unknown[];
    };
    return Array.isArray(json.cookies) || Array.isArray(json.origins);
  } catch {
    return false;
  }
}

function resolveAuthPath(): string | undefined {
  if (isValidAuthFile(AUTH_STATE_PATH)) return AUTH_STATE_PATH;
  if (isValidAuthFile(LEGACY_AUTH_STATE_PATH)) return LEGACY_AUTH_STATE_PATH;
  return undefined;
}

export const test = base.extend<Fixtures>({
  adminPage: async ({ browser }, use, testInfo) => {
    const existing = resolveAuthPath();
    const context = await browser.newContext({
      ...(existing ? { storageState: existing } : {}),
      // Evidence rule: manually created contexts do NOT inherit use.video,
      // so record explicitly during evidence runs (E2E_VIDEO=on).
      ...(process.env.E2E_VIDEO === 'on'
        ? {
            recordVideo: {
              dir: `test-results/manual-video/${testInfo.title
                .replace(/[^\w-]+/g, '_')
                .slice(0, 80)}`,
            },
          }
        : {}),
    });
    const page = await context.newPage();

    if (!existing) {
      await new LoginPage(page).loginAsAdmin();
      fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
      await context.storageState({ path: AUTH_STATE_PATH });
    } else {
      await page.goto('/home');
    }

    if (page.url().includes('/login')) {
      await new LoginPage(page).loginAsAdmin();
      fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
      await context.storageState({ path: AUTH_STATE_PATH });
    }

    await use(page as AdminPage);
    await context.close();
    // test-results/ is wiped on every run — keep a copy of the video next
    // to the screenshots in evidence/ so it can still be attached to Jira.
    const video = page.video();
    if (video) {
      const id = (testInfo.title.match(/^[A-Z]+(?:-[A-Z]+)*-\d+/) || [testInfo.title.replace(/[^\w-]+/g, '_').slice(0, 60)])[0];
      const status = testInfo.status === testInfo.expectedStatus ? 'pass' : 'fail';
      await video.saveAs(path.resolve(__dirname, `../evidence/${id}-${status}.webm`)).catch(() => null);
    }
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  companyPage: async ({ page }, use) => {
    await use(new CompanyPage(page));
  },

  locationPage: async ({ page }, use) => {
    await use(new LocationPage(page));
  },
});

export { expect };
