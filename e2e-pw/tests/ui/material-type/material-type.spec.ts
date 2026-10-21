import { test, expect } from '../../../fixtures/test-fixtures';
import { MaterialTypePage } from '../../../pages/MaterialTypePage';
import { getNewMaterialType } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-828 sub-tasks TC-MTP-001..TC-MTP-012 + TC-MTP-018.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-MTP-001: material type list loads', async ({ adminPage }) => {
  const mtp = new MaterialTypePage(adminPage);
  await mtp.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/material-types/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-MTP-001');
});

test('TC-MTP-002: valid material type add works', async ({ adminPage }) => {
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await saveEvidence(adminPage, 'TC-MTP-002');
});

test('TC-MTP-003: empty name blocked', async ({ adminPage }) => {
  const mtp = new MaterialTypePage(adminPage);
  await mtp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-types/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Material Type' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-MTP-003');
});

test('TC-MTP-004: whitespace-only name blocked', async ({ adminPage }) => {
  const mtp = new MaterialTypePage(adminPage);
  await mtp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-types/add"]').click();
  await adminPage.fill('input[name="name"]', '   ');
  await adminPage.getByRole('button', { name: 'Add Material Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 10000 },
  );
  await saveEvidence(adminPage, 'TC-MTP-004');
});

test('TC-MTP-005: exact duplicate rejected', async ({ adminPage }) => {
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await mtp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-types/add"]').click();
  await adminPage.fill('input[name="name"]', data.name);
  await adminPage.getByRole('button', { name: 'Add Material Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 10000 },
  );
  // Still exactly one row — never silent duplicates.
  await mtp.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await expect(mtp.row(data.name)).toHaveCount(1);
  await saveEvidence(adminPage, 'TC-MTP-005');
});

test('TC-MTP-006: case/space-variant duplicate rejected', async ({
  adminPage,
}) => {
  test.slow();
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await mtp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-types/add"]').click();
  // Uniqueness is strip()+lowercase server-side: padded + lowercased twin
  // must be rejected too.
  await adminPage.fill('input[name="name"]', `  ${data.name.toLowerCase()}  `);
  await adminPage.getByRole('button', { name: 'Add Material Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 10000 },
  );
  await mtp.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await expect(mtp.row(data.name)).toHaveCount(1);
  await saveEvidence(adminPage, 'TC-MTP-006');
});

test('TC-MTP-007: edit material type saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await mtp.openEdit(data.name);
  const updated = `QA MTP Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Material Type' }).click();
  await adminPage.waitForURL('**/material-types', { timeout: 30000, waitUntil: 'commit' });
  // Already on the list after redirect — search inline instead of a fresh
  // gotoViaUI cycle (saves a full /home load under CPU pressure).
  await adminPage.fill('#data-search', updated);
  await expect(mtp.row(updated).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MTP-007');
});

test('TC-MTP-008: rename onto another row rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const mtp = new MaterialTypePage(adminPage);
  const rowA = getNewMaterialType();
  const rowB = getNewMaterialType();
  await mtp.addMaterialType(rowA.name);
  await mtp.addMaterialType(rowB.name);
  await mtp.openEdit(rowA.name);
  await adminPage.fill('input[name="name"]', rowB.name);
  await adminPage.getByRole('button', { name: 'Update Material Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 10000 },
  );
  // Row A unchanged.
  await mtp.expectRowVisible(rowA.name);
  await saveEvidence(adminPage, 'TC-MTP-008');
});

test('TC-MTP-009: delete test material type removes', async ({
  adminPage,
}) => {
  test.slow();
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await mtp.deleteMaterialType(data.name);
  await saveEvidence(adminPage, 'TC-MTP-009');
});

test('TC-MTP-010: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  // Plain list, no search fill: the 300s list cache must have been
  // invalidated by the write, so the row shows immediately.
  await mtp.gotoViaUI();
  await expect(mtp.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MTP-010');
});

test('TC-MTP-011: search filters material type rows', async ({
  adminPage,
}) => {
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await mtp.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-mtp-xyz');
  await expect(mtp.row(data.name)).toHaveCount(0);
  await adminPage.fill('#data-search', data.name);
  await expect(mtp.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MTP-011');
});

test('TC-MTP-012: sorting reorders material type rows', async ({
  adminPage,
}) => {
  const mtp = new MaterialTypePage(adminPage);
  const asc = await mtp.sortAndReadFirstColumn('asc');
  const desc = await mtp.sortAndReadFirstColumn('desc');
  expect(asc.length).toBeGreaterThan(1);
  // Same items, different order (exact collation is app-defined).
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-MTP-012');
});

test('TC-MTP-018: print view renders', async ({ adminPage }) => {
  const mtp = new MaterialTypePage(adminPage);
  const data = getNewMaterialType();
  await mtp.addMaterialType(data.name);
  await mtp.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-MTP-018');
});

test('TC-MTP-019: multi-word search keeps cells readable (KASSIST-986)', async ({ adminPage }) => {
  test.slow();
  const mtp = new MaterialTypePage(adminPage);
  const name = `QA Mt ${Date.now().toString().slice(-6)} A`;
  await mtp.addMaterialType(name);
  await mtp.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => mtp.row(n), bugKey: 'KASSIST-986', tcId: 'TC-MTP-019', screen: 'Material Type' });
});
