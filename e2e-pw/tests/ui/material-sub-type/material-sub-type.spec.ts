import { test, expect } from '../../../fixtures/test-fixtures';
import { MaterialSubTypePage } from '../../../pages/MaterialSubTypePage';
import { getNewMaterialSubType } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-828 sub-tasks TC-MST-001..TC-MST-012 + TC-MST-018.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-MST-001: material sub type list loads', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  await mst.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/material-sub-types/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-MST-001');
});

test('TC-MST-002: valid material sub type add works', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await saveEvidence(adminPage, 'TC-MST-002');
});

test('TC-MST-003: empty name blocked', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  await mst.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-sub-types/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Material Sub Type' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-MST-003');
});

test('TC-MST-004: whitespace-only name blocked', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  await mst.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-sub-types/add"]').click();
  await adminPage.fill('input[name="name"]', '   ');
  await adminPage.getByRole('button', { name: 'Add Material Sub Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 10000 },
  );
  await saveEvidence(adminPage, 'TC-MST-004');
});

test('TC-MST-005: exact duplicate rejected', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await mst.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-sub-types/add"]').click();
  await adminPage.fill('input[name="name"]', data.name);
  await adminPage.getByRole('button', { name: 'Add Material Sub Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 10000 },
  );
  // Still exactly one row — never silent duplicates.
  await mst.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await expect(mst.row(data.name)).toHaveCount(1);
  await saveEvidence(adminPage, 'TC-MST-005');
});

test('TC-MST-006: case/space-variant duplicate rejected', async ({
  adminPage,
}) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await mst.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/material-sub-types/add"]').click();
  // Uniqueness is strip()+lowercase server-side: padded + lowercased twin
  // must be rejected too.
  await adminPage.fill('input[name="name"]', `  ${data.name.toLowerCase()}  `);
  await adminPage.getByRole('button', { name: 'Add Material Sub Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 10000 },
  );
  await mst.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await expect(mst.row(data.name)).toHaveCount(1);
  await saveEvidence(adminPage, 'TC-MST-006');
});

test('TC-MST-007: edit material sub type saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await mst.openEdit(data.name);
  const updated = `QA MST Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Material Sub Type' }).click();
  await adminPage.waitForURL('**/material-sub-types', { timeout: 30000, waitUntil: 'commit' });
  // Already on the list after redirect — search inline instead of a fresh
  // gotoViaUI cycle (saves a full /home load under CPU pressure).
  await adminPage.fill('#data-search', updated);
  await expect(mst.row(updated).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MST-007');
});

test('TC-MST-008: rename onto another row rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const mst = new MaterialSubTypePage(adminPage);
  const rowA = getNewMaterialSubType();
  const rowB = getNewMaterialSubType();
  await mst.addMaterialType(rowA.name);
  await mst.addMaterialType(rowB.name);
  await mst.openEdit(rowA.name);
  await adminPage.fill('input[name="name"]', rowB.name);
  await adminPage.getByRole('button', { name: 'Update Material Sub Type' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /already exists/i,
    { timeout: 10000 },
  );
  // Row A unchanged.
  await mst.expectRowVisible(rowA.name);
  await saveEvidence(adminPage, 'TC-MST-008');
});

test('TC-MST-009: delete test material sub type removes', async ({
  adminPage,
}) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await mst.deleteMaterialType(data.name);
  await saveEvidence(adminPage, 'TC-MST-009');
});

test('TC-MST-010: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  // Plain list, no search fill: the 300s list cache must have been
  // invalidated by the write, so the row shows immediately.
  await mst.gotoViaUI();
  await expect(mst.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MST-010');
});

test('TC-MST-011: search filters material sub type rows', async ({
  adminPage,
}) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await mst.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-mtp-xyz');
  await expect(mst.row(data.name)).toHaveCount(0);
  await adminPage.fill('#data-search', data.name);
  await expect(mst.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MST-011');
});

test('TC-MST-012: sorting reorders material sub type rows', async ({
  adminPage,
}) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const asc = await mst.sortAndReadFirstColumn('asc');
  const desc = await mst.sortAndReadFirstColumn('desc');
  expect(asc.length).toBeGreaterThan(1);
  // Same items, different order (exact collation is app-defined).
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-MST-012');
});

test('TC-MST-018: print view renders', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const data = getNewMaterialSubType();
  await mst.addMaterialType(data.name);
  await mst.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-MST-018');
});

test('TC-MST-019: multi-word search keeps cells readable (KASSIST-987)', async ({ adminPage }) => {
  test.slow();
  const mst = new MaterialSubTypePage(adminPage);
  const name = `QA Ms ${Date.now().toString().slice(-6)} A`;
  await mst.addMaterialType(name);
  await mst.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => mst.row(n), bugKey: 'KASSIST-987', tcId: 'TC-MST-019', screen: 'Material Sub Type' });
});
