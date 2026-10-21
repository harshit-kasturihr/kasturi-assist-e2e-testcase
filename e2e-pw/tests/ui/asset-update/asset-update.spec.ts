import { test, expect } from '../../../fixtures/test-fixtures';
import { AssetUpdatePage } from '../../../pages/AssetUpdatePage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1031 sub-tasks TC-AUP-001..TC-AUP-012.
// Standing rule: each TC creates its Asset (with Domain) + Employee
// assignee first (AssetUpdatePage.ensureAssetAndAssignee).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-AUP-001: asset update page loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  await aup.gotoViaUI();
  await expect(adminPage.locator('#serial_no')).toBeVisible();
  await expect(adminPage.locator('#asset-update-search-btn')).toBeVisible();
  await saveEvidence(adminPage, 'TC-AUP-001');
});

test('TC-AUP-002: search prefills current details', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset } = await aup.ensureAssetAndAssignee();
  await aup.searchAsset(asset.serial);
  const details = await aup.currentDetails();
  expect(details).not.toMatch(/Waiting for search/i);
  await saveEvidence(adminPage, 'TC-AUP-002');
});

test('TC-AUP-003: unknown serial handled', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  await aup.gotoViaUI();
  await adminPage.fill('#serial_no', 'NO-SUCH-SERIAL-XYZ-123');
  await adminPage.waitForTimeout(3000);
  const noOpt = await adminPage.locator('.asset-update-option').count() === 0;
  const status = await aup.statusText();
  expect(noOpt || /no serial numbers matched|not found|unable|no asset/i.test(status)).toBe(true);
  await saveEvidence(adminPage, 'TC-AUP-003');
});

test('TC-AUP-004: autocomplete suggests serials', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset } = await aup.ensureAssetAndAssignee();
  const picked = await aup.pickSuggestion(asset.serial.slice(0, 8));
  expect(picked.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-AUP-004');
});

test('TC-AUP-005: assign to employee saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset, employee } = await aup.ensureAssetAndAssignee();
  await aup.searchAsset(asset.serial);
  await aup.selectAssignee(employee.name);
  const msg = await aup.saveUpdate({});
  expect(msg).toMatch(/success|updated|assigned|saved/i);
  await aup.searchAsset(asset.serial);
  expect(await aup.currentDetails()).toContain(employee.name);
  await saveEvidence(adminPage, 'TC-AUP-005');
});

test('TC-AUP-006: location change saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset, employee } = await aup.ensureAssetAndAssignee();
  await aup.searchAsset(asset.serial);
  await aup.selectAssignee(employee.name);
  const msg = await aup.saveUpdate({ location: 'QA New Loc', note: 'QA move note' });
  expect(msg).toMatch(/success|updated|saved/i);
  await aup.searchAsset(asset.serial);
  expect(await aup.currentDetails()).toContain('QA New Loc');
  await saveEvidence(adminPage, 'TC-AUP-006');
});

test('TC-AUP-007: save without asset blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  await aup.gotoViaUI();
  const msg = await aup.saveUpdate({ location: 'QA Nowhere' });
  expect(msg).toMatch(/enter|select|serial|required|asset/i);
  await saveEvidence(adminPage, 'TC-AUP-007');
});

test('TC-AUP-008: history records entry', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset, employee } = await aup.ensureAssetAndAssignee();
  await aup.searchAsset(asset.serial);
  await aup.selectAssignee(employee.name);
  await aup.saveUpdate({ note: 'QA history check' });
  await aup.searchAsset(asset.serial);
  await aup.ensureHistoryOpen();
  const timeline = await aup.historyText();
  expect(timeline.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-AUP-008');
});

test('TC-AUP-009: history page not-found', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  // No-UI-path exception (documented): the standalone history error state
  // has no list-page entry point — addressed directly.
  await adminPage.goto('/asset-history?serial_no=NO-SUCH-SERIAL-XYZ-123');
  await expect(adminPage.getByText(/Asset not found/i)).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-AUP-009');
});

test('TC-AUP-010: history toggle works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset, employee } = await aup.ensureAssetAndAssignee();
  await aup.searchAsset(asset.serial);
  await aup.selectAssignee(employee.name);
  await aup.saveUpdate({ note: 'QA toggle check' });
  await aup.searchAsset(asset.serial);
  // Suggestion-click auto-opens history; toggle it closed then open again.
  expect(await aup.closeHistory()).toBe(true);
  await aup.ensureHistoryOpen();
  await saveEvidence(adminPage, 'TC-AUP-010');
});

test('TC-AUP-011: QR present in details API', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset } = await aup.ensureAssetAndAssignee();
  // The update page itself renders no QR visual; the prefill details API
  // carries the QR payload — assert it is present and non-empty.
  const resp = await adminPage.request.get(
    `/api/asset-update/details?serial_no=${encodeURIComponent(asset.serial)}`,
  );
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body?.data?.qr).toBeTruthy();
  await aup.searchAsset(asset.serial);
  await saveEvidence(adminPage, 'TC-AUP-011');
});

test('TC-AUP-012: reassign to another employee', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const aup = new AssetUpdatePage(adminPage);
  const first = await aup.ensureAssetAndAssignee();
  const second = await aup.ensureAssetAndAssignee();
  // Use second run's asset, assign first to empA then empB.
  await aup.searchAsset(second.asset.serial);
  await aup.selectAssignee(first.employee.name);
  await aup.saveUpdate({});
  await aup.searchAsset(second.asset.serial);
  await aup.selectAssignee(second.employee.name);
  await aup.saveUpdate({});
  await aup.searchAsset(second.asset.serial);
  expect(await aup.currentDetails()).toContain(second.employee.name);
  await saveEvidence(adminPage, 'TC-AUP-012');
});

test('TC-AUP-013: typed serial + Search button loads asset (KASSIST-1044)', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const aup = new AssetUpdatePage(adminPage);
  const { asset } = await aup.ensureAssetAndAssignee();
  await aup.gotoViaUI();
  // Type the full serial and use the Search button — no suggestion click.
  await adminPage.fill('#serial_no', asset.serial);
  const [resp] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes('/api/asset-update/details'), { timeout: 30000 }),
    adminPage.locator('#asset-update-search-btn').click(),
  ]);
  console.log(`details API: ${resp.status()} ${resp.url().replace(/^.*\/api/, '/api')}`);
  expect(resp.status()).toBe(200);
  await expect(adminPage.locator('#current-source')).not.toContainText(/Waiting for search/i, { timeout: 20000 });
  expect(await aup.statusText()).not.toMatch(/Unable to find asset/i);
  await saveEvidence(adminPage, 'TC-AUP-013');
});
