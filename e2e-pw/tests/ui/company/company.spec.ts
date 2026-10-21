import { test, expect } from '../../../fixtures/test-fixtures';
import { CompanyPage } from '../../../pages/CompanyPage';
import { getCompanyContactUpdate } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

test('TC-COM-001: company tab loads with details', async ({ adminPage }) => {
  const company = new CompanyPage(adminPage);
  await company.goto();
  await company.expectTabLoaded();
  await expect(adminPage.getByText('+ Add Location')).toBeVisible();
  await saveEvidence(adminPage, 'TC-COM-001');
});

test('TC-COM-002: valid company update saves and persists', async ({
  adminPage,
}) => {
  const company = new CompanyPage(adminPage);
  const update = getCompanyContactUpdate();
  await company.startEdit();
  await adminPage.fill('input[name="contact_person"]', update.contactPerson);
  await adminPage.fill('input[name="contact_number"]', update.contactNumber);
  await company.saveExpectUpdated();
  await company.goto();
  await expect(
    adminPage.locator('input[name="contact_person"]'),
  ).toHaveValue(update.contactPerson);
  await saveEvidence(adminPage, 'TC-COM-002');
});

test('TC-COM-003: invalid email blocked by browser validation', async ({
  adminPage,
}) => {
  await new CompanyPage(adminPage).expectBrowserBlocksInvalidEmail(
    'not-an-email',
    'BAD!',
  );
  await saveEvidence(adminPage, 'TC-COM-003');
});

test('TC-COM-006: empty company name blocked', async ({ adminPage }) => {
  test.slow();
  const company = new CompanyPage(adminPage);
  await company.startEdit();
  const nameInput = adminPage.locator('input[name="company_name"]');
  // Guard real company data: remember the name, restore it if it is lost.
  const originalName = (await nameInput.inputValue()).trim();
  expect(originalName.length).toBeGreaterThan(0);
  await nameInput.fill('');
  await highlight(adminPage, 'input[name="company_name"]', '#1d3a8a');
  await caption(adminPage, 'KASSIST-629 · Finding 3 · Step 1', `Company tab > Edit. Clear the Company Name (currently "${originalName}") and click Save.`);
  // Submit, otherwise the URL race below waits on a navigation that never
  // comes and the TC times out without testing anything.
  await adminPage.evaluate(() => document.querySelectorAll('form').forEach((f) => { f.noValidate = true; }));
  await adminPage.locator('#company-save-btn').click();
  const outcome = await Promise.race([
    adminPage
      .waitForURL('**/home?tab=company&updated=1', { timeout: 15000 })
      .then(() => 'saved'),
    adminPage
      .waitForURL('**/home?tab=company&company_update_error=1*', {
        timeout: 15000,
      })
      .then(() => 'rejected'),
  ]).catch(() => 'no-navigation');
  await adminPage.waitForTimeout(800);
  const toast = await adminPage.locator('.toast, .alert-error').allInnerTexts().catch(() => []);
  await highlight(adminPage, '.toast', '#12b76a');
  await caption(adminPage, 'KASSIST-629 · Finding 3 · Step 2', `Save with empty name → outcome: ${outcome}. Message shown: "${toast.join(' | ') || 'none'}".`, outcome === 'rejected' ? 'pass' : 'fail');
  await adminPage.screenshot({ path: 'evidence/TC-COM-006-rejected.png' });
  await company.goto();
  const bodyText = await adminPage.locator('body').innerText();
  const nameKept = bodyText.includes(originalName);
  console.log(`TC-COM-006 outcome=${outcome} toast=${JSON.stringify(toast)} nameKept=${nameKept}`);
  if (!nameKept) {
    // Restore the real company name immediately.
    await company.startEdit();
    await nameInput.fill(originalName);
    await company.saveExpectUpdated();
  }
  await caption(
    adminPage,
    `KASSIST-629 · Finding 3 · Step 2 · ${outcome === 'rejected' && nameKept ? 'Result (FIXED)' : 'Actual result (BUG)'}`,
    `Save outcome: ${outcome}${toast.length ? ` - message "${toast.join(' | ')}"` : ''}. Company name still "${originalName}": ${nameKept ? 'yes' : 'NO (restored by test)'}.`,
    outcome === 'rejected' && nameKept ? 'pass' : 'fail',
  );
  // Empty company name must NOT save silently.
  expect(outcome).toBe('rejected');
  expect(nameKept).toBe(true);
  await saveEvidence(adminPage, 'TC-COM-006');
});
