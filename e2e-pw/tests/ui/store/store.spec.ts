import { test, expect } from '../../../fixtures/test-fixtures';
import { StorePage } from '../../../pages/StorePage';
import { getNewStore } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-752 sub-tasks TC-STR-001..TC-STR-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-STR-001: store list loads', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  await stores.gotoViaUI();
  // Dev DB may hold zero stores — assert page chrome, not rows.
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/store/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-STR-001');
});

test('TC-STR-002: valid store add works', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  const data = getNewStore();
  await stores.addStore(data.name, data.description);
  await saveEvidence(adminPage, 'TC-STR-002');
});

test('TC-STR-003: empty store name blocked', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  await stores.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/store/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Store' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="store_name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-STR-003');
});

test('TC-STR-004: duplicate store handled', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  const data = getNewStore();
  await stores.addStore(data.name, data.description);
  await stores.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/store/add"]').click();
  await adminPage.fill('input[name="store_name"]', data.name);
  await adminPage.fill('textarea[name="description"]', data.description);
  await adminPage.getByRole('button', { name: 'Add Store' }).click();
  // Duplicate names are rejected inline (no navigation) — assert the message.
  await expect(adminPage.getByText(/already exists/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-STR-004');
});

test('TC-STR-005: edit store saves', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  const data = getNewStore();
  await stores.addStore(data.name, data.description);
  await stores.openEdit(data.name);
  const updated = `QA Store Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="store_name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Store' }).click();
  await adminPage.waitForURL('**/store', { timeout: 15000 });
  await stores.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-STR-005');
});

test('TC-STR-006: delete test store removes', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  const data = getNewStore();
  await stores.addStore(data.name, data.description);
  await stores.deleteStore(data.name);
  await saveEvidence(adminPage, 'TC-STR-006');
});

test('TC-STR-007: search filters store rows', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  const data = getNewStore();
  await stores.addStore(data.name, data.description);
  await stores.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-store-xyz');
  await expect(stores.row(data.name)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-STR-007');
});

test('TC-STR-008: pager navigates when multiple pages exist', async ({
  adminPage,
}) => {
  const stores = new StorePage(adminPage);
  await stores.gotoViaUI();
  const next = adminPage.locator('.pagination-controls a', { hasText: 'Next' });
  const nextEnabled =
    (await next.count()) > 0 &&
    (await next.first().getAttribute('disabled')) === null &&
    !((await next.first().getAttribute('class')) || '').includes('disabled');
  if (!nextEnabled) {
    test.skip(true, 'Only one page of stores — pager has no active Next.');
  }
  const firstPage1 = ((await adminPage.locator('tr.data-row td:nth-child(2)').first().textContent()) || '').trim();
  await next.first().click();
  const firstPage2 = ((await adminPage.locator('tr.data-row td:nth-child(2)').first().textContent()) || '').trim();
  expect(firstPage1.length).toBeGreaterThan(0);
  expect(firstPage2).not.toBe(firstPage1);
  await saveEvidence(adminPage, 'TC-STR-008');
});

test('TC-STR-013: multi-word search keeps cells readable (KASSIST-994)', async ({ adminPage }) => {
  test.slow();
  const st = new StorePage(adminPage);
  const name = `QA St ${Date.now().toString().slice(-6)} A`;
  await st.addStore(name, 'QA automation test store');
  await st.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => st.row(n), bugKey: 'KASSIST-994', tcId: 'TC-STR-013', screen: 'Store' });
});
