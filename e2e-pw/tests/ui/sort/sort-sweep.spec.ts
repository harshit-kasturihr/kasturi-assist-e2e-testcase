import { test, expect } from '../../../fixtures/test-fixtures';
import { ClientPage } from '../../../pages/ClientPage';
import { VendorPage } from '../../../pages/VendorPage';
import { StorePage } from '../../../pages/StorePage';
import { ProductPage } from '../../../pages/ProductPage';
import { SkillsPage } from '../../../pages/SkillsPage';
import { saveEvidence } from '../../../utils/evidence';

// Sort sweep across master lists: TC-SRT-001..TC-SRT-005.
// TC-SRT-006 (Company Locations) SKIPPED — that table has no sort control.
// Direction toggle must reorder consistently (exact collation is app-defined).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

async function expectSortToggles(
  adminPage: import('@playwright/test').Page,
  tcId: string,
  read: (v: 'asc' | 'desc') => Promise<string[]>,
): Promise<void> {
  const asc = await read('asc');
  const desc = await read('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect(desc).toEqual([...asc].reverse());
  await saveEvidence(adminPage, tcId);
}

test('TC-SRT-001: product list sorting works', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  await expectSortToggles(adminPage, 'TC-SRT-001', (v) => products.sortAndReadNames(v));
});

test('TC-SRT-002: client list sorting works', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  await expectSortToggles(adminPage, 'TC-SRT-002', (v) => clients.sortAndReadFirstColumn(v));
});

test('TC-SRT-003: skills list sorting works', async ({ adminPage }) => {
  const skills = new SkillsPage(adminPage);
  await expectSortToggles(adminPage, 'TC-SRT-003', (v) => skills.sortAndReadNames(v));
});

test('TC-SRT-004: vendor list sorting works', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  await expectSortToggles(adminPage, 'TC-SRT-004', (v) => vendors.sortAndReadFirstColumn(v));
});

test('TC-SRT-005: store list sorting works', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  await expectSortToggles(adminPage, 'TC-SRT-005', (v) => stores.sortAndReadFirstColumn(v));
});

test.skip(
  'TC-SRT-006: company locations sorting (no sort control on that table)',
  async () => {},
);
