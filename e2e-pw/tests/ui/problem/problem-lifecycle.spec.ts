import { test, expect } from '../../../fixtures/test-fixtures';
import { ProblemPage } from '../../../pages/ProblemPage';
import { getNewProblem } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight, recordToasts } from '../../../utils/narrate';

// Covers Story KASSIST-1241 (Epic KASSIST-1240) sub-tasks TC-PRB-015..025:
// Investigation & RCA, Known Error, CAPA actions, resolution/closure gate, reopen, major problem.

test.beforeEach(async ({ adminPage }) => {
  test.slow();
  test.setTimeout(420000);
  await recordToasts(adminPage);
});

const CLOSE_BLOCKERS = /Cannot close this problem yet/;

test('TC-PRB-015: save investigation and rca', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  const rc = `Memory leak in mail relay ${Date.now().toString().slice(-5)}`;
  await caption(adminPage, 'TC-PRB-015 · Step 1', 'Open Investigation & RCA, fill findings, RCA method Five Whys and root cause, Save.');
  await prb.saveInvestigation(rc);
  const toast = await prb.toastShown('Investigation & RCA saved successfully');
  const cardText = (await prb.card(/Investigation/).textContent()) || '';
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Investigation"))', '#12b76a');
  const ok = toast && cardText.includes(rc);
  await caption(adminPage, `TC-PRB-015 · Result ${ok ? '(PASS)' : '(FAIL)'}`, `Toast: ${toast ? 'shown' : 'missing'}. Root cause on Track page: ${cardText.includes(rc) ? `"${rc}"` : 'not shown'}.`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-015');
  expect(toast).toBe(true);
  expect(cardText).toContain(rc);
});

test('TC-PRB-016: draft rca with ai', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/investigation');
  await highlight(adminPage, '#draft-rca-btn');
  await caption(adminPage, 'TC-PRB-016 · Step 1', 'Click "Draft with AI".');
  await adminPage.locator('#draft-rca-btn').click();
  const status = adminPage.locator('#draft-rca-status');
  await expect(status).not.toHaveText(/Drafting/, { timeout: 120000 });
  const st = ((await status.textContent()) || '').trim();
  const filled = (await adminPage.inputValue('#root_cause_summary')).trim();
  const ok = /Draft ready/.test(st) && filled.length > 0;
  await highlight(adminPage, '#root_cause_summary', ok ? '#12b76a' : '#f04438');
  await caption(adminPage, `TC-PRB-016 · Result ${ok ? '(PASS)' : '(FAIL)'}`, `Status: "${st}". Root cause summary: ${filled ? `"${filled.slice(0, 120)}"` : 'empty'}.`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-016');
  expect(st).toMatch(/Draft ready/);
  expect(filled).not.toBe('');
});

test('TC-PRB-017: save known error and workaround', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/known-error');
  await adminPage.selectOption('#status', 'Published');
  await adminPage.check('#workaround_available');
  await adminPage.fill('#workaround_instructions', 'Restart the mail relay service and clear the queue.');
  await adminPage.fill('#workaround_limitations', 'Queued mail is delayed by up to 10 minutes.');
  await caption(adminPage, 'TC-PRB-017 · Step 1', 'Known Error: Status Published, Workaround available, instructions + limitations. Save.');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Known Error & Workaround saved successfully');
  const cardText = (await prb.card(/Known Error/).textContent()) || '';
  const ker = (cardText.match(/KER\d+/) || [])[0] || '';
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Known Error"))', '#12b76a');
  await caption(adminPage, 'TC-PRB-017 · Step 1 · Result', `Toast: ${toast ? 'shown' : 'missing'}. Track page shows ${ker || '(no number)'}, Published, Workaround Available: ${/Workaround Available\s*Yes/.test(cardText) ? 'Yes' : '?'}.`, toast && ker ? 'pass' : 'fail');
  await prb.openSubForm('/known-error');
  const instr = await adminPage.inputValue('#workaround_instructions');
  const limits = await adminPage.inputValue('#workaround_limitations');
  const ok = toast && !!ker && instr.includes('Restart the mail relay') && limits.includes('delayed');
  await highlight(adminPage, '#workaround_instructions', ok ? '#12b76a' : '#f04438');
  await caption(adminPage, `TC-PRB-017 · Result ${ok ? '(PASS)' : '(FAIL)'}`, `Edit Known Error shows the saved workaround: "${instr}" / limitations "${limits}".`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-017');
  expect(toast).toBe(true);
  expect(ker).not.toBe('');
  expect(instr).toContain('Restart the mail relay');
  expect(limits).toContain('delayed');
});

test('TC-PRB-018: convert known error to kb once', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/known-error');
  await adminPage.selectOption('#status', 'Published');
  await adminPage.check('#workaround_available');
  await adminPage.fill('#workaround_instructions', 'Restart the mail relay service and clear the queue.');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const trackUrl = adminPage.url().split('?')[0];
  // Second tab open on the same Known Error form (e.g. a colleague / a stale tab).
  const tab2 = await adminPage.context().newPage();
  await tab2.goto(`${trackUrl}/known-error`, { waitUntil: 'domcontentloaded' });
  await prb.openSubForm('/known-error');
  await adminPage.locator('select[name="kb_category"]').selectOption({ index: 1 });
  await highlight(adminPage, 'form[action$="/convert-to-kb"]');
  await caption(adminPage, 'TC-PRB-018 · Step 1', 'Choose a KB category and click Convert to Knowledge Article.');
  await adminPage.locator('form[action$="/convert-to-kb"] button[type="submit"]').click();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Knowledge article created successfully');
  await prb.openSubForm('/known-error');
  const first = (((await adminPage.locator('body').textContent()) || '').match(/KB article #(\d+)/) || [])[1] || '';
  await highlight(adminPage, 'p:has-text("Already converted")', '#12b76a');
  await caption(adminPage, 'TC-PRB-018 · Step 1 · Result', `Toast: ${toast ? 'shown' : 'missing'}. Form now says "Already converted (KB article #${first})".`, toast && first ? 'pass' : 'fail');
  // Step 2: the stale tab still shows the convert box — submit it again.
  await tab2.locator('select[name="kb_category"]').selectOption({ index: 1 });
  await tab2.locator('form[action$="/convert-to-kb"] button[type="submit"]').click();
  await tab2.waitForLoadState('domcontentloaded');
  const tab2Url = tab2.url();
  await tab2.close();
  await adminPage.goto(trackUrl, { waitUntil: 'domcontentloaded' }); // back to Track (same page the form's Cancel leads to)
  await prb.openSubForm('/known-error');
  const second = (((await adminPage.locator('body').textContent()) || '').match(/KB article #(\d+)/) || [])[1] || '';
  const dup = !!second && second !== first;
  await highlight(adminPage, 'p:has-text("Already converted")', dup ? '#f04438' : '#12b76a');
  await caption(adminPage, `TC-PRB-018 · Step 2 · Result ${dup ? '(BUG)' : '(PASS)'}`,
    dup ? `Converting again from a second tab created another KB article: #${first} → #${second} (${tab2Url.includes('kb_article_created') ? 'success toast shown again' : 'redirect ' + new URL(tab2Url).search}).`
      : `Second convert did not create another article (still #${first}).`, dup ? 'fail' : 'pass');
  await saveEvidence(adminPage, 'TC-PRB-018');
  expect(toast).toBe(true);
  expect(first).not.toBe('');
  expect(dup, 'second convert must not create another KB article').toBe(false);
});

test('TC-PRB-019: add capa action description mandatory', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/action/add');
  await adminPage.evaluate(() => { (document.querySelector('form.form-grid') as HTMLFormElement).noValidate = true; });
  await caption(adminPage, 'TC-PRB-019 · Step 1', 'Save the action with an EMPTY Description (browser check bypassed).');
  await prb.saveSubForm();
  await expect(prb.formError).toBeVisible({ timeout: 20000 });
  const err = ((await prb.formError.textContent()) || '').trim();
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'TC-PRB-019 · Step 1 · Result', `Server rejects it: "${err}".`, 'pass');
  expect(err).toContain('Description is required');
  const desc = `QA corrective action ${Date.now().toString().slice(-5)}`;
  await adminPage.selectOption('#action_type', 'Corrective');
  await adminPage.fill('#description', desc);
  if ((await adminPage.locator('#owner_id option').count()) > 1) await adminPage.selectOption('#owner_id', { index: 1 });
  await caption(adminPage, 'TC-PRB-019 · Step 2', 'Fill type Corrective, description and owner; Save.');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Action saved successfully');
  const row = prb.card(/Corrective/).locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 20000 });
  const act = (((await row.textContent()) || '').match(/ACT\d+/) || [])[0] || '';
  await highlight(adminPage, `tr:has-text("${desc}")`, '#12b76a');
  await caption(adminPage, `TC-PRB-019 · Result ${toast && act ? '(PASS)' : '(FAIL)'}`, `Toast: ${toast ? 'shown' : 'missing'}. Action ${act} listed.`, toast && act ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-019');
  expect(toast).toBe(true);
  expect(act).not.toBe('');
});

test('TC-PRB-020: edit action complete and remove', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  const desc = `QA preventive action ${Date.now().toString().slice(-5)}`;
  await prb.addAction(desc);
  const row = () => prb.card(/Corrective/).locator('tr', { hasText: desc });
  await row().locator('a:has-text("Edit")').click();
  await expect(adminPage.locator('form.form-grid')).toBeVisible();
  await adminPage.selectOption('#status', 'Completed');
  await adminPage.fill('#completion_percentage', '100');
  await caption(adminPage, 'TC-PRB-020 · Step 1', 'Edit the action: Status Completed, 100%. Save.');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await expect(row()).toContainText('Completed', { timeout: 20000 });
  await highlight(adminPage, `tr:has-text("${desc}")`, '#12b76a');
  await caption(adminPage, 'TC-PRB-020 · Step 1 · Result', 'Action shows Completed.', 'pass');
  adminPage.on('dialog', (d) => d.accept());
  await row().locator('button:has-text("Remove")').click();
  await adminPage.waitForLoadState('domcontentloaded');
  await expect(prb.card(/Corrective/).locator('tr', { hasText: desc })).toHaveCount(0, { timeout: 20000 });
  await caption(adminPage, 'TC-PRB-020 · Result (PASS)', 'After Remove (confirmed) the action is no longer listed.', 'pass');
  await saveEvidence(adminPage, 'TC-PRB-020');
});

test('TC-PRB-021: close blocked by closure gate', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.addAction('QA open action blocking closure');
  await caption(adminPage, 'TC-PRB-021 · Step 1', 'No RCA, one open action, closure not approved. Edit Problem → Status Closed → Save.');
  await prb.setStatusViaEdit('Closed', 'QA attempt to close');
  await expect(prb.formError).toBeVisible({ timeout: 20000 });
  const err = ((await prb.formError.textContent()) || '').replace(/\s+/g, ' ').trim();
  await highlight(adminPage, '.alert-error', '#12b76a');
  const ok = CLOSE_BLOCKERS.test(err) && /Root cause analysis has not been completed/.test(err)
    && /1 corrective\/preventive action\(s\) are not yet completed/.test(err) && /Closure has not been approved yet/.test(err);
  await caption(adminPage, `TC-PRB-021 · Result ${ok ? '(PASS)' : '(FAIL)'}`, `Rejected: "${err}"`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-021');
  expect(ok, 'all three blockers listed').toBe(true);
});

test('TC-PRB-022: full closure with closing remark', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.saveInvestigation('Memory leak in mail relay service');
  await prb.addAction('QA completed corrective action', 'Completed');
  await prb.saveResolution('Mail relay patched and monitored for 7 days.');
  await highlight(adminPage, `form[action$="/approve-closure"] button`);
  await caption(adminPage, 'TC-PRB-022 · Step 1', 'RCA saved, action Completed, Resolution saved. Click Approve Closure.');
  await prb.postTrackForm('/approve-closure');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await expect(adminPage.locator('body')).toContainText('Ready to close.');
  await highlight(adminPage, 'div:has-text("Ready to close.")', '#12b76a');
  await caption(adminPage, 'TC-PRB-022 · Step 1 · Result', 'Closure checklist: "✓ Ready to close."', 'pass');
  await prb.clickEdit();
  await adminPage.selectOption('#status', 'Closed');
  await adminPage.waitForTimeout(500);
  const remarkVisible = await adminPage.locator('#closing_remark').isVisible().catch(() => false);
  const remark = 'QA closure: fix verified, no recurrence.';
  if (remarkVisible) await adminPage.fill('#closing_remark', remark);
  await highlight(adminPage, remarkVisible ? '#closing_remark' : '#status', remarkVisible ? '#12b76a' : '#f04438');
  await caption(adminPage, 'TC-PRB-022 · Step 2', remarkVisible ? 'Status Closed + closing remark entered. Save.' : 'Status set to Closed — but there is NO Closing Remark field on the form. Save.', remarkVisible ? 'info' : 'fail');
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const status = await prb.statusText();
  const body = (await adminPage.locator('body').textContent()) || '';
  const remarkShown = body.includes(remark);
  await highlight(adminPage, '.sr-pill', status === 'Closed' ? '#12b76a' : '#f04438');
  const ok = status === 'Closed' && remarkShown;
  await caption(adminPage, `TC-PRB-022 · Result ${ok ? '(PASS)' : status === 'Closed' ? '(CLOSED, NO REMARK)' : '(FAIL)'}`,
    `Status "${status}". Closed On ${/Closed On/i.test(body) ? 'shown' : 'not shown'}. Closing remark ${remarkShown ? 'saved and shown' : 'could not be entered / not saved'}.`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-022');
  expect(status).toBe('Closed');
  expect(remarkVisible, 'closing remark field available when closing').toBe(true);
  expect(remarkShown, 'closing remark saved').toBe(true);
});

test('TC-PRB-023: reopen requires reason', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.closeProblem();
  expect(await prb.statusText()).toBe('Closed');
  const closedOnBefore = /Closed On/i.test((await adminPage.locator('body').textContent()) || '');
  adminPage.on('dialog', (d) => d.accept());
  await adminPage.evaluate(() => {
    const i = document.querySelector('form[action$="/reopen"] input[name="reopen_reason"]') as HTMLInputElement;
    i.removeAttribute('required');
    i.value = '';
  });
  await caption(adminPage, 'TC-PRB-023 · Step 1', 'Problem is Closed. Click Reopen with an EMPTY reason (browser check bypassed).');
  await prb.postTrackForm('/reopen');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await expect(adminPage.locator('body')).toContainText('A reason is required to reopen a problem', { timeout: 20000 });
  expect(await prb.statusText()).toBe('Closed');
  await caption(adminPage, 'TC-PRB-023 · Step 1 · Result', 'Rejected: "A reason is required to reopen a problem". Still Closed.', 'pass');
  await adminPage.locator('form[action$="/reopen"] input[name="reopen_reason"]').fill('QA: issue recurred after fix');
  await caption(adminPage, 'TC-PRB-023 · Step 2', 'Enter a reason and click Reopen.');
  await prb.postTrackForm('/reopen');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Problem reopened');
  const status = await prb.statusText();
  const overview = (await prb.card('Overview').textContent()) || '';
  const closedOnAfter = /Closed On/i.test(overview);
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Overview"))', closedOnAfter ? '#f04438' : '#12b76a');
  const ok = toast && status === 'Open' && !closedOnAfter;
  await caption(adminPage, `TC-PRB-023 · Result ${ok ? '(PASS)' : '(BUG)'}`,
    `Toast: ${toast ? 'shown' : 'missing'}. Status "${status}". "Closed On" ${closedOnAfter ? 'STILL shown after reopen' : 'cleared'} (was ${closedOnBefore ? 'shown' : 'not shown'} while Closed).`, ok ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-023');
  expect(toast).toBe(true);
  expect(status).toBe('Open');
  expect(closedOnAfter, 'Closed On cleared after reopen').toBe(false);
});

test('TC-PRB-024: edit cannot bypass reopen', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.closeProblem();
  expect(await prb.statusText()).toBe('Closed');
  await caption(adminPage, 'TC-PRB-024 · Step 1', 'Problem is Closed. Edit Problem → Status Open (no reopen reason) → Save.');
  await prb.setStatusViaEdit('Open');
  await adminPage.waitForLoadState('domcontentloaded');
  const onTrack = /\/problem\/track\/\d+/.test(adminPage.url());
  const status = onTrack ? await prb.statusText() : 'Closed';
  const bypassed = status === 'Open';
  if (onTrack) await highlight(adminPage, '.sr-pill', bypassed ? '#f04438' : '#12b76a');
  await caption(adminPage, `TC-PRB-024 · Result ${bypassed ? '(BUG)' : '(PASS)'}`,
    bypassed ? 'Closed → Open saved directly from Edit: no reopen reason asked, Reopen flow bypassed.' : 'Edit could not reopen the problem without a reason.', bypassed ? 'fail' : 'pass');
  await saveEvidence(adminPage, 'TC-PRB-024');
  expect(bypassed, 'Edit must not reopen a Closed problem without a reason').toBe(false);
});

test('TC-PRB-025: major problem team and sign-off', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem({ major: true });
  await prb.create(data);
  await expect(adminPage.locator('.sr-pill', { hasText: 'MAJOR' })).toBeVisible();
  const team = prb.card(/Task Force/);
  const options = await team.locator('select[name="employee_id"] option').evaluateAll((os) =>
    os.map((o) => ({ v: (o as HTMLOptionElement).value, t: (o.textContent || '').trim() })).filter((o) => o.v));
  expect(options.length, 'at least two employees available').toBeGreaterThanOrEqual(2);
  for (const o of options.slice(0, 2)) {
    await prb.card(/Task Force/).locator('select[name="employee_id"]').selectOption(o.v);
    await prb.postTrackForm('/team/add');
    await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  }
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Task Force"))', '#12b76a');
  await caption(adminPage, 'TC-PRB-025 · Step 1', `Major problem: added ${options[0].t} and ${options[1].t} to the Task Force.`, 'pass');
  for (const o of options.slice(0, 2)) await expect(prb.card(/Task Force/)).toContainText(o.t);
  await prb.card(/Task Force/).locator(`form[action$="/team/${options[1].v}/remove"] button`).click();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await expect(prb.card(/Task Force/).locator(`form[action$="/team/${options[1].v}/remove"]`)).toHaveCount(0);
  await caption(adminPage, 'TC-PRB-025 · Step 2', `Removed ${options[1].t} (×). Task Force updated.`, 'pass');
  // Gate: RCA saved but not approved, closure approved, no sign-off.
  await prb.saveInvestigation('Major outage: storage controller firmware bug', 'Pending');
  await prb.saveResolution('Firmware upgraded on all controllers.');
  await prb.postTrackForm('/approve-closure');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.setStatusViaEdit('Closed', 'QA major close attempt');
  await expect(prb.formError).toBeVisible({ timeout: 20000 });
  const err = ((await prb.formError.textContent()) || '').replace(/\s+/g, ' ').trim();
  await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(adminPage, 'TC-PRB-025 · Step 3', `Close blocked: "${err}"`, 'pass');
  expect(err).toContain('Major Problem: RCA has not been formally approved');
  expect(err).toContain('Major Problem: management sign-off is required');
  // Approve RCA + management sign-off, then close.
  await prb.openTrack(data.title);
  await prb.saveInvestigation('Major outage: storage controller firmware bug', 'Approved');
  await highlight(adminPage, `form[action$="/management-sign-off"] button`);
  await caption(adminPage, 'TC-PRB-025 · Step 4', 'RCA approval set to Approved. Click Management Sign-Off.');
  await prb.postTrackForm('/management-sign-off');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await adminPage.waitForTimeout(1500);
  const signOffToast = (await adminPage.evaluate(() => {
    const t = (window as unknown as { __toasts?: string[] }).__toasts || [];
    const n = Array.from(document.querySelectorAll('[data-toast-message]')).map((x) => x.getAttribute('data-toast-message') || '');
    return [...t, ...n].filter(Boolean).join(' | ');
  })).trim();
  await caption(adminPage, 'TC-PRB-025 · Step 4 · Result', `Sign-off recorded. Message shown: "${signOffToast}".`, /sign/i.test(signOffToast) ? 'pass' : 'fail');
  await prb.setStatusViaEdit('Closed', 'QA major close');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const status = await prb.statusText();
  await highlight(adminPage, '.sr-pill', status === 'Closed' ? '#12b76a' : '#f04438');
  await caption(adminPage, `TC-PRB-025 · Result ${status === 'Closed' ? '(PASS)' : '(FAIL)'}`, `After RCA approval + management sign-off + closure approval the major problem is "${status}".`, status === 'Closed' ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-025');
  expect(status).toBe('Closed');
  expect.soft(signOffToast, 'sign-off has its own success message').toMatch(/sign/i);
});
