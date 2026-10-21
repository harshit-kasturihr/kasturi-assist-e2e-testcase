import { test, expect } from '../../../fixtures/test-fixtures';
import { ResolverGroupPage } from '../../../pages/ResolverGroupPage';
import { getNewResolverGroup } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-896 sub-tasks TC-RGP-001..TC-RGP-014 + TC-RGP-020.
// Standing rule: members are employee emails — an Employee (with its
// Designation + Skill) is created first in the same TC.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-RGP-001: resolver group list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  await rgp.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/resolver-group/add"]'),
  ).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: 'Resolver Group' })).toBeVisible();
  // The table (and its headers) renders only when rows exist.
  if ((await adminPage.locator('tr.data-row').count()) > 0) {
    for (const col of ['Group Name', 'Members', 'Contact Information', 'Escalation Path']) {
      await expect(adminPage.locator('th', { hasText: col }).first()).toBeVisible();
    }
  }
  await saveEvidence(adminPage, 'TC-RGP-001');
});

test('TC-RGP-002: valid resolver group add works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await expect(rgp.row(data.name).first()).toContainText(member.email);
  await saveEvidence(adminPage, 'TC-RGP-002');
});

test('TC-RGP-003: empty name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  await rgp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/resolver-group/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Resolver Group' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.getElementById('group_name') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  // Either native required or server inline — both block the save.
  const serverErr = await adminPage
    .locator('.alert-error')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  expect(msg || serverErr).toBeTruthy();
  await saveEvidence(adminPage, 'TC-RGP-003');
});

test('TC-RGP-004: whitespace name blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  await rgp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/resolver-group/add"]').click();
  await adminPage.fill('#group_name', '   ');
  await adminPage.getByRole('button', { name: 'Add Resolver Group' }).click();
  await expect(adminPage.locator('.alert-error').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-RGP-004');
});

test('TC-RGP-005: duplicate name outcome', async ({ adminPage }) => {
  // KASSIST-917 regression: duplicate group names (exact and different case)
  // must be rejected inline, leaving exactly one row.
  test.slow();
  test.setTimeout(400000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await highlight(adminPage, `tr.data-row:has-text("${data.name}")`, '#12b76a');
  await caption(adminPage, 'KASSIST-917 · Step 1', `Resolver Group "${data.name}" created (1 row).`);

  const tryAdd = async (name: string): Promise<string> => {
    await rgp.gotoViaUI();
    await adminPage.locator('a.btn-add[href$="/resolver-group/add"]').click();
    await adminPage.fill('#group_name', name);
    await adminPage.fill('#members', member.email);
    await adminPage.getByRole('button', { name: 'Add Resolver Group' }).click();
    const err = adminPage.locator('.alert-error').first();
    const shown = await Promise.race([
      err.waitFor({ state: 'visible', timeout: 15000 }).then(() => true),
      adminPage.waitForURL('**/resolver-group', { timeout: 15000 }).then(() => false),
    ]).catch(() => false);
    return shown ? (await err.innerText()).trim() : '';
  };

  const exactErr = await tryAdd(data.name);
  await highlight(adminPage, '.alert-error', exactErr ? '#12b76a' : '#f04438');
  await caption(
    adminPage,
    `KASSIST-917 · Step 2 · Same name ${exactErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    exactErr ? `Add "${data.name}" again → error: "${exactErr}"` : `Add "${data.name}" again → no error, saved.`,
    exactErr ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-RGP-005');

  const upper = data.name.toUpperCase();
  const caseErr = await tryAdd(upper);
  await caption(
    adminPage,
    `KASSIST-917 · Step 3 · Different case ${caseErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    caseErr ? `Add "${upper}" → error: "${caseErr}"` : `Add "${upper}" → no error, saved.`,
    caseErr ? 'pass' : 'fail',
  );

  await rgp.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const rows = await rgp.row(data.name).count();
  await caption(adminPage, `KASSIST-917 · Step 4 · ${rows === 1 ? 'Result (FIXED)' : 'Actual result (BUG)'}`, `List search for "${data.name}": ${rows} row(s). Expected exactly 1.`, rows === 1 ? 'pass' : 'fail');
  if (!exactErr || rows !== 1) await saveEvidence(adminPage, 'TC-RGP-005-result');
  expect(exactErr, 'exact duplicate rejected').not.toBe('');
  expect(caseErr, 'case-variant duplicate rejected').not.toBe('');
  // More than one row = silent duplicate = APPLICATION_BUG.
  expect(rows).toBe(1);
});

test('TC-RGP-006: members deduped and normalized', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/resolver-group/add"]').click();
  await adminPage.fill('#group_name', data.name);
  const messy = `${member.email}, ${member.email.toUpperCase()} ,, qa.dup@example.com`;
  await adminPage.fill('#members', messy);
  await adminPage.getByRole('button', { name: 'Add Resolver Group' }).click();
  await adminPage.waitForURL('**/resolver-group', { timeout: 30000, waitUntil: 'commit' });
  await adminPage.fill('#data-search', data.name);
  const cell = rgp.row(data.name).first();
  await expect(cell).toBeVisible({ timeout: 20000 });
  // Stored once, blanks dropped.
  await expect(cell).toContainText(member.email);
  await expect(cell).toContainText('qa.dup@example.com');
  const occurrences = ((await cell.textContent()) || '').split(member.email).length - 1;
  expect(occurrences).toBe(1);
  await saveEvidence(adminPage, 'TC-RGP-006');
});

test('TC-RGP-007: edit resolver group saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await rgp.openEdit(data.name);
  await adminPage.fill('#contact_info', 'edited-contact@example.com');
  await adminPage.getByRole('button', { name: 'Update Resolver Group' }).click();
  await adminPage.waitForURL('**/resolver-group', { timeout: 30000, waitUntil: 'commit' });
  await adminPage.fill('#data-search', data.name);
  await expect(rgp.row(data.name).first()).toContainText('edited-contact@example.com');
  await saveEvidence(adminPage, 'TC-RGP-007');
});

test('TC-RGP-008: edit empty-name rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await rgp.openEdit(data.name);
  await adminPage.evaluate(() => {
    const input = document.getElementById('group_name') as HTMLInputElement | null;
    input?.removeAttribute('required');
    if (input) input.value = '';
  });
  await adminPage.getByRole('button', { name: 'Update Resolver Group' }).click();
  await expect(adminPage.locator('.alert-error').first()).toContainText(
    /required/i,
    { timeout: 15000 },
  );
  await rgp.expectRowVisible(data.name);
  await saveEvidence(adminPage, 'TC-RGP-008');
});

test('TC-RGP-009: delete test group removes', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await rgp.deleteResolverGroup(data.name);
  await saveEvidence(adminPage, 'TC-RGP-009');
});

test('TC-RGP-010: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await rgp.gotoViaUI();
  await expect(rgp.row(data.name).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-RGP-010');
});

test('TC-RGP-011: member search suggests created employee', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  await rgp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/resolver-group/add"]').click();
  // 3+ letters of the created employee's email must yield a suggestion.
  const picked = await rgp.pickMemberSuggestion(member.email);
  expect(picked).toBe(member.email);
  await saveEvidence(adminPage, 'TC-RGP-011');
});

test('TC-RGP-012: multi-field search finds row', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await rgp.gotoViaUI();
  for (const q of [data.name, member.email, data.contact]) {
    await adminPage.fill('#data-search', q);
    await expect(rgp.row(data.name).first()).toBeVisible({ timeout: 20000 });
  }
  await saveEvidence(adminPage, 'TC-RGP-012');
});

test('TC-RGP-013: no-match search shows zero rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  await rgp.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-rgp-xyz-123');
  await expect(rgp.row('no-such-rgp-xyz-123')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-RGP-013');
});

test('TC-RGP-014: sorting reorders resolver group rows', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const asc = await rgp.sortAndReadNames('asc');
  const desc = await rgp.sortAndReadNames('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-RGP-014');
});

test('TC-RGP-020: print view renders', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = getNewResolverGroup();
  await rgp.addResolverGroup(data, member.email);
  await rgp.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-RGP-020');
});

test('TC-RGP-021: multi-word search keeps cells readable (KASSIST-988)', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const rgp = new ResolverGroupPage(adminPage);
  const member = await rgp.ensureMemberEmployee();
  const data = { ...getNewResolverGroup(), name: `QA Rg ${Date.now().toString().slice(-6)} A` };
  await rgp.addResolverGroup(data, member.email);
  await rgp.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name: data.name, row: (n) => rgp.row(n), bugKey: 'KASSIST-988', tcId: 'TC-RGP-021', screen: 'Resolver Group' });
});
