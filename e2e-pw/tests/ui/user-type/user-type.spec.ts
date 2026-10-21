import { test, expect } from '../../../fixtures/test-fixtures';
import { UserTypePage } from '../../../pages/UserTypePage';
import { getNewUserType } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-965 sub-tasks TC-UTP-001..TC-UTP-016.
// Protected system defaults carry no edit/delete controls (lock icon);
// their routes are additionally guarded server-side.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-UTP-001: user types list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  await utp.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/user-types/add"]'),
  ).toBeVisible();
  await expect(adminPage.getByText(/protected default/i).first()).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-UTP-001');
});

test('TC-UTP-002: valid user type add works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await saveEvidence(adminPage, 'TC-UTP-002');
});

test('TC-UTP-003: empty name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  await utp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/user-types/add"]').click();
  await adminPage.getByRole('button', { name: 'Add User Type' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector('input[name="name"]') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  const serverErr = await adminPage
    .locator('.form-error-text')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  expect(msg || serverErr).toBeTruthy();
  await saveEvidence(adminPage, 'TC-UTP-003');
});

test('TC-UTP-004: whitespace name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  await utp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/user-types/add"]').click();
  await adminPage.fill('input[name="name"]', '   ');
  await adminPage.getByRole('button', { name: 'Add User Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-UTP-004');
});

test('TC-UTP-005: duplicate rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/user-types/add"]').click();
  await adminPage.fill('input[name="name"]', data.name);
  await adminPage.getByRole('button', { name: 'Add User Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 15000 },
  );
  await utp.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await expect(utp.row(data.name)).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-UTP-005');
});

test('TC-UTP-006: protected-name duplicate message', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  await utp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/user-types/add"]').click();
  await adminPage.fill('input[name="name"]', 'Admin');
  await adminPage.getByRole('button', { name: 'Add User Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /protected default/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-UTP-006');
});

test('TC-UTP-007: edit user type saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.openEdit(data.name);
  const updated = `QA UTP Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="name"]', updated);
  await adminPage.getByRole('button', { name: 'Update User Type' }).click();
  await adminPage.waitForURL('**/user-types', { timeout: 30000, waitUntil: 'commit' });
  await utp.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-UTP-007');
});

test('TC-UTP-008: edit empty-name rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.openEdit(data.name);
  await adminPage.evaluate(() => {
    const input = document.querySelector('input[name="name"]') as HTMLInputElement | null;
    input?.removeAttribute('required');
    if (input) input.value = '';
  });
  await adminPage.getByRole('button', { name: 'Update User Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await utp.expectRowVisible(data.name);
  await saveEvidence(adminPage, 'TC-UTP-008');
});

test('TC-UTP-009: edit-to-duplicate rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const rowA = getNewUserType();
  const rowB = getNewUserType();
  await utp.addUserType(rowA.name);
  await utp.addUserType(rowB.name);
  await utp.openEdit(rowA.name);
  await adminPage.fill('input[name="name"]', rowB.name);
  await adminPage.getByRole('button', { name: 'Update User Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 15000 },
  );
  await utp.expectRowVisible(rowA.name);
  await saveEvidence(adminPage, 'TC-UTP-009');
});

test('TC-UTP-010: delete custom type removes', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.deleteUserType(data.name);
  await adminPage.fill('#data-search', data.name);
  await saveEvidence(adminPage, 'TC-UTP-010');
});

test('TC-UTP-011: protected type has no delete control', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  await utp.gotoViaUI();
  await adminPage.fill('#data-search', 'Super Admin');
  const target = utp.row('Super Admin').first();
  await expect(target).toBeVisible({ timeout: 20000 });
  // Lock icon instead of edit/delete controls; the row stays.
  await expect(target.locator('button.delete-btn')).toHaveCount(0);
  await expect(target.locator('a.edit-btn[title="Edit"]')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-UTP-011');
});

test('TC-UTP-012: protected type has no edit control', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  await utp.gotoViaUI();
  await adminPage.fill('#data-search', 'Super Admin');
  const target = utp.row('Super Admin').first();
  await expect(target).toBeVisible({ timeout: 20000 });
  await expect(target.locator('a.edit-btn[title="Edit"]')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-UTP-012');
});

test('TC-UTP-013: search filters user type rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-utp-xyz');
  await expect(utp.row(data.name)).toHaveCount(0);
  await adminPage.fill('#data-search', data.name);
  await expect(utp.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-UTP-013');
});

test('TC-UTP-014: sorting reorders user type rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const asc = await utp.sortAndReadNames('asc');
  const desc = await utp.sortAndReadNames('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-UTP-014');
});

test('TC-UTP-015: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.gotoViaUI();
  await expect(utp.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-UTP-015');
});

test('TC-UTP-016: role-screens link reachable', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const utp = new UserTypePage(adminPage);
  const data = getNewUserType();
  await utp.addUserType(data.name);
  await utp.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await utp.row(data.name).first().locator('a[title="Manage Role Screens"]').click();
  await adminPage.waitForURL('**/role-screen-access*', { timeout: 30000, waitUntil: 'commit' });
  await expect(adminPage.locator('body')).toContainText(/role|screen|access/i);
  await saveEvidence(adminPage, 'TC-UTP-016');
});

test('TC-UTP-017: multi-word search keeps cells readable (KASSIST-991)', async ({ adminPage }) => {
  test.slow();
  const utp = new UserTypePage(adminPage);
  const name = `QA Ut ${Date.now().toString().slice(-6)} A`;
  await utp.addUserType(name);
  await utp.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => utp.row(n), bugKey: 'KASSIST-991', tcId: 'TC-UTP-017', screen: 'User Types' });
});
