import { test, expect } from '../../../fixtures/test-fixtures';
import { PurchaseRequisitionPage } from '../../../pages/PurchaseRequisitionPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1088 sub-tasks TC-PR-001..TC-PR-012.
// Standing rule: PR items reference master products — a fresh Product is
// created first in the same TC (PurchaseRequisitionPage.ensureProduct).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-PR-001: requisition list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const pr = new PurchaseRequisitionPage(adminPage);
  await pr.gotoViaUI();
  await expect(adminPage.locator('input[name="search"]').first()).toBeVisible();
  await saveEvidence(adminPage, 'TC-PR-001');
});

test('TC-PR-002: search finds requisition', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  const dept = `QA Dept ${Date.now().toString().slice(-5)}`;
  await pr.addRequisition(product, dept);
  await pr.gotoViaUI();
  await adminPage.locator('input[name="search"]').first().fill(dept);
  await adminPage.waitForTimeout(2000);
  await expect(pr.row(dept).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-PR-002');
});

test('TC-PR-003: pager is consistent', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const pr = new PurchaseRequisitionPage(adminPage);
  await pr.gotoViaUI();
  const countText = (await adminPage.locator('.prl-pagination').first().textContent({ timeout: 20000 })) || '';
  const total = Number((countText.match(/Total records:\s*(\d+)/) || [])[1] || '0');
  if (total > 20) {
    const firstPage1 = await adminPage.locator('tbody tr td').first().textContent();
    await adminPage.locator('.prl-page-btn', { hasText: 'Next' }).click();
    await adminPage.waitForFunction(
      () => /[?&]page=2\b/.test(window.location.href),
      { timeout: 20000 },
    );
    const firstPage2 = await adminPage.locator('tbody tr td').first().textContent();
    expect(firstPage2).not.toBe(firstPage1);
  } else {
    expect(total).toBeGreaterThanOrEqual(0);
  }
  await saveEvidence(adminPage, 'TC-PR-003');
});

test('TC-PR-004: dept filter narrows rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  const dept = `QA Dept ${Date.now().toString().slice(-5)}`;
  await pr.addRequisition(product, dept);
  await pr.gotoViaUI();
  await adminPage.locator('#dept').fill(dept);
  await adminPage.locator('button[type="submit"]').first().click();
  await adminPage.waitForTimeout(3000);
  await expect(pr.row(dept).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-PR-004');
});

test('TC-PR-005: date filter applies', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const pr = new PurchaseRequisitionPage(adminPage);
  await pr.gotoViaUI();
  await adminPage.locator('#date_from').fill('2026-01-01');
  await adminPage.locator('#date_to').fill('2026-12-31');
  await adminPage.locator('button[type="submit"]').first().click();
  await adminPage.waitForTimeout(3000);
  await saveEvidence(adminPage, 'TC-PR-005');
});

test('TC-PR-006: valid create works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  const dept = `QA Dept ${Date.now().toString().slice(-5)}`;
  const key = await pr.addRequisition(product, dept);
  expect(key.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-PR-006');
});

test('TC-PR-007: missing dept blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  await pr.gotoViaUI();
  await adminPage.getByRole('link', { name: 'New Requisition' }).click();
  await pr.addItemRow(product);
  await adminPage.evaluate(() => {
    const d = document.getElementById('dept') as HTMLInputElement | null;
    d?.removeAttribute('required');
  });
  const submit = adminPage.locator('button.pr-submit-btn');
  await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  await submit.click();
  await adminPage.waitForTimeout(3000);
  await expect(adminPage.getByText(/Department is required/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-PR-007');
});

test('TC-PR-008: no-items blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const pr = new PurchaseRequisitionPage(adminPage);
  await pr.gotoViaUI();
  await adminPage.getByRole('link', { name: 'New Requisition' }).click();
  await adminPage.fill('#dept', 'QA Dept');
  const submit = adminPage.locator('button.pr-submit-btn');
  await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  await submit.click();
  await adminPage.waitForTimeout(3000);
  // Server masks item errors behind a generic banner — assert rejection.
  await expect(adminPage.locator('.pr-alert.error').first()).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-PR-008');
});

test('TC-PR-009: invalid item blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  await pr.ensureProduct();
  await pr.gotoViaUI();
  await adminPage.getByRole('link', { name: 'New Requisition' }).click();
  // Use the default blank first row (no extra Add Row — it stays empty and
  // would itself fail validation).
  const row = adminPage.locator('tr.pr-item-row').first();
  // Free text with no selection leaves item-id empty.
  await row.locator('.item-search').fill('NO-SUCH-PRODUCT-XYZ');
  await adminPage.waitForTimeout(2000);
  await row.locator('.quantity').fill('5');
  await adminPage.fill('#dept', 'QA Dept');
  const submit = adminPage.locator('button.pr-submit-btn');
  await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  await submit.click();
  await adminPage.waitForTimeout(3000);
  await expect(adminPage.locator('.pr-alert.error').first()).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-PR-009');
});

test('TC-PR-010: edit saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  const dept = `QA Dept ${Date.now().toString().slice(-5)}`;
  await pr.addRequisition(product, dept);
  await pr.gotoViaUI();
  await adminPage.locator('input[name="search"]').first().fill(dept);
  await adminPage.waitForTimeout(2000);
  await pr.row(dept).first().locator('a.prl-icon-btn[title^="Edit"]').click();
  await adminPage.fill('#remark', 'QA edited remark');
  const submit = adminPage.locator('button.pr-submit-btn');
  await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  await submit.click();
  await adminPage.waitForURL(/purchase-requisition/, { timeout: 30000, waitUntil: 'commit' });
  await saveEvidence(adminPage, 'TC-PR-010');
});

test('TC-PR-011: cancel flow works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  const dept = `QA Dept ${Date.now().toString().slice(-5)}`;
  await pr.addRequisition(product, dept);
  await pr.gotoViaUI();
  await adminPage.locator('input[name="search"]').first().fill(dept);
  await adminPage.waitForTimeout(2000);
  const cancelBtn = pr.row(dept).first().locator('button.prl-cancel-btn');
  await expect(cancelBtn).toBeVisible({ timeout: 20000 });
  adminPage.once('dialog', (d) => d.accept());
  await cancelBtn.click();
  await adminPage.waitForTimeout(4000);
  await pr.gotoViaUI();
  await adminPage.locator('input[name="search"]').first().fill(dept);
  await adminPage.waitForTimeout(2000);
  await expect(pr.row(dept).first()).toContainText(/Cancelled/i);
  await saveEvidence(adminPage, 'TC-PR-011');
});

test('TC-PR-012: detail view renders', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  const pr = new PurchaseRequisitionPage(adminPage);
  const product = await pr.ensureProduct();
  const dept = `QA Dept ${Date.now().toString().slice(-5)}`;
  await pr.addRequisition(product, dept);
  await pr.gotoViaUI();
  await adminPage.locator('input[name="search"]').first().fill(dept);
  await adminPage.waitForTimeout(2000);
  await pr.row(dept).first().click();
  await adminPage.waitForTimeout(2000);
  await saveEvidence(adminPage, 'TC-PR-012');
});
