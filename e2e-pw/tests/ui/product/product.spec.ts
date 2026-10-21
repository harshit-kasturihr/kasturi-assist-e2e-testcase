import { test, expect } from '../../../fixtures/test-fixtures';
import { ProductPage } from '../../../pages/ProductPage';
import { getNewProduct } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { recordToasts } from '../../../utils/narrate';
import { expectSuccessToast } from '../../../utils/toastCheck';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-721 sub-tasks TC-PRD-001..TC-PRD-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).
// Heavy multi-navigation flows on a loaded machine: slow mode (3x timeout).

test.beforeEach(async () => {
  test.slow();
});

test('TC-PRD-001: product list loads', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  await products.gotoViaUI();
  await expect(adminPage.getByText('Manage product master data')).toBeVisible();
  await saveEvidence(adminPage, 'TC-PRD-001');
});

test('TC-PRD-002: valid product add works', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  const data = getNewProduct();
  await products.addProduct(data.name, data.description);
  await saveEvidence(adminPage, 'TC-PRD-002');
});

test('TC-PRD-003: empty product name blocked', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  await products.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/product/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Product' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="product_name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-PRD-003');
});

test('TC-PRD-004: duplicate product handled', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  const data = getNewProduct();
  await products.addProduct(data.name, data.description);
  // Second identical add: either rejected with an error, or exactly one row.
  await products.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/product/add"]').click();
  await adminPage.fill('input[name="product_name"]', data.name);
  await adminPage.fill('textarea[name="description"]', data.description);
  await adminPage.getByRole('button', { name: 'Add Product' }).click();
  // Duplicate names are rejected INLINE ("Product already exists with this
  // name", no navigation) — assert the message, not a redirect.
  await expect(adminPage.getByText('Product already exists with this name')).toBeVisible();
  await saveEvidence(adminPage, 'TC-PRD-004');
});

test('TC-PRD-005: edit product saves', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  const data = getNewProduct();
  await products.addProduct(data.name, data.description);
  await products.openEdit(data.name);
  const updated = `QA Product Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="product_name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Product' }).click();
  await adminPage.waitForURL('**/product', { timeout: 15000 });
  await products.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-PRD-005');
});

test('TC-PRD-006: delete test product removes', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  const data = getNewProduct();
  await products.addProduct(data.name, data.description);
  await products.deleteProduct(data.name);
  await saveEvidence(adminPage, 'TC-PRD-006');
});

test('TC-PRD-007: search filters product rows', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  const data = getNewProduct();
  await products.addProduct(data.name, data.description);
  await products.gotoViaUI();
  // Toolbar search auto-submits (debounced ?search= navigation) — no button.
  await adminPage.fill('input[name="product_table_search_filter"]', 'no-such-product-xyz');
  await adminPage.waitForURL(/search=/, { timeout: 15000 });
  await expect(products.row(data.name)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-PRD-007');
});

test('TC-PRD-008: pager navigates when multiple pages exist', async ({
  adminPage,
}) => {
  const products = new ProductPage(adminPage);
  await products.gotoViaUI();
  const next = adminPage.locator('.pagination-btns a', { hasText: 'Next' });
  if ((await next.count()) === 0) {
    test.skip(true, 'Only one page of products — pager has no Next.');
  }
  const firstPage1 = ((await adminPage.locator('tbody tr td:nth-child(2)').first().textContent()) || '').trim();
  await next.first().click();
  const firstPage2 = ((await adminPage.locator('tbody tr td:nth-child(2)').first().textContent()) || '').trim();
  expect(firstPage1.length).toBeGreaterThan(0);
  expect(firstPage2).not.toBe(firstPage1);
  await saveEvidence(adminPage, 'TC-PRD-008');
});

test('TC-PRD-013: multi-word search keeps cells readable (KASSIST-984)', async ({ adminPage }) => {
  test.slow();
  const prd = new ProductPage(adminPage);
  const name = `QA Pd ${Date.now().toString().slice(-6)} A`;
  await prd.addProduct(name, 'QA automation test product');
  await prd.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => prd.row(n), bugKey: 'KASSIST-984', tcId: 'TC-PRD-013', screen: 'Product' });
});

test('TC-PRD-014: success toast on create and edit (KASSIST-997)', async ({ adminPage }) => {
  test.slow();
  await recordToasts(adminPage);
  const prd = new ProductPage(adminPage);
  const name = `QA Pd Toast ${Date.now().toString().slice(-6)}`;
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-997', step: `Create product "${name}"`, expect: /added|created/i, evidenceId: 'TC-PRD-014',
    save: async () => {
      await prd.gotoViaUI();
      await adminPage.locator('a.btn-add[href$="/product/add"]').click();
      await adminPage.fill('input[name="product_name"]', name);
      await adminPage.fill('textarea[name="description"]', 'QA toast check');
      await adminPage.getByRole('button', { name: 'Add Product' }).click();
    },
  });
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-997', step: `Edit product "${name}"`, expect: /updated|saved/i, evidenceId: 'TC-PRD-014-edit',
    save: async () => {
      await prd.openEdit(name);
      await adminPage.fill('textarea[name="description"]', 'QA toast check edited');
      await adminPage.getByRole('button', { name: 'Update Product' }).click();
    },
  });
});
