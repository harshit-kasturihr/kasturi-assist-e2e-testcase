import { test, expect } from '../../../fixtures/test-fixtures';
import { DomainPage } from '../../../pages/DomainPage';
import { getNewDomain } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-924 sub-tasks TC-DOM-001..TC-DOM-015 + TC-DOM-021.
// No cross-module prerequisites (name + free email only).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-DOM-001: domain list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/domains/add"]'),
  ).toBeVisible();
  if ((await adminPage.locator('tr.data-row').count()) > 0) {
    for (const col of ['Domain Name', 'Email']) {
      await expect(adminPage.locator('th', { hasText: col }).first()).toBeVisible();
    }
  }
  await saveEvidence(adminPage, 'TC-DOM-001');
});

test('TC-DOM-002: valid domain add with email works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await expect(dom.row(data.name).first()).toContainText(data.email);
  await saveEvidence(adminPage, 'TC-DOM-002');
});

test('TC-DOM-003: add without email works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data, false);
  await expect(dom.row(data.name).first()).toContainText('-');
  await saveEvidence(adminPage, 'TC-DOM-003');
});

test('TC-DOM-004: empty name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/domains/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Domain' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.getElementById('name') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  const serverErr = await adminPage
    .locator('.form-error-text')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  expect(msg || serverErr).toBeTruthy();
  await saveEvidence(adminPage, 'TC-DOM-004');
});

test('TC-DOM-005: whitespace name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/domains/add"]').click();
  await adminPage.fill('#name', '   ');
  await adminPage.getByRole('button', { name: 'Add Domain' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-DOM-005');
});

test('TC-DOM-006: duplicate name outcome', async ({ adminPage }) => {
  // KASSIST-946 regression: duplicate domain names (exact and different
  // case) must be rejected inline, leaving exactly one row.
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await highlight(adminPage, `tr.data-row:has-text("${data.name}")`, '#12b76a');
  await caption(adminPage, 'KASSIST-946 · Step 1', `Domain "${data.name}" created (1 row).`);

  const tryAdd = async (name: string): Promise<string> => {
    await dom.gotoViaUI();
    await adminPage.locator('a.btn-add[href$="/domains/add"]').click();
    await adminPage.fill('#name', name);
    await adminPage.fill('#email', data.email);
    await adminPage.getByRole('button', { name: 'Add Domain' }).click();
    const err = adminPage.locator('.alert-error, .form-error-text').first();
    const shown = await Promise.race([
      err.waitFor({ state: 'visible', timeout: 15000 }).then(() => true),
      adminPage.waitForURL('**/domains', { timeout: 15000 }).then(() => false),
    ]).catch(() => false);
    return shown ? (await err.innerText()).trim() : '';
  };

  const exactErr = await tryAdd(data.name);
  await highlight(adminPage, '.alert-error, .form-error-text', exactErr ? '#12b76a' : '#f04438');
  await caption(
    adminPage,
    `KASSIST-946 · Step 2 · Same name ${exactErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    exactErr ? `Add "${data.name}" again → error: "${exactErr}"` : `Add "${data.name}" again → no error, saved.`,
    exactErr ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-DOM-006');

  const upper = data.name.toUpperCase();
  const caseErr = await tryAdd(upper);
  await caption(
    adminPage,
    `KASSIST-946 · Step 3 · Different case ${caseErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    caseErr ? `Add "${upper}" → error: "${caseErr}"` : `Add "${upper}" → no error, saved.`,
    caseErr ? 'pass' : 'fail',
  );

  await dom.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const rows = await dom.row(data.name).count();
  await caption(adminPage, `KASSIST-946 · Step 4 · ${rows === 1 ? 'Result (FIXED)' : 'Actual result (BUG)'}`, `List search for "${data.name}": ${rows} row(s). Expected exactly 1.`, rows === 1 ? 'pass' : 'fail');
  if (!exactErr || rows !== 1) await saveEvidence(adminPage, 'TC-DOM-006-result');
  expect(exactErr, 'exact duplicate rejected').not.toBe('');
  expect(caseErr, 'case-variant duplicate rejected').not.toBe('');
  // More than one row = silent duplicate = APPLICATION_BUG.
  expect(rows).toBe(1);
});

test('TC-DOM-007: invalid email blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/domains/add"]').click();
  await adminPage.fill('#name', `QA Dom ${Date.now().toString().slice(-6)}`);
  await adminPage.fill('#email', 'not-an-email');
  await adminPage.getByRole('button', { name: 'Add Domain' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.getElementById('email') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-DOM-007');
});

test('TC-DOM-008: overlong email blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/domains/add"]').click();
  await adminPage.fill('#name', `QA Dom ${Date.now().toString().slice(-6)}`);
  // Bypass native maxlength=100 to reach the server 100-char check.
  const longMail = `qa.${'x'.repeat(95)}@example.com`;
  await adminPage.evaluate((mail: string) => {
    const input = document.getElementById('email') as HTMLInputElement | null;
    input?.removeAttribute('maxlength');
    if (input) input.value = mail;
  }, longMail);
  await adminPage.getByRole('button', { name: 'Add Domain' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /100 characters/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-DOM-008');
});

test('TC-DOM-009: edit domain saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await dom.openEdit(data.name);
  const edited = `edited.${Date.now().toString().slice(-6)}@example.com`;
  await adminPage.fill('#email', edited);
  await adminPage.getByRole('button', { name: 'Update Domain' }).click();
  await adminPage.waitForURL('**/domains', { timeout: 30000, waitUntil: 'commit' });
  await adminPage.fill('#data-search', data.name);
  await expect(dom.row(data.name).first()).toContainText(edited);
  await saveEvidence(adminPage, 'TC-DOM-009');
});

test('TC-DOM-010: edit empty-name rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await dom.openEdit(data.name);
  await adminPage.evaluate(() => {
    const input = document.getElementById('name') as HTMLInputElement | null;
    input?.removeAttribute('required');
    if (input) input.value = '';
  });
  await adminPage.getByRole('button', { name: 'Update Domain' }).click();
  await expect(adminPage.locator('.form-error-text').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await dom.expectRowVisible(data.name);
  await saveEvidence(adminPage, 'TC-DOM-010');
});

test('TC-DOM-011: delete test domain removes', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await dom.deleteDomain(data.name);
  await saveEvidence(adminPage, 'TC-DOM-011');
});

test('TC-DOM-012: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await dom.gotoViaUI();
  await expect(dom.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-DOM-012');
});

test('TC-DOM-013: search by name and email', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await dom.gotoViaUI();
  for (const q of [data.name, data.email]) {
    await adminPage.fill('#data-search', q);
    await expect(dom.row(data.name).first()).toBeVisible({ timeout: 20000 });
  }
  await saveEvidence(adminPage, 'TC-DOM-013');
});

test('TC-DOM-014: no-match search shows zero rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-dom-xyz-123');
  await expect(dom.row('no-such-dom-xyz-123')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-DOM-014');
});

test('TC-DOM-015: sorting reorders domain rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const asc = await dom.sortAndReadNames('asc');
  const desc = await dom.sortAndReadNames('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-DOM-015');
});

test('TC-DOM-021: print view renders', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const dom = new DomainPage(adminPage);
  const data = getNewDomain();
  await dom.addDomain(data);
  await dom.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-DOM-021');
});

test('TC-DOM-022: multi-word search keeps cells readable (KASSIST-989)', async ({ adminPage }) => {
  test.slow();
  const dom = new DomainPage(adminPage);
  const data = { ...getNewDomain(), name: `QA Dm ${Date.now().toString().slice(-6)} A` };
  await dom.addDomain(data);
  await dom.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name: data.name, row: (n) => dom.row(n), bugKey: 'KASSIST-989', tcId: 'TC-DOM-022', screen: 'Domain' });
});
