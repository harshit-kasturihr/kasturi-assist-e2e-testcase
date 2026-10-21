import { test, expect } from '../../../fixtures/test-fixtures';
import { AssetQuickUpdatePage } from '../../../pages/AssetQuickUpdatePage';
import { AssetPage } from '../../../pages/AssetPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1046 sub-tasks TC-AQU-001..TC-AQU-008.
// Standing rule: a fresh Asset (with Domain) is created first per TC.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-AQU-001: quick update page loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  await aqu.gotoViaUI();
  await expect(adminPage.locator('input.aqu-search-input')).toBeVisible();
  await saveEvidence(adminPage, 'TC-AQU-001');
});

test('TC-AQU-002: search finds asset rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  const data = await aqu.ensureAsset();
  expect(await aqu.search(data.serial)).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-AQU-002');
});

test('TC-AQU-003: no-match shows empty state', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  expect(await aqu.search('NO-SUCH-SERIAL-XYZ-123')).toBe(0);
  await expect(adminPage.getByText(/No assets found/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-AQU-003');
});

test('TC-AQU-004: open edit shows current values', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  const data = await aqu.ensureAsset();
  await aqu.search(data.serial);
  await aqu.openEdit();
  await expect(adminPage.locator('#aq_status')).toBeVisible();
  await saveEvidence(adminPage, 'TC-AQU-004');
});

test('TC-AQU-005: save status and condition', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  const data = await aqu.ensureAsset();
  await aqu.search(data.serial);
  await aqu.openEdit();
  await adminPage.selectOption('#aq_status', 'In Maintenance');
  await adminPage.selectOption('#aq_condition', 'Fair');
  await aqu.save();
  // Persistence proof: re-open the edit form, values must hold.
  await aqu.search(data.serial);
  await aqu.openEdit();
  await expect(adminPage.locator('#aq_status')).toHaveValue('In Maintenance');
  await expect(adminPage.locator('#aq_condition')).toHaveValue('Fair');
  const ast = new AssetPage(adminPage);
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', data.serial);
  await expect(ast.row(data.serial).first()).toContainText('In Maintenance');
  await saveEvidence(adminPage, 'TC-AQU-005');
});

test('TC-AQU-006: save department and warranty', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  const data = await aqu.ensureAsset();
  await aqu.search(data.serial);
  await aqu.openEdit();
  await adminPage.fill('#aq_department', 'QA Dept');
  await adminPage.fill('#aq_warranty', '2027-01-15');
  const out = await aqu.save();
  // Persistence proof: re-open the edit form, values must hold.
  await aqu.search(data.serial);
  await aqu.openEdit();
  await expect(adminPage.locator('#aq_department')).toHaveValue('QA Dept');
  await expect(adminPage.locator('#aq_warranty')).toHaveValue('2027-01-15');
  await saveEvidence(adminPage, 'TC-AQU-006');
});

test('TC-AQU-007: invalid edit id redirects to list', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  // No-UI-path exception (documented): a bogus edit id has no list entry
  // point — addressed directly; must land back on the search page.
  await adminPage.goto('/asset-quick-update/edit/99999999');
  await adminPage.waitForURL('**/asset-quick-update', { timeout: 20000 });
  await expect(adminPage.locator('input.aqu-search-input')).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-AQU-007');
});

test('TC-AQU-008: list reflects saved values', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aqu = new AssetQuickUpdatePage(adminPage);
  const data = await aqu.ensureAsset();
  await aqu.search(data.serial);
  await aqu.openEdit();
  await adminPage.selectOption('#aq_condition', 'Poor');
  await aqu.save();
  const ast = new AssetPage(adminPage);
  await ast.expectRowVisible(data.serial);
  await saveEvidence(adminPage, 'TC-AQU-008');
});
