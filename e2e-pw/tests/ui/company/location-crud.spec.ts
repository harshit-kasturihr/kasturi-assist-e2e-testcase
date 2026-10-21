import { test, expect } from '../../../fixtures/test-fixtures';
import { LocationPage } from '../../../pages/LocationPage';
import { getValidLocation } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-619 sub-tasks TC-COM-004/005/007/008/009.
// TC-COM-007/008 need location row edit/delete controls (dev Task
// KASSIST-537, still To Do) — if absent, these FAIL as missing-feature
// findings linked to 537, not new Bugs.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-COM-004: add location works', async ({ adminPage }) => {
  await new LocationPage(adminPage).addLocation(getValidLocation());
  await saveEvidence(adminPage, 'TC-COM-004');
});

test('TC-COM-005: invalid pincode location handled', async ({ adminPage }) => {
  const data = getValidLocation();
  data.pincode = '000000';
  data.address = `QA Loc Pin ${Date.now().toString().slice(-6)}`;
  const errText = await new LocationPage(adminPage).addLocationExpectError(data);
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'KASSIST-629 · Finding 1 · Pincode 000000', `Company > + Add Location with pincode 000000 → Save. Result: rejected with "${errText}". No junk row added.`, 'pass');
  expect(errText.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-COM-005');
});

test('TC-COM-007: edit-location control exists', async ({ adminPage }) => {
  await new LocationPage(adminPage).expectRowControls();
  await saveEvidence(adminPage, 'TC-COM-007');
});

test('TC-COM-008: delete-location control exists', async ({ adminPage }) => {
  await new LocationPage(adminPage).expectRowControls();
  await saveEvidence(adminPage, 'TC-COM-008');
});

test('TC-COM-009: duplicate location handled', async ({ adminPage }) => {
  test.slow();
  const loc = new LocationPage(adminPage);
  const data = getValidLocation();
  // Unique address: duplicates are now blocked, so a fixed address from an
  // earlier run would make the FIRST add fail.
  data.address = `QA Loc Dup ${Date.now().toString().slice(-6)}`;
  await loc.addLocation(data);
  await caption(adminPage, 'KASSIST-629 · Finding 2 · Step 1', `Location "${data.address}" (pincode ${data.pincode}) added once - OK.`);
  const errText = await loc.addLocationExpectError(data);
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'KASSIST-629 · Finding 2 · Step 2', `Add the IDENTICAL location again → Save. Result: rejected with "${errText}".`, 'pass');
  expect(errText.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-COM-009');
});

test('TC-COM-010: edit and delete company location (KASSIST-537)', async ({ adminPage }) => {
  test.slow();
  const loc = new LocationPage(adminPage);
  const data = getValidLocation();
  data.address = `QA Loc Edit ${Date.now().toString().slice(-6)}`;
  await loc.addLocation(data);
  await loc.goto();
  const row = loc.row(data.address).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row.locator('a.btn-edit')).toBeVisible();
  await expect(row.locator('button.btn-delete')).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await highlight(adminPage, `#companyLocationsWrapper tbody tr:has-text("${data.address}") .location-actions`, '#12b76a');
  await caption(adminPage, 'KASSIST-537 · Step 1', `New location "${data.address}" is listed with ✎ Edit and 🗑 Delete options.`, 'pass');
  // Edit: change contact person + designation, then check the list shows them.
  const person = `QA Edited Person ${Date.now().toString().slice(-4)}`;
  const designation = 'QA Edited Designation';
  await caption(adminPage, 'KASSIST-537 · Step 2', `Click ✎ Edit, change Contact Person → "${person}", Designation → "${designation}", Update Location.`);
  await loc.editLocation(data.address, person, designation);
  await loc.goto();
  const edited = loc.row(data.address).first();
  await expect(edited).toContainText(person, { timeout: 20000 });
  await expect(edited).toContainText(designation);
  await edited.scrollIntoViewIfNeeded();
  await highlight(adminPage, `#companyLocationsWrapper tbody tr:has-text("${data.address}")`, '#12b76a');
  await caption(adminPage, 'KASSIST-537 · Step 2 · Result', 'Updated Contact Person and Designation are shown in the Company Locations list.', 'pass');
  // Delete: confirmation first; Cancel keeps the row.
  const msg = await loc.openDeleteConfirm(data.address);
  await highlight(adminPage, '.confirm-modal', '#12b76a');
  await caption(adminPage, 'KASSIST-537 · Step 3', `🗑 Delete asks for confirmation: "${msg}". Click Cancel first.`, 'pass');
  expect(msg).toMatch(/Delete this company location/i);
  await adminPage.locator('.confirm-modal .confirm-cancel').first().click();
  await expect(loc.row(data.address)).toHaveCount(1);
  await caption(adminPage, 'KASSIST-537 · Step 3 · Result', 'Cancel → location is kept.', 'pass');
  await loc.openDeleteConfirm(data.address);
  await caption(adminPage, 'KASSIST-537 · Step 4', 'Delete again and confirm.');
  const [del] = await Promise.all([
    adminPage.waitForResponse((r) => /\/company\/location\/delete\//.test(r.url()), { timeout: 30000 }),
    adminPage.locator('.confirm-modal .confirm-yes').first().click(),
  ]);
  const body = await del.json().catch(() => ({} as { status?: string; message?: string }));
  await loc.goto();
  await adminPage.waitForTimeout(1500);
  const left = await loc.row(data.address).count();
  if (left) await loc.row(data.address).first().scrollIntoViewIfNeeded();
  await highlight(adminPage, `#companyLocationsWrapper tbody tr:has-text("${data.address}")`, '#f04438');
  await caption(adminPage, `KASSIST-537 · Result ${left ? '(BUG)' : '(PASS)'}`,
    left ? `Delete confirmed, server answered HTTP ${del.status()} {status: "${body.status}", message: "${body.message}"} — "${data.address}" is STILL in the list.`
      : `After confirming, "${data.address}" is no longer in the Company Locations list.`, left ? 'fail' : 'pass');
  await saveEvidence(adminPage, 'TC-COM-010');
  expect(body.status, 'delete reports success').toBe('success');
  expect(left, 'deleted location removed from the list').toBe(0);
});
