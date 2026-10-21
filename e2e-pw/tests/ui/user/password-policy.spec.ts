import { test } from '../../../fixtures/test-fixtures';
import { CreateUserPage } from '../../../pages/CreateUserPage';
import { getNewLoginUser } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-560 sub-tasks TC-PWD-001..TC-PWD-008 (create-user path).
// Server policy: services/user_service.validate_password_policy (KASSIST-605
// fix). Rejection TCs bypass the browser length check so the server rule is
// what's verified; a created user means FAIL.
// TC-PWD-007 needs an OTP-verified challenge → skipped until Graph creds land.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

// Narrated evidence runs add caption pauses — allow extra time.
test.beforeEach(() => test.slow());

async function attemptWeakPassword(
  users: CreateUserPage,
  password: string,
  tc = '',
  rule = '',
): Promise<void> {
  const page = users.page;
  const data = getNewLoginUser();
  data.password = password;
  await users.fillForm(data);
  // Typing is capped by maxlength=64, so set the raw value directly — the
  // SERVER must reject over-long passwords too.
  await page.evaluate((pw) => {
    document.querySelectorAll<HTMLInputElement>('input[name="password"], input[name="confirm_password"]').forEach((el) => { el.value = pw; });
  }, password);
  await highlight(page, 'input[name="password"]', '#1d3a8a');
  const shown = password.length > 30 ? `${password.slice(0, 24)}… (${password.length} chars)` : password;
  await caption(page, `KASSIST-605 · ${tc} · Step 1`, `Create User with password "${shown}" — ${rule}. Click Create User (browser length check bypassed, so the SERVER must reject).`);
  await users.submitExpectReject();
  const err = ((await page.locator('.alert-error').first().innerText().catch(() => '')) || '').trim();
  await highlight(page, '.alert-error', '#12b76a');
  await caption(page, `KASSIST-605 · ${tc} · Result (FIXED)`, `User NOT created. Error shown: "${err}"`, 'pass');
}

test('TC-PWD-001: valid strong password accepted', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  data.password = 'Abc123!@#9';
  await users.fillForm(data);
  await caption(adminPage, 'KASSIST-605 · TC-PWD-001 · Control', 'Strong password "Abc123!@#9" (meets every rule). Click Create User.');
  await adminPage.getByRole('button', { name: 'Create User' }).click();
  await users.expectOnUserList();
  await caption(adminPage, 'KASSIST-605 · TC-PWD-001 · Result', 'Strong password accepted - user created.', 'pass');
  await saveEvidence(adminPage, 'TC-PWD-001');
});

test('TC-PWD-002: under-8-char password rejected', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  await attemptWeakPassword(users, 'Ab1!', 'TC-PWD-002', 'shorter than 8 characters');
  await saveEvidence(adminPage, 'TC-PWD-002');
});

test('TC-PWD-003: over-64-char password rejected', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  await attemptWeakPassword(users, `Aa1!${'x'.repeat(70)}`, 'TC-PWD-003', 'longer than 64 characters');
  await saveEvidence(adminPage, 'TC-PWD-003');
});

test('TC-PWD-004: missing char-class password rejected', async ({
  adminPage,
}) => {
  const users = new CreateUserPage(adminPage);
  await attemptWeakPassword(users, 'abcdefgh', 'TC-PWD-004', 'no uppercase, digit or special character');
  await saveEvidence(adminPage, 'TC-PWD-004');
});

test('TC-PWD-005: spaced password rejected', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  await attemptWeakPassword(users, 'Abc 123!x', 'TC-PWD-005', 'contains a space');
  await saveEvidence(adminPage, 'TC-PWD-005');
});

test('TC-PWD-006: common password rejected', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  await attemptWeakPassword(users, 'Password123!', 'TC-PWD-006', 'common/weak password');
  await saveEvidence(adminPage, 'TC-PWD-006');
});

test.skip(
  'TC-PWD-007: mismatched confirm rejected (needs OTP-verified challenge)',
  async () => {},
);

test('TC-PWD-008: username-as-password rejected', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  // Username that satisfies every OTHER rule (upper/lower/digit/special,
  // 8-64, no spaces) so only the username==password rule can reject it.
  data.username = `Qa1!user${Date.now().toString().slice(-6)}@example.com`;
  data.password = data.username;
  await users.fillForm(data);
  await users.page.evaluate(() => document.querySelectorAll('form').forEach((f) => { f.noValidate = true; }));
  await caption(adminPage, 'KASSIST-605 · TC-PWD-008 · Step 1', `Create User with password = username "${data.username}". Click Create User (browser length check bypassed, so the SERVER must reject).`);
  await users.submitExpectReject();
  const err = ((await adminPage.locator('.alert-error').first().innerText().catch(() => '')) || '').trim();
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'KASSIST-605 · TC-PWD-008 · Result (FIXED)', `User NOT created. Error shown: "${err}"`, 'pass');
  await saveEvidence(adminPage, 'TC-PWD-008');
});
