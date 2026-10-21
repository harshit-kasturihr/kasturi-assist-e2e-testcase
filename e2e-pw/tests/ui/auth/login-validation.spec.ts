import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { DashboardPage } from '../../../pages/DashboardPage';
import { MESSAGES } from '../../../constants/messages';
import { ROUTES } from '../../../constants/routes';
import {
  getInvalidPasswordUser,
  getNonexistentUser,
  getThrottleProbeUser,
} from '../../../utils/testData';

// Covers KASSIST-547 sub-tasks TC-LOG-003..TC-LOG-008.
// TC-LOG-001 is covered by login.spec.ts; TC-LOG-002 needs a provisioned
// new-user account (test-data has admin only).
//
// Evidence rule: every TC captures a PASS screenshot into evidence/
// (video comes from the runner with E2E_VIDEO=on). Both are attached to
// the sub-task before PASS is recorded — no evidence, no PASS.

const __filename = fileURLToPath(import.meta.url);
const EVIDENCE_DIR = path.resolve(path.dirname(__filename), '../../../evidence');

async function snap(page: Page, tcId: string): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shot = path.join(EVIDENCE_DIR, `${tcId}-pass.png`);
  await page.screenshot({ path: shot, fullPage: true });
  return shot;
}

test('TC-LOG-003: invalid password is rejected with a clear error', async ({
  page,
  loginPage,
}) => {
  const creds = getInvalidPasswordUser();
  await loginPage.attemptLogin(creds.username, creds.password);
  await loginPage.expectInvalidCredentialsError();
  await snap(page, 'TC-LOG-003');
});

test('TC-LOG-004: non-existent username rejected without revealing it', async ({
  page,
  loginPage,
}) => {
  const creds = getNonexistentUser();
  await loginPage.attemptLogin(creds.username, creds.password);
  await loginPage.expectInvalidCredentialsError();
  await snap(page, 'TC-LOG-004');
});

test('TC-LOG-005: empty username/password blocked by validation', async ({
  page,
  loginPage,
}) => {
  await loginPage.expectRequiredValidation();
  await snap(page, 'TC-LOG-005');
});

test('TC-LOG-006: repeated failures trigger throttle lockout', async ({
  page,
  loginPage,
}) => {
  const probe = getThrottleProbeUser();
  for (let i = 0; i < 5; i++) {
    await loginPage.attemptLogin(probe.username, probe.password);
    await loginPage.expectInvalidCredentialsError();
  }
  await loginPage.attemptLogin(probe.username, probe.password);
  await loginPage.expectThrottleError();
  await snap(page, 'TC-LOG-006');
});

test('TC-LOG-007: session survives refresh but dies on cookie clear', async ({
  adminPage,
}) => {
  const dashboard = new DashboardPage(adminPage);
  await dashboard.expectLoaded();
  await adminPage.reload();
  await dashboard.expectLoaded();
  await adminPage.context().clearCookies();
  await adminPage.goto(ROUTES.home);
  await expect(adminPage.getByText(MESSAGES.signInHeading)).toBeVisible();
  await snap(adminPage, 'TC-LOG-007');
});

test('TC-LOG-008: unauthenticated /home access redirects to login', async ({
  page,
}) => {
  await page.goto(ROUTES.home);
  await expect(page.getByText(MESSAGES.signInHeading)).toBeVisible();
  await snap(page, 'TC-LOG-008');
});
