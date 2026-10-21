import { test, expect } from '../../../fixtures/test-fixtures';
import { CreateUserPage } from '../../../pages/CreateUserPage';
import {
  getNewLoginUser,
  getMalformedEmail,
  getOverlongEmail,
} from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-559 sub-tasks TC-EML-001..TC-EML-007.
// Evidence rule: PASS screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-EML-001: valid email accepted', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  await users.createUser(getNewLoginUser());
  await users.expectOnUserList();
  await saveEvidence(adminPage, 'TC-EML-001');
});

test('TC-EML-002: invalid format blocked by the browser', async ({
  adminPage,
}) => {
  await new CreateUserPage(adminPage).expectBrowserBlocksInvalidEmail(
    getMalformedEmail(),
  );
  await saveEvidence(adminPage, 'TC-EML-002');
});

test('TC-EML-003: invalid format rejected server-side on direct POST', async ({
  adminPage,
}) => {
  const res = await new CreateUserPage(adminPage).probeDirectPost(
    getMalformedEmail(),
  );
  // Server must reject a malformed email with 400. A 303 to ?created=1 would
  // mean it accepted one (the defect this TC guards against); anything else
  // (403/500/…) fails loudly instead of passing vacuously.
  expect(res.status).toBe(400);
  await saveEvidence(adminPage, 'TC-EML-003');
});

test('TC-EML-004: empty email rejected', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  await users.openCreateForm();
  await adminPage.fill('input[name="empcode"]', 'E2EEMPTY');
  await adminPage.fill('input[name="password"]', 'Test@12345');
  await adminPage.getByRole('button', { name: 'Create User' }).click();
  await expect(adminPage).toHaveURL(/create-user/);
  await saveEvidence(adminPage, 'TC-EML-004');
});

test('TC-EML-005: duplicate email shows a clear error', async ({
  adminPage,
}) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  await users.createUser(data);
  const errText = await users.createUserExpectError(data);
  expect(errText.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-EML-005');
});

test('TC-EML-006: spaced/uppercase email normalized in list', async ({
  adminPage,
}) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  data.username = `  ${data.username.toUpperCase()}  `;
  await users.createUser(data);
  await users.expectUserInList(/e2e\.newuser\+.*@example\.com/i);
  await saveEvidence(adminPage, 'TC-EML-006');
});

test('TC-EML-007: overlong email handled gracefully (no 500)', async ({
  adminPage,
}) => {
  // KASSIST-596 regression: overlong email must show an inline form error,
  // not a raw JSON page, and must not create the user.
  test.slow();
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  data.username = getOverlongEmail();
  await users.fillForm(data);
  await highlight(adminPage, 'input[name="username"]', '#1d3a8a');
  await caption(adminPage, 'KASSIST-596 · Step 1', `Create User with a ${data.username.length}-character email (column allows 50). Other fields valid. Click Create User.`);
  await adminPage.getByRole('button', { name: 'Create User' }).click();
  const outcome = await Promise.race([
    adminPage
      .waitForURL('**/account_creation?created=1', { timeout: 15000 })
      .then(() => 'created'),
    adminPage
      .locator('.alert-error')
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => 'rejected'),
  ]).catch(() => 'neither');
  const body = (await adminPage.locator('body').innerText().catch(() => '')).trim();
  const rawJson = /^\s*\{\s*"detail"/.test(body) || body.includes('"detail"');
  const err = outcome === 'rejected' ? (await adminPage.locator('.alert-error').first().innerText()).trim() : '';
  console.log(`TC-EML-007 outcome=${outcome} url=${adminPage.url()} rawJson=${rawJson} error="${err}" body="${body.slice(0, 120)}"`);
  const ok = outcome === 'rejected' && !rawJson;
  if (ok) await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(
    adminPage,
    `KASSIST-596 · Step 2 · ${ok ? 'Result (FIXED)' : 'Actual result (BUG)'}`,
    ok
      ? `Inline red error on the same form: "${err}". No raw JSON, user not created.`
      : outcome === 'created'
        ? 'User was CREATED with the overlong email.'
        : `Raw page instead of the form: ${body.slice(0, 140)}`,
    ok ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-EML-007');
  expect(rawJson, 'raw JSON page shown').toBe(false);
  expect(outcome).toBe('rejected');
  await expect(adminPage.locator('input[name="username"]')).toBeVisible();
});

