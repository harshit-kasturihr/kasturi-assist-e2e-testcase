import { test, expect } from '../../../fixtures/test-fixtures';
import { ClientPage } from '../../../pages/ClientPage';
import { ProductPage } from '../../../pages/ProductPage';
import { VendorPage } from '../../../pages/VendorPage';
import { StorePage } from '../../../pages/StorePage';
import { UserListPage } from '../../../pages/UserListPage';
import { saveEvidence } from '../../../utils/evidence';

// Date-filter sweep: TC-SRT-007 (client), TC-SRT-008 (product), TC-SRT-009
// (users — rows carry no dates, so past-filters empty the table gracefully).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const asTime = (d: string): number => new Date(d).getTime();

async function expectRecentDescending(dates: string[]): Promise<void> {
  const valid = dates.filter((d) => !Number.isNaN(asTime(d)));
  expect(valid.length).toBeGreaterThan(0);
  for (let i = 1; i < valid.length; i++) {
    expect(asTime(valid[i - 1])).toBeGreaterThanOrEqual(asTime(valid[i]));
  }
}

async function expectWithinDays(dates: string[], days: number): Promise<void> {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  for (const d of dates) {
    if (Number.isNaN(asTime(d))) continue;
    expect(asTime(d)).toBeGreaterThanOrEqual(cutoff);
  }
}

test('TC-SRT-007: client date filters work', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  await expectRecentDescending(await clients.filterByDate('recent'));
  await expectWithinDays(await clients.filterByDate('past7'), 8);
  await expectWithinDays(await clients.filterByDate('past30'), 31);
  await saveEvidence(adminPage, 'TC-SRT-007');
});

test('TC-SRT-008: product date filters work', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  await expectRecentDescending(await products.filterByDate('recent'));
  await expectWithinDays(await products.filterByDate('past7'), 8);
  await expectWithinDays(await products.filterByDate('past30'), 31);
  await saveEvidence(adminPage, 'TC-SRT-008');
});

test('TC-SRT-009: user list date filter degrades gracefully', async ({
  adminPage,
}) => {
  const list = new UserListPage(adminPage);
  await list.gotoViaUI();
  // User rows carry no data-date: past-filters empty the table by design of
  // the shared filter code. Assert deterministic empty, never a crash.
  await adminPage.selectOption('#sort-filter', 'past7');
  await adminPage.waitForTimeout(1200);
  await expect(adminPage.locator('tr.data-row')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-SRT-009');
});

test('TC-SRT-010: vendor date filters work', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  await expectRecentDescending(await vendors.filterByDate('recent'));
  await expectWithinDays(await vendors.filterByDate('past7'), 8);
  await expectWithinDays(await vendors.filterByDate('past30'), 31);
  await saveEvidence(adminPage, 'TC-SRT-010');
});

test('TC-SRT-011: store date filters work', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  await expectRecentDescending(await stores.filterByDate('recent'));
  await expectWithinDays(await stores.filterByDate('past7'), 8);
  await expectWithinDays(await stores.filterByDate('past30'), 31);
  await saveEvidence(adminPage, 'TC-SRT-011');
});

test.skip(
  'TC-SRT-012: skills date filters (no sort control on skills list)',
  async () => {},
);
