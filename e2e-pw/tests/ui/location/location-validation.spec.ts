import { test, expect } from '../../../fixtures/test-fixtures';
import { LocationPage } from '../../../pages/LocationPage';
import { getValidLocation } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-630 sub-tasks TC-LOC-001..TC-LOC-005.
// Duplicate handling lives in TC-COM-009 (Bug KASSIST-629) — not duplicated here.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-LOC-001: contact email blocked by browser validation', async ({
  adminPage,
}) => {
  await new LocationPage(adminPage).expectBrowserBlocksBadContactEmail(
    getValidLocation(),
  );
  await saveEvidence(adminPage, 'TC-LOC-001');
});

test('TC-LOC-002: invalid contact number rejected server-side', async ({
  adminPage,
}) => {
  const data = getValidLocation();
  data.contactNumber = 'abc';
  data.address = `QA Loc Phone ${Date.now().toString().slice(-6)}`;
  const errText = await new LocationPage(adminPage).addLocationExpectError(data);
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'KASSIST-629 · Finding 4 · Contact number "abc"', `+ Add Location with contact number "abc" → Save. Result: rejected with "${errText}".`, 'pass');
  expect(errText.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-LOC-002');
});

test('TC-LOC-003: state/city stay readonly without geography', async ({
  adminPage,
}) => {
  const loc = new LocationPage(adminPage);
  await loc.expectGeoFieldsReadonly();
  // Form must still be submittable in degraded mode.
  await loc.addLocation(getValidLocation());
  await saveEvidence(adminPage, 'TC-LOC-003');
});

test('TC-LOC-004: empty address blocked', async ({ adminPage }) => {
  await new LocationPage(adminPage).expectBrowserBlocksEmptyAddress();
  await saveEvidence(adminPage, 'TC-LOC-004');
});

test('TC-LOC-005: new location appears in list', async ({ adminPage }) => {
  const loc = new LocationPage(adminPage);
  const data = getValidLocation();
  data.address = `QA Loc ${Date.now().toString().slice(-6)}`;
  await loc.addLocation(data);
  await loc.expectRowInList(data.address);
  await saveEvidence(adminPage, 'TC-LOC-005');
});
