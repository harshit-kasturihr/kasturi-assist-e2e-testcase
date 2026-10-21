import { test, expect } from '../../../fixtures/test-fixtures';
import { StoreLocationPage } from '../../../pages/StoreLocationPage';
import { getNewStoreLocation } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-778 sub-tasks TC-STL-001..TC-STL-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-STL-001: store location list loads', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  await locs.gotoViaUI();
  // Dev DB may hold zero rows — assert page chrome, not rows.
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/store-location/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-STL-001');
});

test('TC-STL-002: valid store location add works', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  const data = getNewStoreLocation();
  await locs.addLocation(data.name, data.description);
  await saveEvidence(adminPage, 'TC-STL-002');
});

test('TC-STL-003: empty location name blocked', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  await locs.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/store-location/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Store Location' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="store_location_name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-STL-003');
});

test('TC-STL-004: duplicate location handled', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  const data = getNewStoreLocation();
  await locs.addLocation(data.name, data.description);
  await locs.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/store-location/add"]').click();
  await adminPage.fill('input[name="store_location_name"]', data.name);
  await adminPage.fill('textarea[name="description"]', data.description);
  await adminPage.getByRole('button', { name: 'Add Store Location' }).click();
  // Either inline rejection or exactly one row — never silent duplicates.
  const rejected = await adminPage
    .locator('.alert-error, .form-error-text')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!rejected) {
    await locs.gotoViaUI();
    await adminPage.fill('#data-search', data.name);
    await expect(locs.row(data.name)).toHaveCount(1);
  }
  await saveEvidence(adminPage, 'TC-STL-004');
});

test('TC-STL-005: edit location saves', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  const data = getNewStoreLocation();
  await locs.addLocation(data.name, data.description);
  await locs.openEdit(data.name);
  const updated = `QA StoreLoc Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="store_location_name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Store Location' }).click();
  await adminPage.waitForURL('**/store-location', { timeout: 15000 });
  await locs.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-STL-005');
});

test('TC-STL-006: delete test location removes', async ({ adminPage }) => {
  // Lightweight by design: deleting reuses a leftover QA row from earlier
  // runs instead of add+delete in one test (halves heavy navigations —
  // this flow repeatedly killed the renderer on loaded machines).
  const locs = new StoreLocationPage(adminPage);
  await locs.gotoViaUI();
  await adminPage.fill('#data-search', 'QA StoreLoc');
  const target = locs.row('QA StoreLoc').first();
  await expect(target).toBeVisible({ timeout: 20000 });
  const name = ((await target.locator('td').first().textContent()) || '').trim();
  await target.locator('button.delete-btn').click();
  await expect(adminPage.getByText(/Are you sure you want to delete/i)).toBeVisible();
  await adminPage.locator('.confirm-yes').click({ noWaitAfter: true });
  await expect(locs.row(name)).toHaveCount(0, { timeout: 25000 });
  await saveEvidence(adminPage, 'TC-STL-006');
});

test('TC-STL-007: search filters location rows', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  const data = getNewStoreLocation();
  await locs.addLocation(data.name, data.description);
  await locs.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-location-xyz');
  await expect(locs.row(data.name)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-STL-007');
});

test('TC-STL-008: sorting reorders location rows', async ({ adminPage }) => {
  const locs = new StoreLocationPage(adminPage);
  await locs.gotoViaUI();
  const read = async (v: 'asc' | 'desc'): Promise<string[]> => {
    await adminPage.selectOption('#sort-filter', v);
    await adminPage.waitForTimeout(800);
    return adminPage.locator('tr.data-row td:first-child').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  };
  const asc = await read('asc');
  const desc = await read('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect(desc).toEqual([...asc].reverse());
  await saveEvidence(adminPage, 'TC-STL-008');
});

test('TC-STL-012: multi-word search keeps cells readable (KASSIST-995)', async ({ adminPage }) => {
  test.slow();
  const stl = new StoreLocationPage(adminPage);
  const name = `QA Sl ${Date.now().toString().slice(-6)} A`;
  await stl.addLocation(name, 'QA automation test store location');
  await stl.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => stl.row(n), bugKey: 'KASSIST-995', tcId: 'TC-STL-012', screen: 'Store Location' });
});
