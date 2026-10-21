import { test, expect } from '../../../fixtures/test-fixtures';
import { VendorPage } from '../../../pages/VendorPage';
import { getNewVendor } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { recordToasts } from '../../../utils/narrate';
import { expectSuccessToast } from '../../../utils/toastCheck';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-738 sub-tasks TC-VND-001..TC-VND-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-VND-001: vendor list loads', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  await vendors.gotoViaUI();
  await expect(adminPage.getByText('Manage vendor master data')).toBeVisible();
  await saveEvidence(adminPage, 'TC-VND-001');
});

test('TC-VND-002: valid vendor add works', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  await vendors.addVendor(getNewVendor());
  await saveEvidence(adminPage, 'TC-VND-002');
});

test('TC-VND-003: invalid vendor email blocked', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  await vendors.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/vendor/add"]').click();
  const data = getNewVendor();
  await adminPage.fill('input[name="name"]', data.name);
  await adminPage.fill('input[name="vendor_code"]', data.code);
  await adminPage.fill('input[name="address1"]', data.address1);
  await adminPage.fill('input[name="contact_email"]', 'not-an-email');
  await adminPage.getByRole('button', { name: 'Add Vendor' }).click();
  await adminPage.waitForTimeout(3000);
  if (!adminPage.url().includes('/vendor/add')) {
    throw new Error('NOT-ENFORCED: invalid vendor email was accepted');
  }
  // Stayed on the form: blocked — prove a visible signal (browser bubble or
  // inline error), not a silent swallow.
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="contact_email"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  const alerts = await adminPage.locator('.alert-error').count();
  expect(msg || alerts > 0).toBeTruthy();
  await saveEvidence(adminPage, 'TC-VND-003');
});

test('TC-VND-004: duplicate vendor handled', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  const data = getNewVendor();
  await vendors.addVendor(data);
  await vendors.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/vendor/add"]').click();
  await vendors.fillVendorForm(data);
  await vendors.submitExpectReject();
  await saveEvidence(adminPage, 'TC-VND-004');
});

test('TC-VND-005: edit vendor saves', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  const data = getNewVendor();
  await vendors.addVendor(data);
  await vendors.openEdit(data.name);
  const updated = `QA Vendor Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="contact_person"]', updated);
  await adminPage.getByRole('button', { name: 'Update Vendor' }).click();
  await adminPage.waitForURL('**/vendor', { timeout: 15000 });
  await vendors.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-VND-005');
});

test('TC-VND-006: delete test vendor removes', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  const data = getNewVendor();
  await vendors.addVendor(data);
  await vendors.deleteVendor(data.name);
  await saveEvidence(adminPage, 'TC-VND-006');
});

test('TC-VND-007: search filters vendor rows', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  const data = getNewVendor();
  await vendors.addVendor(data);
  await vendors.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-vendor-xyz');
  await expect(vendors.row(data.name)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-VND-007');
});

test('TC-VND-008: pager navigates when multiple pages exist', async ({
  adminPage,
}) => {
  const vendors = new VendorPage(adminPage);
  await vendors.gotoViaUI();
  const next = adminPage.locator('.pagination-controls a', { hasText: 'Next' });
  // A rendered-but-disabled Next means a single page — skip honestly.
  const nextEnabled =
    (await next.count()) > 0 &&
    (await next.first().getAttribute('disabled')) === null &&
    !((await next.first().getAttribute('class')) || '').includes('disabled');
  if (!nextEnabled) {
    test.skip(true, 'Only one page of vendors — pager has no active Next.');
  }
  const firstPage1 = ((await adminPage.locator('tr.data-row td:nth-child(2)').first().textContent()) || '').trim();
  await next.first().click();
  const firstPage2 = ((await adminPage.locator('tr.data-row td:nth-child(2)').first().textContent()) || '').trim();
  expect(firstPage1.length).toBeGreaterThan(0);
  expect(firstPage2).not.toBe(firstPage1);
  await saveEvidence(adminPage, 'TC-VND-008');
});

test('TC-VND-014: multi-word search keeps cells readable (KASSIST-983)', async ({ adminPage }) => {
  test.slow();
  const vendors = new VendorPage(adminPage);
  const stamp = Date.now().toString().slice(-6);
  // Multi-word name ending in a short word ("A") - the case that used to
  // match inside previously inserted highlight <span> tags.
  const data = { ...getNewVendor(), name: `QA Vd ${stamp} A` };
  await vendors.addVendor(data);

  await vendors.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const row = vendors.row(data.name).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  const text = ((await row.innerText()) || '').replace(/\s+/g, ' ').trim();
  const soup = /class=|search-highlight|<\/?span|an>|"\s*>/i.test(text);
  await highlight(adminPage, `tr.data-row:has-text("${data.name}")`, soup ? '#f04438' : '#12b76a');
  await caption(
    adminPage,
    `KASSIST-983 · Search "${data.name}" ${soup ? '(TAG SOUP - BUG)' : '(CLEAN - FIXED)'}`,
    `Vendor list multi-word search. Row shows: ${text.slice(0, 170)}`,
    soup ? 'fail' : 'pass',
  );
  await saveEvidence(adminPage, 'TC-VND-014');
  expect(soup, 'no literal span/class fragments in the row').toBe(false);
  expect(text).toContain(data.name);
});

test('TC-VND-015: success toast on create and edit (KASSIST-1001)', async ({ adminPage }) => {
  test.slow();
  await recordToasts(adminPage);
  const vendors = new VendorPage(adminPage);
  const data = { ...getNewVendor(), name: `QA Vd Toast ${Date.now().toString().slice(-6)}` };
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-1001', step: `Create vendor "${data.name}"`, expect: /added|created/i, evidenceId: 'TC-VND-015',
    save: async () => {
      await vendors.gotoViaUI();
      await adminPage.locator('a.btn-add[href$="/vendor/add"]').click();
      await vendors.fillVendorForm(data);
      await adminPage.getByRole('button', { name: 'Add Vendor' }).click();
    },
  });
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-1001', step: `Edit vendor "${data.name}"`, expect: /updated|saved/i, evidenceId: 'TC-VND-015-edit',
    save: async () => {
      await vendors.gotoViaUI();
      await adminPage.fill('#data-search', data.name);
      await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
      await adminPage.waitForTimeout(1000);
      await vendors.row(data.name).first().locator('a.edit-btn').click();
      await adminPage.fill('input[name="contact_person"]', 'QA Person Edited');
      await adminPage.getByRole('button', { name: 'Update Vendor' }).click();
    },
  });
});
