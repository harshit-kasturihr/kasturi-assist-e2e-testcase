import { test, expect } from '../../../fixtures/test-fixtures';
import { DesignationPage } from '../../../pages/DesignationPage';
import { getNewDesignation } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-947 sub-tasks TC-DSG-001..TC-DSG-011 + TC-DSG-017.
// No cross-module prerequisites (name-only master).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-DSG-001: designation list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  await dsg.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/designations/add"]'),
  ).toBeVisible();
  if ((await adminPage.locator('tr.data-row').count()) > 0) {
    for (const col of ['DESIGNATION NAME', 'ACTION']) {
      await expect(adminPage.locator('th', { hasText: col }).first()).toBeVisible();
    }
  }
  await saveEvidence(adminPage, 'TC-DSG-001');
});

test('TC-DSG-002: valid designation add works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await saveEvidence(adminPage, 'TC-DSG-002');
});

test('TC-DSG-003: empty name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  await dsg.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/designations/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Designation' }).click();
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
  await saveEvidence(adminPage, 'TC-DSG-003');
});

test('TC-DSG-004: whitespace name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  await dsg.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/designations/add"]').click();
  await adminPage.fill('input[name="name"]', '   ');
  await adminPage.getByRole('button', { name: 'Add Designation' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-DSG-004');
});

test('TC-DSG-005: duplicate name outcome', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/designations/add"]').click();
  await adminPage.fill('input[name="name"]', data.name);
  await adminPage.getByRole('button', { name: 'Add Designation' }).click();
  await Promise.race([
    adminPage.locator('.form-error-text').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    adminPage.waitForURL('**/designations', { timeout: 15000 }).catch(() => null),
  ]);
  await dsg.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  // More than one row = silent duplicate = APPLICATION_BUG.
  await expect(dsg.row(data.name)).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-DSG-005');
});

test('TC-DSG-006: edit designation saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.openEdit(data.name);
  const updated = `QA Desig Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Designation' }).click();
  await adminPage.waitForURL('**/designations', { timeout: 30000, waitUntil: 'commit' });
  await dsg.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-DSG-006');
});

test('TC-DSG-007: edit empty-name rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.openEdit(data.name);
  await adminPage.evaluate(() => {
    const input = document.querySelector('input[name="name"]') as HTMLInputElement | null;
    input?.removeAttribute('required');
    if (input) input.value = '';
  });
  await adminPage.getByRole('button', { name: 'Update Designation' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await dsg.expectRowVisible(data.name);
  await saveEvidence(adminPage, 'TC-DSG-007');
});

test('TC-DSG-008: delete test designation removes', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.deleteDesignation(data.name);
  await saveEvidence(adminPage, 'TC-DSG-008');
});

test('TC-DSG-009: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.gotoViaUI();
  await expect(dsg.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-DSG-009');
});

test('TC-DSG-010: search filters designation rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-dsg-xyz');
  await expect(dsg.row(data.name)).toHaveCount(0);
  await adminPage.fill('#data-search', data.name);
  await expect(dsg.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-DSG-010');
});

test('TC-DSG-011: sorting reorders designation rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const asc = await dsg.sortAndReadNames('asc');
  const desc = await dsg.sortAndReadNames('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-DSG-011');
});

test('TC-DSG-017: print view renders', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dsg = new DesignationPage(adminPage);
  const data = getNewDesignation();
  await dsg.addDesignation(data.name);
  await dsg.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-DSG-017');
});

test('TC-DSG-018: multi-word search keeps cells readable (KASSIST-990)', async ({ adminPage }) => {
  test.slow();
  const dsg = new DesignationPage(adminPage);
  const name = `QA Dg ${Date.now().toString().slice(-6)} A`;
  await dsg.addDesignation(name);
  await dsg.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => dsg.row(n), bugKey: 'KASSIST-990', tcId: 'TC-DSG-018', screen: 'Designation' });
});
