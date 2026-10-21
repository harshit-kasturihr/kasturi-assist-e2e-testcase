import { test, expect } from '../../../fixtures/test-fixtures';
import { ClientPage } from '../../../pages/ClientPage';
import { getNewClient } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { recordToasts, caption, highlight } from '../../../utils/narrate';
import { expectSuccessToast } from '../../../utils/toastCheck';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers KASSIST-694 sub-tasks TC-CLT-001..TC-CLT-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-CLT-001: client list loads', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  await clients.gotoViaUI();
  // Dev DB may legitimately hold zero clients — assert the page chrome
  // (heading + Add action), not row presence.
  await expect(adminPage.getByText('Clients').first()).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/client/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-CLT-001');
});

test('TC-CLT-002: valid client add works', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  await clients.addClient(getNewClient());
  await saveEvidence(adminPage, 'TC-CLT-002');
});

test('TC-CLT-003: invalid client data rejected', async ({ adminPage }) => {
  // contact_email is type=email: the browser blocks submit natively, so no
  // request is ever sent (verified in markup).
  const clients = new ClientPage(adminPage);
  await clients.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/client/add"]').click();
  const data = getNewClient();
  await adminPage.fill('input[name="company_name"]', data.companyName);
  await adminPage.fill('input[name="custom_code"]', data.code);
  await adminPage.fill('input[name="address"]', data.address);
  await adminPage.fill('input[name="contact_email"]', 'not-an-email');
  await adminPage.getByRole('button', { name: 'Save' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="contact_email"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-CLT-003');
});

test('TC-CLT-004: duplicate client handled', async ({ adminPage }) => {
  // Server PK rejects the duplicate silently (redirect, no message) — so
  // "handled" here means: exactly ONE row exists afterwards (verified
  // against the DB: zero duplicate names). The missing user feedback is
  // noted, not failed: creation UX already covered by TC-CLT-002.
  const clients = new ClientPage(adminPage);
  const data = getNewClient();
  await clients.addClient(data);
  await clients.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/client/add"]').click();
  await adminPage.fill('input[name="company_name"]', data.companyName);
  await adminPage.fill('input[name="custom_code"]', data.code);
  await adminPage.fill('input[name="address"]', data.address);
  await adminPage.getByRole('button', { name: 'Save' }).click();
  await adminPage.waitForURL('**/client', { timeout: 15000 });
  await clients.gotoViaUI();
  await adminPage.fill('#data-search', data.companyName);
  await expect(clients.row(data.companyName)).toHaveCount(1);
  await saveEvidence(adminPage, 'TC-CLT-004');
});

test('TC-CLT-005: edit client saves', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  const data = getNewClient();
  await clients.addClient(data);
  await clients.openEdit(data.companyName);
  const updated = `QA Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="contact_person"]', updated);
  await adminPage.getByRole('button', { name: 'Save' }).click();
  await adminPage.waitForURL('**/client', { timeout: 15000 });
  await clients.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-CLT-005');
});

test('TC-CLT-006: delete test client removes', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  const data = getNewClient();
  await clients.addClient(data);
  await clients.deleteClient(data.companyName);
  await saveEvidence(adminPage, 'TC-CLT-006');
});

test('TC-CLT-007: client location add works', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  const data = getNewClient();
  await clients.addClient(data);
  const address = `QA Loc ${Date.now().toString().slice(-6)}`;
  await clients.addLocation(data.companyName, address);
  await saveEvidence(adminPage, 'TC-CLT-007');
});

test('TC-CLT-008: empty mandatory blocked', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  await clients.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/client/add"]').click();
  await adminPage.getByRole('button', { name: 'Save' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="company_name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-CLT-008');
});

test('TC-CLT-014: multi-word search keeps cells readable (KASSIST-996)', async ({ adminPage }) => {
  test.slow();
  const cl = new ClientPage(adminPage);
  const data = { ...getNewClient(), companyName: `QA Cl ${Date.now().toString().slice(-6)} A` };
  await cl.addClient(data);
  await cl.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name: data.companyName, row: (n) => cl.row(n), bugKey: 'KASSIST-996', tcId: 'TC-CLT-014', screen: 'Client' });
});

test('TC-CLT-015: success toast on create and edit (KASSIST-998)', async ({ adminPage }) => {
  test.slow();
  await recordToasts(adminPage);
  const cl = new ClientPage(adminPage);
  const data = { ...getNewClient(), companyName: `QA Cl Toast ${Date.now().toString().slice(-6)}` };
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-998', step: `Create client "${data.companyName}"`, expect: /added|created/i, evidenceId: 'TC-CLT-015',
    save: async () => {
      await cl.gotoViaUI();
      await adminPage.locator('a.btn-add[href$="/client/add"]').click();
      await adminPage.fill('input[name="company_name"]', data.companyName);
      await adminPage.fill('input[name="custom_code"]', data.code);
      await adminPage.fill('input[name="address"]', data.address);
      await adminPage.fill('input[name="pin"]', data.pin);
      await adminPage.fill('input[name="contact_person"]', data.contactPerson);
      await adminPage.fill('input[name="contact_email"]', data.contactEmail);
      await adminPage.fill('input[name="contact_phone"]', data.contactPhone);
      await adminPage.getByRole('button', { name: 'Save' }).click();
    },
  });
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-998', step: `Edit client "${data.companyName}"`, expect: /updated|saved/i, evidenceId: 'TC-CLT-015-edit',
    save: async () => {
      await cl.gotoViaUI();
      await adminPage.fill('#data-search', data.companyName);
      await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
      await adminPage.waitForTimeout(1000);
      await cl.row(data.companyName).first().locator('a.edit-btn').click();
      await adminPage.fill('input[name="contact_person"]', 'QA Person Edited');
      await adminPage.getByRole('button', { name: 'Save' }).click();
    },
  });
});

test('TC-CLT-016: failed create shows error, no silent redirect (KASSIST-999)', async ({ adminPage }) => {
  test.slow();
  const cl = new ClientPage(adminPage);
  const data = { ...getNewClient(), companyName: `QA Cl NoPin ${Date.now().toString().slice(-6)}` };
  await cl.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/client/add"]').click();
  await adminPage.fill('input[name="company_name"]', data.companyName);
  await adminPage.fill('input[name="custom_code"]', data.code);
  await adminPage.fill('input[name="address"]', data.address);
  await adminPage.fill('input[name="contact_person"]', data.contactPerson);
  await adminPage.fill('input[name="contact_email"]', data.contactEmail);
  await adminPage.fill('input[name="contact_phone"]', data.contactPhone);
  // Leave Pincode empty and bypass the browser's required check so the
  // SERVER failure path is what's exercised.
  await adminPage.evaluate(() => document.querySelectorAll('form').forEach((f) => { f.noValidate = true; }));
  await highlight(adminPage, 'input[name="pin"]', '#1d3a8a');
  await caption(adminPage, 'KASSIST-999 · Step 1', `Add Client "${data.companyName}" with all fields filled EXCEPT Pincode, then click Save.`);
  await adminPage.getByRole('button', { name: 'Save' }).click();
  await adminPage.waitForLoadState('domcontentloaded');
  await adminPage.waitForTimeout(1000);
  const url = adminPage.url();
  const err = ((await adminPage.locator('.alert-error').first().innerText().catch(() => '')) || '').trim();
  const kept = (await adminPage.locator('input[name="company_name"]').inputValue().catch(() => '')) === data.companyName;
  const ok = !!err && kept;
  if (ok) await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(
    adminPage,
    `KASSIST-999 · Step 2 · ${ok ? 'Result (FIXED)' : 'Actual result (BUG)'}`,
    ok ? `Form re-rendered with error: "${err}". Entered values kept.` : `Silently redirected to ${url.replace(/^https?:\/\/[^/]+/, '')} with no error.`,
    ok ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-CLT-016');
  // No client row must have been created.
  await cl.gotoViaUI();
  await adminPage.fill('#data-search', data.companyName);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const rows = await cl.row(data.companyName).count();
  await caption(adminPage, 'KASSIST-999 · Step 3', `Client list search for "${data.companyName}": ${rows} row(s) - nothing was saved.`, rows === 0 ? 'pass' : 'fail');
  expect(err, 'error message shown on the form').not.toBe('');
  expect(kept, 'entered values preserved').toBe(true);
  expect(rows).toBe(0);
});
