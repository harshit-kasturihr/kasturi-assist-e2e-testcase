import { execFileSync } from 'child_process';
import path from 'path';
import { test, expect } from '../../../fixtures/test-fixtures';
import { ProblemPage } from '../../../pages/ProblemPage';
import { getNewProblem } from '../../../utils/testData';
import { saveEvidence, EVIDENCE_DIR } from '../../../utils/evidence';
import { caption, highlight, recordToasts } from '../../../utils/narrate';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';

// Covers Story KASSIST-1241 (Epic KASSIST-1240) sub-tasks TC-PRB-001..014, 026..028.
// Lifecycle cases (RCA, Known Error, CAPA, closure, major) live in problem-lifecycle.spec.ts.

test.beforeEach(async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await recordToasts(adminPage);
});

test('TC-PRB-001: problem list loads', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.gotoListViaUI();
  const headers = (await adminPage.locator('table thead th').allTextContents()).map((h) => h.trim().toLowerCase());
  for (const col of ['problem no', 'title', 'status', 'priority', 'category', 'affected service', 'assigned analyst', 'reported on']) {
    expect(headers.join('|'), `column "${col}"`).toContain(col);
  }
  await expect(prb.addButton).toBeVisible();
  await expect(adminPage.locator('.record-count').first()).toBeVisible();
  await highlight(adminPage, 'table thead', '#12b76a');
  await caption(adminPage, 'TC-PRB-001 · Problem list', 'All 8 columns, search, sort, record count and "+ Add New Problem Management" are shown.', 'pass');
  await saveEvidence(adminPage, 'TC-PRB-001');
});

test('TC-PRB-002: search by problem no and title', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem();
  const no = await prb.create(data);
  await prb.gotoListViaUI();
  await prb.search(no);
  await expect(prb.row(no).first()).toBeVisible({ timeout: 20000 });
  await highlight(adminPage, `tr.data-row:has-text("${no}")`, '#12b76a');
  await caption(adminPage, 'TC-PRB-002 · Step 1', `Search by Problem No "${no}" finds the row.`, 'pass');
  await adminPage.fill('#data-search', '');
  await expectCleanMultiWordSearch(adminPage, {
    name: data.title, row: (n) => prb.row(n), bugKey: 'TC-PRB-002 · Step 2', tcId: 'TC-PRB-002', screen: 'Problem',
  });
});

test('TC-PRB-003: dashboard cards open filtered list', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.gotoDashboardViaUI();
  const card = adminPage.locator('a.pd-card[href*="filter=open"]').first();
  await expect(card).toBeVisible();
  const value = Number(((await card.locator('.pd-value').textContent()) || '0').replace(/\D/g, ''));
  await highlight(adminPage, 'a.pd-card[href*="filter=open"]');
  await caption(adminPage, 'TC-PRB-003 · Step 1', `Dashboard "Open" card shows ${value}. Click it.`);
  await card.click();
  await adminPage.waitForURL(/filter=open/, { timeout: 30000 });
  const countText = (await adminPage.locator('.record-count').first().textContent()) || '';
  const total = Number((countText.match(/of\s+(\d+)/) || [])[1] || '0');
  const ok = total === value;
  await highlight(adminPage, '.record-count', ok ? '#12b76a' : '#f04438');
  await caption(adminPage, `TC-PRB-003 · Result ${ok ? '(PASS)' : '(MISMATCH)'}`, `Filtered list shows ${total} records; card said ${value}.`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-003');
  expect(total, 'filtered list count equals dashboard card value').toBe(value);
});

test('TC-PRB-004: export excel matches list', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.gotoListViaUI();
  const countText = (await adminPage.locator('.record-count').first().textContent()) || '';
  const listTotal = Number((countText.match(/of\s+(\d+)/) || [])[1] || '0');
  await highlight(adminPage, '.record-count');
  await caption(adminPage, 'TC-PRB-004 · Step 1', `Problem list shows ${listTotal} records for this user. Click Export Excel.`);
  const exportBtn = adminPage.locator('a:has-text("Export Excel")').first();
  await highlight(adminPage, 'a:has-text("Export Excel")');
  const [download] = await Promise.all([adminPage.waitForEvent('download', { timeout: 60000 }), exportBtn.click()]);
  const file = path.join(EVIDENCE_DIR, 'TC-PRB-004-export.xlsx');
  await download.saveAs(file);
  const py = path.resolve(EVIDENCE_DIR, '../../../venv/bin/python');
  const out = execFileSync(py, ['-c',
    'import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;rows=[r for r in ws.iter_rows(values_only=True) if any(c not in (None,"") for c in r)];' +
    'h=[str(c or "").lower() for c in rows[0]];si=next((i for i,c in enumerate(h) if c=="status"),-1);' +
    'print(len(rows)-1, sum(1 for r in rows[1:] if si>=0 and str(r[si]).strip()=="Draft"))', file]).toString().trim();
  const [exportRows, exportDrafts] = out.split(/\s+/).map(Number);
  const ok = exportRows === listTotal;
  await caption(adminPage, `TC-PRB-004 · Result ${ok ? '(PASS)' : '(MISMATCH)'}`,
    `Export has ${exportRows} rows (${exportDrafts} Draft); the list shows ${listTotal}. Expected the same records as the list.`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-004');
  console.log(`TC-PRB-004 list=${listTotal} exportRows=${exportRows} exportDrafts=${exportDrafts}`);
  expect(exportRows, 'export row count equals the list record count').toBe(listTotal);
});

test('TC-PRB-005: delete from list deactivates', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem();
  const no = await prb.create(data);
  await prb.gotoListViaUI();
  await prb.search(no);
  const del = prb.row(no).first().locator('button.delete-btn');
  await expect(del).toBeVisible({ timeout: 20000 });
  await highlight(adminPage, `tr.data-row:has-text("${no}") button.delete-btn`);
  await caption(adminPage, 'TC-PRB-005 · Step 1', `Click Delete on ${no} and confirm.`);
  adminPage.on('dialog', (d) => d.accept());
  const [resp] = await Promise.all([
    adminPage.waitForResponse((r) => r.request().method() === 'POST' && /delete/.test(r.url()), { timeout: 20000 }).catch(() => null),
    del.click(),
  ]);
  // Some list pages use an in-page confirm modal instead of window.confirm.
  const modalYes = adminPage.locator('.modal.show button:has-text("Delete"), .confirm-modal button:has-text("Delete"), #confirm-delete').first();
  let r = resp;
  if (!r && (await modalYes.isVisible().catch(() => false))) {
    [r] = await Promise.all([
      adminPage.waitForResponse((x) => x.request().method() === 'POST' && /delete/.test(x.url()), { timeout: 20000 }).catch(() => null),
      modalYes.click(),
    ]);
  }
  await adminPage.waitForTimeout(2500);
  const toast = ((await adminPage.locator('.toast').allTextContents()).join(' ')).trim();
  console.log(`TC-PRB-005 delete POST ${r?.url()} -> ${r?.status()} toast="${toast}"`);
  await prb.gotoListViaUI();
  await prb.search(no);
  const left = await prb.row(no).count();
  await caption(adminPage, `TC-PRB-005 · Result ${left === 0 ? '(PASS)' : '(BUG)'}`,
    `Delete request: ${r ? `${r.status()} ${new URL(r.url()).pathname}` : 'none'}. Toast: "${toast}". Rows left for ${no}: ${left}.`, left === 0 ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-005');
  expect(left, 'problem removed from the list after delete').toBe(0);
});

test('TC-PRB-006: create valid problem', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem({ impact: 'High', urgency: 'High' });
  await prb.openAddForm();
  await prb.fillForm(data);
  await expect(adminPage.locator('#priority-display')).toHaveText(/Critical/);
  await highlight(adminPage, '#priority-display', '#12b76a');
  await caption(adminPage, 'TC-PRB-006 · Step 1', 'Impact High × Urgency High → Priority shows "Critical". Click Save.');
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  expect(await prb.toastShown('Problem created successfully'), 'success toast').toBe(true);
  await expect(adminPage.locator('main, body').first()).toContainText(data.title);
  await expect(adminPage.locator('body')).toContainText('Critical');
  const no = ((await adminPage.locator('h1.sr-id').textContent()) || '').trim();
  await highlight(adminPage, 'h1.sr-id', '#12b76a');
  await caption(adminPage, 'TC-PRB-006 · Result (PASS)', `Problem ${no} created: toast "Problem created successfully", Track page opened, Priority Critical.`, 'pass');
  await saveEvidence(adminPage, 'TC-PRB-006');
});

test('TC-PRB-007: mandatory title and description', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.openAddForm();
  await prb.save();
  const msg = await adminPage.locator('#title').evaluate((el) => (el as HTMLInputElement).validationMessage);
  expect(msg, 'browser required-check on Title').not.toBe('');
  await expect(adminPage).toHaveURL(/\/problem\/add/);
  await highlight(adminPage, '#title');
  await caption(adminPage, 'TC-PRB-007 · Step 1', `Empty form: browser blocks Save ("${msg}").`, 'pass');
  await adminPage.evaluate(() => { (document.getElementById('problem-form') as HTMLFormElement).noValidate = true; });
  await prb.save();
  await expect(prb.formError).toBeVisible({ timeout: 20000 });
  const err = ((await prb.formError.textContent()) || '').trim();
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'TC-PRB-007 · Step 2 · Server check', `Browser check bypassed: server returns "${err}".`, 'pass');
  await saveEvidence(adminPage, 'TC-PRB-007');
  expect(err).toContain('Title and Description are mandatory');
  await expect(adminPage).not.toHaveURL(/\/problem\/track\//);
});

test('TC-PRB-008: priority override needs reason', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem();
  await prb.openAddForm();
  await prb.fillForm(data);
  await adminPage.check('#priority_override');
  await adminPage.selectOption('#priority', 'Critical');
  await adminPage.fill('#priority_override_reason', '');
  await highlight(adminPage, '#priority_override_reason');
  await caption(adminPage, 'TC-PRB-008 · Step 1', 'Tick Override Priority, choose Critical, leave the reason EMPTY, click Save.');
  await prb.save();
  await adminPage.waitForLoadState('domcontentloaded');
  const onTrack = /\/problem\/track\/\d+/.test(adminPage.url());
  const err = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').trim() : '';
  const reasonMsg = onTrack ? '' : await adminPage.locator('#priority_override_reason').evaluate((el) => (el as HTMLInputElement).validationMessage, null, { timeout: 5000 }).catch(() => '');
  const body = onTrack ? ((await adminPage.locator('body').textContent()) || '') : '';
  const prio = onTrack ? (body.match(/Priority\s*:?\s*(Critical|High|Medium|Low)/) || [])[1] || '?' : '';
  const blocked = !onTrack && (!!err || !!reasonMsg);
  await caption(adminPage, `TC-PRB-008 · Result ${blocked ? '(PASS)' : '(BUG)'}`,
    blocked ? `Save blocked: "${err || reasonMsg}".` : `No validation: problem was saved with Priority ${prio}; the override was silently dropped.`, blocked ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-008');
  expect(blocked, 'override without reason is rejected with a message').toBe(true);
});

test('TC-PRB-009: edit problem saves', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem();
  await prb.create(data);
  await prb.clickEdit();
  await adminPage.fill('#category', 'Email Edited');
  await adminPage.selectOption('#urgency', 'High');
  await caption(adminPage, 'TC-PRB-009 · Step 1', 'Edit: Category → "Email Edited", Urgency → High. Click Save.');
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Problem updated successfully');
  await expect(adminPage.locator('body')).toContainText('Email Edited');
  await caption(adminPage, `TC-PRB-009 · Result ${toast ? '(PASS)' : '(NO TOAST)'}`, `Track page shows Category "Email Edited", Priority High; toast "Problem updated successfully": ${toast ? 'shown' : 'missing'}.`, toast ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-009');
  expect(toast, 'update toast').toBe(true);
});

test('TC-PRB-010: cannot create problem as closed', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem({ status: 'Closed' });
  await prb.openAddForm();
  await prb.fillForm(data);
  await highlight(adminPage, '#status');
  await caption(adminPage, 'TC-PRB-010 · Step 1', 'New problem with Status = Closed (no RCA, no closure approval). Click Save.');
  await prb.save();
  await adminPage.waitForLoadState('domcontentloaded');
  const onTrack = /\/problem\/track\/\d+/.test(adminPage.url());
  const status = onTrack ? await prb.statusText() : '';
  const err = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').trim() : '';
  const blocked = !onTrack;
  if (onTrack) await highlight(adminPage, '.sr-pill', '#f04438');
  await caption(adminPage, `TC-PRB-010 · Result ${blocked ? '(PASS)' : '(BUG)'}`,
    blocked ? `Rejected: "${err}"` : `Problem created directly with status "${status}" — closure checks (RCA, approval) were skipped.`, blocked ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-010');
  expect(blocked, 'Closed status at creation is rejected by the closure gate').toBe(true);
});

test('TC-PRB-011: draft visible only to creator and submit', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem({ status: 'Draft' });
  await prb.openAddForm();
  await prb.fillForm(data);
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  expect(await prb.toastShown('Draft saved')).toBe(true);
  expect(await prb.statusText()).toBe('Draft');
  await highlight(adminPage, '.sr-pill');
  await caption(adminPage, 'TC-PRB-011 · Step 1', 'Saved as Draft: toast "Draft saved — only you can see it until you submit it", status Draft.');
  await highlight(adminPage, `form[action$="/submit"] button`);
  await caption(adminPage, 'TC-PRB-011 · Step 2', 'Click 🚀 Submit.');
  await prb.postTrackForm('/submit');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Problem submitted');
  const status = await prb.statusText();
  await highlight(adminPage, '.sr-pill', '#12b76a');
  await caption(adminPage, `TC-PRB-011 · Result ${status === 'Open' ? '(PASS)' : '(FAIL)'}`, `After Submit: status "${status}", toast "Problem submitted — now visible to everyone with access": ${toast ? 'shown' : 'missing'}. (Other-user visibility not checked: no second QA login.)`, status === 'Open' ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-011');
  expect(status).toBe('Open');
  expect(toast).toBe(true);
});

test('TC-PRB-012: discard draft', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem({ status: 'Draft' });
  await prb.openAddForm();
  await prb.fillForm(data);
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const no = ((await adminPage.locator('h1.sr-id').textContent()) || '').trim();
  adminPage.on('dialog', (d) => d.accept());
  await highlight(adminPage, `form[action$="/discard"] button`);
  await caption(adminPage, 'TC-PRB-012 · Step 1', `Draft ${no}: click 🗑 Discard Draft and confirm.`);
  await prb.postTrackForm('/discard');
  await adminPage.waitForURL(/\/problem(\?|$)/, { timeout: 30000 });
  await adminPage.waitForTimeout(1500);
  const msg = ((await adminPage.locator('.toast, .alert-success, .flash, [data-toast-message]').allTextContents()).join(' ')).trim();
  await prb.search(no);
  const left = await prb.row(no).count();
  const ok = left === 0 && /discard/i.test(msg);
  await caption(adminPage, `TC-PRB-012 · Result ${ok ? '(PASS)' : left === 0 ? '(NO MESSAGE)' : '(FAIL)'}`,
    `Draft rows left: ${left}. Confirmation message: ${msg ? `"${msg}"` : 'none shown'}.`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-012');
  expect(left, 'draft removed').toBe(0);
  expect(msg, 'discard confirmation message').toMatch(/discard/i);
});

test('TC-PRB-013: link and unlink incident', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  // An existing incident number, read from the Incident list (click-through).
  await adminPage.goto('/home', { waitUntil: 'domcontentloaded' });
  await adminPage.locator('button[data-tour="panel-incident"]').click();
  await adminPage.locator('a[href="/incident"]').click();
  const firstRow = adminPage.locator('tr.data-row').first();
  await expect(firstRow).toBeVisible({ timeout: 20000 });
  // Incident list column 3 is the incident number (e.g. 2026MSPL1007-17).
  const incNo = ((await firstRow.locator('td').nth(2).textContent()) || '').trim();
  expect(incNo, 'an incident number in the Incident list').not.toBe('');
  await prb.create(getNewProblem());
  const card = prb.card('Related Incidents');
  await card.locator('#incident-link-search').fill('INC-NOPE-999999');
  await caption(adminPage, 'TC-PRB-013 · Step 1', 'Link an invalid incident number "INC-NOPE-999999".');
  await prb.postTrackForm('/link-incident');
  await expect(adminPage.locator('body')).toContainText('Incident not found', { timeout: 20000 });
  await highlight(adminPage, '.alert-error, .toast-error', '#12b76a');
  await caption(adminPage, 'TC-PRB-013 · Step 1 · Result', 'Error "Incident not found" shown.', 'pass');
  // Step 2 as a user does it: type part of the number, pick it from the autocomplete.
  const search = prb.card('Related Incidents').locator('#incident-link-search');
  await search.fill('');
  await search.pressSequentially(incNo.slice(0, 8), { delay: 80 });
  const item = adminPage.locator('#incident-link-dropdown .sr-link-dropdown-item').first();
  const hasItem = await item.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  const itemText = hasItem ? ((await item.textContent()) || '').replace(/\s+/g, ' ').trim() : '';
  await highlight(adminPage, '#incident-link-dropdown', hasItem ? '#12b76a' : '#f04438');
  await caption(adminPage, 'TC-PRB-013 · Step 2', hasItem ? `Type "${incNo.slice(0, 8)}" → autocomplete offers "${itemText.slice(0, 80)}". Pick it and Link.` : `Type "${incNo.slice(0, 8)}" → NO autocomplete suggestion. Type full ${incNo} and Link.`, hasItem ? 'info' : 'fail');
  if (hasItem) await item.click();
  else await search.fill(incNo);
  const picked = await search.inputValue();
  console.log(`TC-PRB-013 incNo=${incNo} suggestion="${itemText}" picked="${picked}"`);
  await prb.postTrackForm('/link-incident');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const linkErr = ((await adminPage.locator('.alert-error').allTextContents()).join(' ')).trim();
  if (linkErr) {
    await highlight(adminPage, '.alert-error', '#f04438');
    await caption(adminPage, 'TC-PRB-013 · Step 2 · Result (BUG)', `Linking "${picked}" (incident ${incNo} from the Incident list) failed: "${linkErr}".`, 'fail');
    await saveEvidence(adminPage, 'TC-PRB-013');
  }
  expect(linkErr, `link existing incident ${incNo} via "${picked}"`).toBe('');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const linked = prb.card('Related Incidents').locator('tr', { hasText: incNo });
  await expect(linked).toBeVisible({ timeout: 20000 });
  await highlight(adminPage, `section.sr-card:has(h2:has-text("Related Incidents")) tr:has-text("${incNo}")`, '#12b76a');
  await caption(adminPage, 'TC-PRB-013 · Step 2 · Result', `${incNo} is listed under Related Incidents.`, 'pass');
  adminPage.on('dialog', (d) => d.accept());
  await linked.locator('button:has-text("Unlink")').click();
  await adminPage.waitForLoadState('domcontentloaded');
  await expect(prb.card('Related Incidents').locator('tr', { hasText: incNo })).toHaveCount(0, { timeout: 20000 });
  await caption(adminPage, 'TC-PRB-013 · Result (PASS)', `Unlink removed ${incNo} from Related Incidents.`, 'pass');
  await saveEvidence(adminPage, 'TC-PRB-013');
});

test('TC-PRB-014: link change by CR number', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem();
  await prb.create(data);
  // No change requests exist in QA — create one from this problem (module feature).
  await highlight(adminPage, 'form[action$="/create-change"] button');
  await caption(adminPage, 'TC-PRB-014 · Step 1', 'Related Changes: click "Create Change Request from this Problem".');
  await prb.postTrackForm('/create-change');
  await adminPage.waitForLoadState('domcontentloaded');
  await adminPage.waitForTimeout(1500);
  let changes = prb.card('Related Changes');
  if (!/\/problem\/track\//.test(adminPage.url())) {
    console.log(`TC-PRB-014 create-change landed on ${adminPage.url()}`);
    await prb.openTrack(data.title);
  }
  changes = prb.card('Related Changes');
  const cardText = ((await changes.textContent()) || '').replace(/\s+/g, ' ');
  const crNo = (cardText.match(/CR-\d{4}-\d+/) || [])[0] || '';
  const err = ((await adminPage.locator('.alert-error, .toast-error').allTextContents()).join(' ')).trim();
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Related Changes"))', crNo ? '#12b76a' : '#f04438');
  await caption(adminPage, 'TC-PRB-014 · Step 1 · Result', crNo ? `Change request ${crNo} created and linked.` : `No change request created. ${err}`, crNo ? 'pass' : 'fail');
  expect(crNo, `change request created from the problem ${err}`).not.toBe('');
  adminPage.on('dialog', (d) => d.accept());
  await changes.locator('tr', { hasText: crNo }).locator('button:has-text("Unlink")').click();
  await adminPage.waitForLoadState('domcontentloaded');
  await expect(prb.card('Related Changes').locator('tr', { hasText: crNo })).toHaveCount(0, { timeout: 20000 });
  await caption(adminPage, 'TC-PRB-014 · Step 2', `Unlinked ${crNo}. Now link it back by its number, as the placeholder suggests.`);
  const input = prb.card('Related Changes').locator('input[name="change_ref"]');
  const placeholder = (await input.getAttribute('placeholder')) || '';
  await input.fill(crNo);
  await highlight(adminPage, 'input[name="change_ref"]');
  await caption(adminPage, 'TC-PRB-014 · Step 3', `Placeholder: "${placeholder}". Enter ${crNo}, click Link Change.`);
  await prb.postTrackForm('/link-change');
  await adminPage.waitForLoadState('domcontentloaded');
  const body = (await adminPage.locator('body').textContent()) || '';
  const notFound = body.includes('Change request not found');
  const linked = await prb.card('Related Changes').locator('tr', { hasText: crNo }).count();
  const ok = !notFound && linked > 0;
  await highlight(adminPage, notFound ? '.alert-error, .toast-error' : 'section.sr-card:has(h2:has-text("Related Changes"))', ok ? '#12b76a' : '#f04438');
  await caption(adminPage, `TC-PRB-014 · Result ${ok ? '(PASS)' : '(BUG)'}`,
    ok ? `${crNo} linked under Related Changes.` : `Linking ${crNo} (its own number, in the placeholder format) failed: "Change request not found".`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-014');
  expect(notFound, 'CR number in the placeholder format is accepted').toBe(false);
  expect(linked).toBeGreaterThan(0);
});

test('TC-PRB-026: add public and internal comment', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  const pub = `QA public update ${Date.now()}`;
  const form = adminPage.locator('form.sr-activity-form');
  await form.locator('textarea[name="comment_text"]').fill(pub);
  await caption(adminPage, 'TC-PRB-026 · Step 1', 'Add a public comment.');
  await prb.postTrackForm('/comment');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  expect(await prb.toastShown('Comment added successfully'), 'comment toast').toBe(true);
  await expect(adminPage.locator('.sr-activity-item', { hasText: pub })).toBeVisible({ timeout: 20000 });
  const internal = `QA internal note ${Date.now()}`;
  await adminPage.locator('form.sr-activity-form textarea[name="comment_text"]').fill(internal);
  await adminPage.locator('form.sr-activity-form input[name="is_internal"]').check();
  await caption(adminPage, 'TC-PRB-026 · Step 2', 'Add an internal comment (Internal ticked).');
  await prb.postTrackForm('/comment');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const intItem = adminPage.locator('.sr-activity-item', { hasText: internal });
  await expect(intItem).toBeVisible({ timeout: 20000 });
  await highlight(adminPage, `.sr-activity-item:has-text("${internal}")`, '#12b76a');
  await caption(adminPage, 'TC-PRB-026 · Step 2 · Result', `Both comments in Activity. Internal item text: "${(((await intItem.textContent()) || '').replace(/\s+/g, ' ').trim()).slice(0, 120)}"`, 'pass');
  await adminPage.evaluate(() => {
    const t = document.querySelector('form.sr-activity-form textarea[name="comment_text"]') as HTMLTextAreaElement;
    t.removeAttribute('required');
    t.value = '';
  });
  await caption(adminPage, 'TC-PRB-026 · Step 3', 'Submit an EMPTY comment (browser check bypassed).');
  await prb.postTrackForm('/comment');
  await adminPage.waitForLoadState('domcontentloaded');
  await adminPage.waitForTimeout(1500);
  const errText = ((await adminPage.locator('.alert-error, .toast-error').allTextContents()).join(' ')).trim();
  await caption(adminPage, `TC-PRB-026 · Result ${errText ? '(PASS)' : '(NO MESSAGE)'}`,
    errText ? `Empty comment rejected: "${errText}".` : 'Empty comment silently ignored — no validation message shown.', errText ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-026');
  expect(errText, 'empty comment shows a validation message').not.toBe('');
});

test('TC-PRB-027: rbac no access roles denied', async () => {
  test.skip(true, 'BLOCKED: needs Store Manager and Customer logins; only the admin login exists and the QA tenant is at its user limit.');
});

test('TC-PRB-028: attachments on add edit track', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.openAddForm();
  const fileInputs = await adminPage.locator('#problem-form input[type="file"], input[type="file"]').count();
  await caption(adminPage, 'TC-PRB-028 · Check', fileInputs ? `Attachment input found on Add form (${fileInputs}).` : 'No attachment control on the Add Problem form — KASSIST-1228 is not in this build (code only on branch origin/Yatharth).', fileInputs ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-028');
  test.skip(fileInputs === 0, 'BLOCKED: KASSIST-1228 attachments not deployed to the QA build.');
});
