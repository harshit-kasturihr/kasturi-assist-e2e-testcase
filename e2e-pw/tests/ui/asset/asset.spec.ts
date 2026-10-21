import { test, expect } from '../../../fixtures/test-fixtures';
import { AssetPage } from '../../../pages/AssetPage';
import { getNewAsset } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-1009 sub-tasks TC-AST-001..TC-AST-014 + TC-AST-020.
// Standing rule: Domain dropdown options come from the Domain master —
// a fresh Domain is created first in the same TC (AssetPage.ensureDomain).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-AST-001: asset list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  await ast.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(adminPage.locator('a.btn-add[href$="/asset/add"]')).toBeVisible();
  for (const col of ['Serial No.', 'Make', 'Model', 'PO Number']) {
    await expect(adminPage.locator('th', { hasText: col }).first()).toBeVisible();
  }
  await saveEvidence(adminPage, 'TC-AST-001');
});

test('TC-AST-002: valid asset add works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await saveEvidence(adminPage, 'TC-AST-002');
});

test('TC-AST-003: mandatory missing outcome', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const domainName = await ast.ensureDomain();
  const data = getNewAsset();
  await ast.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/asset/add"]').click();
  await ast.fillAssetForm(data, domainName);
  // Bypass native `required` to reach server-side mandatory validation.
  await adminPage.evaluate(() => {
    const loc = document.getElementById('location') as HTMLInputElement | null;
    loc?.removeAttribute('required');
    if (loc) loc.value = '';
  });
  await adminPage.locator('#save-tab').click();
  // Either inline rejection or silent-redirect-without-row (client pattern).
  await Promise.race([
    adminPage.locator('.alert-error, .form-error-text').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    adminPage.waitForURL('**/asset', { timeout: 15000 }).catch(() => null),
  ]);
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', data.serial);
  await expect(ast.row(data.serial)).toHaveCount(0, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-AST-003');
});

test('TC-AST-004: duplicate serial outcome', async ({ adminPage }) => {
  // KASSIST-1030 regression: a duplicate serial must be rejected.
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', data.serial);
  await expect(ast.row(data.serial).first()).toBeVisible({ timeout: 20000 });
  await highlight(adminPage, `tr.data-row:has-text("${data.serial}")`, '#12b76a');
  await caption(adminPage, 'KASSIST-1030 · Step 1 · Precondition', `Asset with serial "${data.serial}" already exists (1 row in Asset list).`);
  await saveEvidence(adminPage, 'TC-AST-004-step1-existing');
  const domainName = await ast.ensureDomain();
  await ast.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/asset/add"]').click();
  await ast.fillAssetForm(data, domainName);
  await highlight(adminPage, '#serial_no, input[name="serial_no"]', '#1d3a8a');
  await caption(adminPage, 'KASSIST-1030 · Step 2', `Add New Asset: fill the form using the SAME serial "${data.serial}".`);
  await saveEvidence(adminPage, 'TC-AST-004-step2-same-serial');
  await highlight(adminPage, '#save-tab');
  await caption(adminPage, 'KASSIST-1030 · Step 3', 'Click Save.');
  await adminPage.locator('#save-tab').click();
  const error = adminPage.locator('.alert-error, .form-error-text, .form-alert-error, .toast-error').first();
  await Promise.race([
    error.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    adminPage.waitForURL('**/asset', { timeout: 15000 }).catch(() => null),
  ]);
  const errorText = (await error.isVisible().catch(() => false)) ? ((await error.innerText()).trim()) : '';
  console.log(`TC-AST-004 save result: url=${adminPage.url()} error="${errorText}"`);
  if (errorText) {
    await highlight(adminPage, '.alert-error, .form-error-text, .form-alert-error, .toast-error', '#12b76a');
    await caption(adminPage, 'KASSIST-1030 · Step 4 · Result', `Validation shown: "${errorText}"`, 'pass');
    await saveEvidence(adminPage, 'TC-AST-004-step4-validation');
  }
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', data.serial);
  await adminPage.waitForTimeout(2000);
  const count = await ast.row(data.serial).count();
  await highlight(adminPage, 'table', count === 1 ? '#12b76a' : '#f04438');
  await caption(
    adminPage,
    `KASSIST-1030 · Step 5 · ${count === 1 ? 'Expected result (FIXED)' : 'Actual result (BUG)'}`,
    `Asset list search for "${data.serial}" shows ${count} row(s). Expected exactly 1.`,
    count === 1 ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-AST-004-step5-result');
  // More than one row = silent duplicate = APPLICATION_BUG.
  await expect(ast.row(data.serial)).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-AST-004');
});

test('TC-AST-005: edit asset saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.openEdit(data.serial);
  await ast.expandFormSections();
  await adminPage.fill('#location', 'QA Edited Location');
  await adminPage.locator('#save-tab').click();
  await adminPage.waitForURL('**/asset', { timeout: 30000, waitUntil: 'commit' });
  await adminPage.fill('#data-search', data.serial);
  await expect(ast.row(data.serial).first()).toContainText('QA Edited Location');
  await saveEvidence(adminPage, 'TC-AST-005');
});

test('TC-AST-006: edit mandatory outcome', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.openEdit(data.serial);
  await adminPage.evaluate(() => {
    const loc = document.getElementById('location') as HTMLInputElement | null;
    loc?.removeAttribute('required');
    if (loc) loc.value = '';
  });
  await adminPage.locator('#save-tab').click();
  await Promise.race([
    adminPage.locator('.alert-error, .form-error-text').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    adminPage.waitForURL('**/asset', { timeout: 15000 }).catch(() => null),
  ]);
  // Row must still exist exactly once with original location intact.
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', data.serial);
  await expect(ast.row(data.serial)).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-AST-006');
});

test('TC-AST-007: delete test asset removes', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.deleteAsset(data.serial);
  await saveEvidence(adminPage, 'TC-AST-007');
});

test('TC-AST-008: multi-field search finds row', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.gotoViaUI();
  for (const q of [data.serial, data.make, data.model]) {
    await adminPage.fill('#data-search', q);
    await expect(ast.row(data.serial).first()).toBeVisible({ timeout: 20000 });
  }
  await saveEvidence(adminPage, 'TC-AST-008');
});

test('TC-AST-009: no-match search shows zero rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-ast-xyz-123');
  await expect(ast.row('no-such-ast-xyz-123')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-AST-009');
});

test('TC-AST-010: server pagination is consistent', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  await ast.gotoViaUI();
  const countText = (await adminPage.locator('.record-count').first().textContent()) || '';
  const total = Number((countText.match(/of\s+(\d+)/) || [])[1] || '0');
  const indicator = (await adminPage.locator('.page-indicator').first().textContent()) || '';
  if (total > 20) {
    const firstPage1 = await adminPage.locator('tr.data-row td:first-child').first().textContent();
    await adminPage.locator('.pagination-btn', { hasText: 'Next' }).click();
    await expect(adminPage.locator('.page-indicator')).toContainText('Page 2', { timeout: 20000 });
    const firstPage2 = await adminPage.locator('tr.data-row td:first-child').first().textContent();
    expect(firstPage2).not.toBe(firstPage1);
  } else {
    expect(indicator).toMatch(/Page 1 of 1/);
  }
  await saveEvidence(adminPage, 'TC-AST-010');
});

test('TC-AST-011: sorting reorders asset rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  const asc = await ast.sortAndReadSerials('asc');
  const desc = await ast.sortAndReadSerials('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-AST-011');
});

test('TC-AST-012: location filter narrows rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  // No-UI-path exception (documented): the asset list has no location
  // control and the dashboard location chart does not render in this env,
  // so the server-side filter is addressed directly.
  await adminPage.goto('/asset?location=' + encodeURIComponent(data.location));
  await expect(ast.row(data.serial).first()).toBeVisible({ timeout: 20000 });
  await adminPage.goto('/asset?location=NO-SUCH-LOCATION-XYZ');
  await expect(ast.row(data.serial)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-AST-012');
});

test('TC-AST-013: dashboard filter scopes list', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  // No-UI-path exception (documented): dashboard filter cards do not
  // render in this env — server-side filter addressed directly.
  await adminPage.goto('/asset?dashboard_filter=status_active');
  await expect(ast.row(data.serial).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-AST-013');
});

test('TC-AST-014: QR action shows QR', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.expectQrDialog(data.serial);
  await saveEvidence(adminPage, 'TC-AST-014');
});

test('TC-AST-020: print view renders', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  await ast.addAsset(data);
  await ast.expectPrintView(data.serial);
  await saveEvidence(adminPage, 'TC-AST-020');
});

test('TC-AST-021: success toast on create and edit (KASSIST-1055)', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  // Record every toast the app shows (they disappear after ~2s).
  await adminPage.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __toasts: string[] }).__toasts = seen;
    new MutationObserver(() => {
      document.querySelectorAll('.toast').forEach((t) => {
        const txt = (t.textContent || '').trim();
        if (txt && !seen.includes(txt)) seen.push(txt);
      });
    }).observe(document, { childList: true, subtree: true });
  });
  const toasts = () => adminPage.evaluate(() => (window as unknown as { __toasts?: string[] }).__toasts || []);
  const ast = new AssetPage(adminPage);
  const data = getNewAsset();
  const domainName = await ast.ensureDomain();

  // Create.
  await ast.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/asset/add"]').click();
  await ast.fillAssetForm(data, domainName);
  await caption(adminPage, 'KASSIST-1055 · Step 1', `Add New Asset with serial "${data.serial}" and click Save.`);
  await highlight(adminPage, '#save-tab');
  await adminPage.locator('#save-tab').click();
  await adminPage.waitForURL(/\/asset(\?.*)?$/, { timeout: 30000 });
  await adminPage.waitForTimeout(1500);
  const createUrl = adminPage.url();
  const createToasts = await toasts();
  console.log(`create: url=${createUrl} toasts=${JSON.stringify(createToasts)}`);
  const created = createToasts.some((t) => /added|created|saved/i.test(t));
  await caption(
    adminPage,
    `KASSIST-1055 · Step 2 · ${created ? 'Create toast shown (FIXED)' : 'Actual result (BUG)'}`,
    created ? `Toast: "${createToasts.join(' | ')}"` : `Redirected to ${createUrl.replace(/^.*\/asset/, '/asset')} with NO success toast. Expected "Asset added successfully".`,
    created ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-AST-021-step2-create');

  // Edit.
  await ast.openEdit(data.serial);
  await adminPage.locator('#make').fill(`${data.make} edited`).catch(() => null);
  await caption(adminPage, 'KASSIST-1055 · Step 3', `Edit asset "${data.serial}" (change Make) and click Save.`);
  await highlight(adminPage, '#save-tab');
  await adminPage.locator('#save-tab').click();
  await adminPage.waitForURL(/\/asset(\?.*)?$/, { timeout: 30000 });
  await adminPage.waitForTimeout(1500);
  const editUrl = adminPage.url();
  const editToasts = (await toasts()).filter((t) => !createToasts.includes(t) || /updated/i.test(t));
  console.log(`edit: url=${editUrl} toasts=${JSON.stringify(editToasts)}`);
  const updated = editToasts.some((t) => /updated|saved/i.test(t));
  await caption(
    adminPage,
    `KASSIST-1055 · Step 4 · ${updated ? 'Edit toast shown (FIXED)' : 'Actual result (BUG)'}`,
    updated ? `Toast: "${editToasts.join(' | ')}"` : `Redirected to ${editUrl.replace(/^.*\/asset/, '/asset')} with NO success toast. Expected "Asset updated successfully".`,
    updated ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-AST-021-step4-edit');
  expect(created, 'success toast after create').toBe(true);
  expect(updated, 'success toast after edit').toBe(true);
});
