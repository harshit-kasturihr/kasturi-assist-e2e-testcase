import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures/test-fixtures';
import { ProblemPage } from '../../../pages/ProblemPage';
import { IncidentPage } from '../../../pages/IncidentPage';
import { AssetPage } from '../../../pages/AssetPage';
import { getNewProblem, getNewIncident, getNewAsset } from '../../../utils/testData';
import { saveEvidence, EVIDENCE_DIR } from '../../../utils/evidence';
import { caption, highlight, recordToasts } from '../../../utils/narrate';

// Story KASSIST-1241 (Epic KASSIST-1240) coverage extension: TC-PRB-029..050.

test.beforeEach(async ({ adminPage }) => {
  test.slow();
  test.setTimeout(480000);
  await recordToasts(adminPage);
});

/** Final caption + evidence screenshot for a TC. */
async function verdict(page: Page, tc: string, ok: boolean, text: string, failLabel = 'BUG'): Promise<void> {
  await caption(page, `${tc} · Result ${ok ? '(PASS)' : `(${failLabel})`}`, text, ok ? 'pass' : 'fail');
  await saveEvidence(page, tc);
}

const bodyText = async (page: Page) => ((await page.locator('body').textContent()) || '').replace(/\s+/g, ' ');
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const recordTotal = async (page: Page) =>
  // No rows → the app renders no "Showing x of y" line at all, so don't wait for it.
  Number((((await page.locator('.record-count').first().textContent({ timeout: 10000 }).catch(() => '')) || '').match(/of\s+(\d+)/) || [])[1] || '0');

test('TC-PRB-029: major and closed in the same save', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.saveInvestigation('Disk controller firmware fault', 'Pending');
  await prb.saveResolution('Firmware rolled back on all nodes.');
  await prb.postTrackForm('/approve-closure');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await caption(adminPage, 'TC-PRB-029 · Step 1', 'Normal problem: RCA saved (approval Pending), resolution saved, closure approved — no management sign-off.');
  await prb.clickEdit();
  await adminPage.check('#is_major_problem');
  await adminPage.selectOption('#status', 'Closed');
  await highlight(adminPage, '#is_major_problem');
  await caption(adminPage, 'TC-PRB-029 · Step 2', 'In ONE save: tick Major Problem and set Status = Closed. Click Save.');
  await prb.save();
  await adminPage.waitForLoadState('domcontentloaded');
  const err = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').replace(/\s+/g, ' ').trim() : '';
  const onTrack = /\/problem\/track\/\d+/.test(adminPage.url());
  const status = onTrack ? await prb.statusText() : '';
  const blocked = /Major Problem/.test(err);
  if (onTrack) await highlight(adminPage, '.sr-pill', '#f04438');
  await verdict(adminPage, 'TC-PRB-029', blocked,
    blocked ? `Rejected with the major-problem blockers: "${err}"` : `Saved: problem is now MAJOR and "${status || 'not rejected'}" — RCA approval and management sign-off were never checked. ${err}`);
  expect(blocked, 'major rules apply when Major is ticked in the same save as Closed').toBe(true);
});

test('TC-PRB-030: reopened major problem needs sign-off again', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem({ major: true }));
  await prb.saveInvestigation('Storage array firmware bug', 'Approved');
  await prb.saveResolution('Firmware upgraded on all controllers.');
  await prb.postTrackForm('/management-sign-off');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.postTrackForm('/approve-closure');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.setStatusViaEdit('Closed', 'QA major close');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  expect(await prb.statusText()).toBe('Closed');
  await caption(adminPage, 'TC-PRB-030 · Step 1', 'Major problem closed after RCA approval, management sign-off and closure approval.');
  adminPage.on('dialog', (d) => d.accept());
  await adminPage.locator('form[action$="/reopen"] input[name="reopen_reason"]').fill('QA: outage recurred');
  await prb.postTrackForm('/reopen');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const signOffBox = ((await prb.card(/Resolution/).textContent()) || '').replace(/\s+/g, ' ');
  const stillSigned = !/Not yet signed off/.test(signOffBox);
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Resolution"))', stillSigned ? '#f04438' : '#12b76a');
  await caption(adminPage, 'TC-PRB-030 · Step 2', `Reopened. Management Sign-Off now: ${stillSigned ? 'STILL signed off from before the reopen' : 'Not yet signed off'}. Approve Closure again and close.`, stillSigned ? 'fail' : 'info');
  await prb.postTrackForm('/approve-closure');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.setStatusViaEdit('Closed', 'QA second close');
  await adminPage.waitForLoadState('domcontentloaded');
  const err = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').replace(/\s+/g, ' ').trim() : '';
  const closedAgain = /\/problem\/track\/\d+/.test(adminPage.url()) && (await prb.statusText()) === 'Closed';
  const ok = !closedAgain && /sign-off/i.test(err);
  await verdict(adminPage, 'TC-PRB-030', ok,
    ok ? `Second close blocked: "${err}"` : `Closed again without a new management sign-off (old sign-off kept after reopen).`);
  expect(ok, 'a reopened major problem needs a new management sign-off').toBe(true);
});

test('TC-PRB-031: approve closure and sign-off server checks', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem({ status: 'Draft' }));
  const btnVisible = await adminPage.locator('form[action$="/approve-closure"] button').isVisible().catch(() => false);
  await caption(adminPage, 'TC-PRB-031 · Step 1', `Draft problem. Approve Closure button ${btnVisible ? 'IS shown' : 'is not shown'}. Send the Approve Closure request anyway (stale tab / crafted request).`);
  await prb.forcePost('/approve-closure');
  const draftBody = await bodyText(adminPage);
  const draftApproved = !/Not yet approved/.test(((await prb.card(/Resolution/).textContent()) || '')) || /Closure approved/.test(draftBody);
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Resolution"))', draftApproved ? '#f04438' : '#12b76a');
  await caption(adminPage, 'TC-PRB-031 · Step 1 · Result', draftApproved ? 'Closure was APPROVED on a Draft problem.' : 'Request rejected; Draft not approved.', draftApproved ? 'fail' : 'pass');
  await prb.create(getNewProblem());
  await caption(adminPage, 'TC-PRB-031 · Step 2', 'Normal (non-major) problem: send a Management Sign-Off request.');
  await prb.forcePost('/management-sign-off');
  const acts = (await prb.activityEntries()).join(' | ');
  const signed = /Management Sign Off/i.test(acts);
  await highlight(adminPage, '.sr-activity-item:has-text("Management Sign Off")', '#f04438');
  const ok = !draftApproved && !signed;
  await verdict(adminPage, 'TC-PRB-031', ok,
    `Draft closure approval: ${draftApproved ? 'ACCEPTED' : 'rejected'}. Sign-off on a non-major problem: ${signed ? 'ACCEPTED (activity "Management Sign Off")' : 'rejected'}.`);
  expect(draftApproved, 'closure approval rejected for a Draft').toBe(false);
  expect(signed, 'management sign-off rejected for a non-major problem').toBe(false);
});

test('TC-PRB-032: title length and invalid date', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const long = `QA long title ${'X'.repeat(300)}`;
  await prb.openAddForm();
  await prb.fillForm(getNewProblem({ title: long }));
  await caption(adminPage, 'TC-PRB-032 · Step 1', `Title of ${long.length} characters (column limit 255). Save.`);
  const [r1] = await Promise.all([adminPage.waitForResponse((r) => r.request().method() === 'POST' && /\/problem\/add/.test(r.url())), prb.save()]);
  await adminPage.waitForLoadState('domcontentloaded');
  const s1 = r1.status();
  const t1 = await bodyText(adminPage);
  const err1 = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').trim() : '';
  const saved1 = /\/problem\/track\/\d+/.test(adminPage.url());
  const savedTitleLen = saved1 ? (((await adminPage.locator('h1.sr-id + *').first().textContent().catch(() => '')) || '').trim().length) : 0;
  const ok1 = s1 < 500 && !/Internal Server Error/i.test(t1) && (!!err1 || saved1);
  await caption(adminPage, `TC-PRB-032 · Step 1 · Result ${ok1 ? '' : '(BUG)'}`, `HTTP ${s1}. ${err1 ? `Message: "${err1}"` : saved1 ? `Saved (title shown ${savedTitleLen} chars)` : 'Server error page'}`, ok1 ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-032-step1');
  await prb.openAddForm();
  await prb.fillForm(getNewProblem());
  await adminPage.evaluate(() => { const d = document.getElementById('target_resolution_date') as HTMLInputElement; d.type = 'text'; d.value = '2026-13-45'; });
  await caption(adminPage, 'TC-PRB-032 · Step 2', 'Target resolution date = "2026-13-45" (invalid). Save.');
  const [r2] = await Promise.all([adminPage.waitForResponse((r) => r.request().method() === 'POST' && /\/problem\/add/.test(r.url())), prb.save()]);
  await adminPage.waitForLoadState('domcontentloaded');
  const s2 = r2.status();
  const t2 = await bodyText(adminPage);
  const err2 = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').trim() : '';
  const ok2 = s2 < 500 && !/Internal Server Error/i.test(t2) && !!err2;
  await verdict(adminPage, 'TC-PRB-032', ok1 && ok2,
    `Long title: HTTP ${s1}${err1 ? `, "${err1}"` : saved1 ? ', saved' : ', server error'}. Invalid date: HTTP ${s2}${err2 ? `, "${err2}"` : /\/problem\/track\//.test(adminPage.url()) ? ', saved without a message' : ', server error'}.`);
  expect(s1, 'long title: no server error').toBeLessThan(500);
  expect(s2, 'invalid date: no server error').toBeLessThan(500);
  expect(err2, 'invalid date: validation message').not.toBe('');
});

test('TC-PRB-033: html in title comment and rca shown as text', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const tag = Date.now().toString().slice(-6);
  const payload = `<img src=x onerror="window.__xss=1"><b>B${tag}</b>`;
  const data = getNewProblem({ title: `QA XSS ${tag} ${payload}` });
  await prb.create(data);
  await adminPage.locator('form.sr-activity-form textarea[name="comment_text"]').fill(`Comment ${payload}`);
  await prb.postTrackForm('/comment');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.saveInvestigation(`Root cause ${payload}`);
  const xssTrack = await adminPage.evaluate(() => (window as unknown as { __xss?: number }).__xss === 1);
  const literal = (await bodyText(adminPage)).includes(`<b>B${tag}</b>`);
  const boldEls = await adminPage.locator(`b:text-is("B${tag}")`).count();
  await caption(adminPage, 'TC-PRB-033 · Step 1', `Track page: script ran = ${xssTrack}; markup shown as text = ${literal}; rendered <b> elements = ${boldEls}.`, !xssTrack && boldEls === 0 ? 'pass' : 'fail');
  await prb.gotoListViaUI();
  await prb.search(`QA XSS ${tag}`);
  await adminPage.waitForTimeout(1500);
  const xssList = await adminPage.evaluate(() => (window as unknown as { __xss?: number }).__xss === 1);
  const boldList = await adminPage.locator(`b:text-is("B${tag}")`).count();
  await highlight(adminPage, 'tr.data-row', !xssList && boldList === 0 ? '#12b76a' : '#f04438');
  const ok = !xssTrack && !xssList && boldEls === 0 && boldList === 0;
  await verdict(adminPage, 'TC-PRB-033', ok, `Title, comment and root cause with <img onerror>/<b> markup: ${ok ? 'shown as plain text on Track page and list; no script ran' : `script ran (track ${xssTrack}, list ${xssList}) or markup rendered (track ${boldEls}, list ${boldList})`}.`);
  expect(ok).toBe(true);
});

test('TC-PRB-034: error text from url not displayed', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  const spoof = 'Your session has expired. Call support on +91 90000 00000 to restore access.';
  // Direct URL is the scenario itself (a crafted link), so goto is justified here.
  await adminPage.goto(`${adminPage.url().split('?')[0]}?incident_link_error=${encodeURIComponent(spoof)}`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(1500);
  const shown = (await bodyText(adminPage)).includes(spoof);
  await highlight(adminPage, '.alert-error, .toast-error', '#f04438');
  await verdict(adminPage, 'TC-PRB-034', !shown,
    shown ? `A crafted link displays attacker text as an app error: "${spoof}"` : 'Text from the URL is not displayed.');
  expect(shown, 'URL-supplied error text must not be displayed').toBe(false);
});

test('TC-PRB-035: create change request without manager or analyst', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem({ withPeople: false }));
  await highlight(adminPage, 'form[action$="/create-change"] button');
  await caption(adminPage, 'TC-PRB-035 · Step 1', 'Problem with NO Problem Manager and NO Analyst. Click "Create Change Request from this Problem".');
  await prb.postTrackForm('/create-change');
  await adminPage.waitForLoadState('domcontentloaded');
  await adminPage.waitForTimeout(1000);
  const t = await bodyText(adminPage);
  const msg = /Assign a Problem Manager or Analyst before creating a change request from this problem/.test(t);
  const cr = (((await prb.card('Related Changes').textContent().catch(() => '')) || '').match(/CR-\d{4}-\d+/) || [])[0] || '';
  await highlight(adminPage, '.alert-error, .toast-error', msg ? '#12b76a' : '#f04438');
  await verdict(adminPage, 'TC-PRB-035', msg && !cr, msg ? `Message shown: "Assign a Problem Manager or Analyst before creating a change request from this problem". No CR created.` : `No guidance message. ${cr ? `Change request ${cr} was created.` : `Landed on ${new URL(adminPage.url()).pathname}.`}`);
  expect(msg).toBe(true);
  expect(cr).toBe('');
});

test('TC-PRB-036: convert known error without workaround', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/known-error');
  await adminPage.selectOption('#status', 'Published');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.openSubForm('/known-error');
  await adminPage.locator('select[name="kb_category"]').selectOption({ index: 1 });
  await caption(adminPage, 'TC-PRB-036 · Step 1', 'Known Error saved with NO workaround text. Choose a KB category and Convert.');
  await adminPage.locator('form[action$="/convert-to-kb"] button[type="submit"]').click();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await adminPage.waitForTimeout(1000);
  const t = await bodyText(adminPage);
  const msg = /Add workaround instructions before converting to a knowledge article/.test(t);
  const created = await prb.toastShown('Knowledge article created successfully');
  await highlight(adminPage, '.alert-error, .toast-error', msg ? '#12b76a' : '#f04438');
  await verdict(adminPage, 'TC-PRB-036', msg && !created, msg ? 'Rejected: "Add workaround instructions before converting to a knowledge article". No article created.' : `No rejection message; article created: ${created}.`);
  expect(msg).toBe(true);
  expect(created).toBe(false);
});

test('TC-PRB-037: create problem from suggested incident cluster', async ({ adminPage }) => {
  test.setTimeout(900000);
  const prb = new ProblemPage(adminPage);
  const inc = new IncidentPage(adminPage);
  // Precondition: 3 open incidents on the same domain within 7 days. The form
  // allows one open incident per asset (fields stay disabled otherwise), so each
  // incident uses a different existing asset that the form accepts.
  adminPage.setDefaultNavigationTimeout(60000);
  const problems: string[] = [];
  const assetPage = new AssetPage(adminPage);
  const assets = [getNewAsset(), getNewAsset(), getNewAsset()];
  for (const a of assets) await assetPage.addAsset(a); // fresh assets: no open incidents
  for (let i = 0; i < 3; i++) {
    await inc.gotoViaUI();
    await adminPage.locator('a.btn-add[href$="/incident/add"]').click();
    let serial = '';
    for (let attempt = 0; attempt < 4 && !serial; attempt++) {
      // Same pick as the Incident suite: fill the full serial, click the suggestion.
      await inc.pickAssetSerial(assets[i].serial).catch(() => null);
      await adminPage.waitForTimeout(2500); // open-incident check runs after the pick
      if (await adminPage.locator('#problem').isEnabled()) serial = assets[i].serial;
      else await adminPage.waitForTimeout(5000);
    }
    expect(serial, `new asset ${assets[i].serial} selectable in the Incident form`).not.toBe('');
    const { problem } = getNewIncident();
    problems.push(problem);
    await adminPage.fill('#problem', problem);
    await adminPage.selectOption('#priority', 'P3');
    await adminPage.selectOption('#status', 'Open');
    await adminPage.selectOption('#effort', 'Skill');
    await adminPage.selectOption('#amc_scope', 'Non-AMC');
    await adminPage.selectOption('#domain_id', { index: 1 });
    await adminPage.selectOption('#engineer', { index: 1 });
    await adminPage.fill('#address', 'QA Address 1');
    await inc.submitForm();
    await adminPage.waitForURL('**/incident', { timeout: 30000, waitUntil: 'commit' });
    console.log(`TC-PRB-037 incident ${i + 1}: "${problem}" on ${serial}`);
  }
  await caption(adminPage, 'TC-PRB-037 · Precondition', `3 open incidents created on the same domain: ${problems.join(', ')}.`);
  await prb.gotoDashboardViaUI();
  const cluster = adminPage.locator('form[action$="/create-from-cluster"]').locator('xpath=..').filter({ hasText: problems[0] }).first();
  const found = await cluster.isVisible().catch(() => false);
  await highlight(adminPage, `div:has(> form[action$="/create-from-cluster"])`, found ? '#12b76a' : '#f04438');
  await caption(adminPage, 'TC-PRB-037 · Step 1', found ? 'Suggested Problems shows a cluster with the 3 new incidents.' : 'The 3 new incidents do not appear in Suggested Problems.', found ? 'info' : 'fail');
  if (!found) {
    await verdict(adminPage, 'TC-PRB-037', false, 'No suggested cluster for 3 open incidents created on the same domain today.');
    expect(found, 'cluster suggested').toBe(true);
  }
  const count = Number((((await cluster.textContent()) || '').match(/(\d+) incidents/) || [])[1] || '0');
  adminPage.on('dialog', (d) => d.accept());
  await cluster.locator('button[type="submit"]').click();
  await adminPage.waitForLoadState('domcontentloaded');
  const onTrack = /\/problem\/track\/\d+/.test(adminPage.url());
  const toast = onTrack && (await prb.toastShown('Problem created successfully'));
  const linked = onTrack ? await prb.card('Related Incidents').locator('tbody tr').count() : 0;
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Related Incidents"))', linked === count ? '#12b76a' : '#f04438');
  const ok = onTrack && toast && linked === count && count >= 3;
  await verdict(adminPage, 'TC-PRB-037', ok, onTrack ? `Problem created from cluster of ${count} incidents; toast ${toast ? 'shown' : 'missing'}; ${linked} incidents linked.` : `Create did not open a problem (landed on ${new URL(adminPage.url()).pathname}).`);
  expect(onTrack).toBe(true);
  expect(linked).toBe(count);
});

test('TC-PRB-038: priority matrix all combinations', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const M: Record<string, string> = {
    'High/High': 'Critical', 'High/Medium': 'High', 'High/Low': 'Medium', 'Medium/High': 'High', 'Medium/Medium': 'Medium',
    'Medium/Low': 'Low', 'Low/High': 'Medium', 'Low/Medium': 'Low', 'Low/Low': 'Low',
  };
  await prb.openAddForm();
  const wrong: string[] = [];
  for (const [k, exp] of Object.entries(M)) {
    const [i, u] = k.split('/');
    await adminPage.selectOption('#impact', i);
    await adminPage.selectOption('#urgency', u);
    const shown = ((await adminPage.locator('#priority-display').textContent()) || '').trim();
    if (shown !== exp) wrong.push(`${k}: shown ${shown}, expected ${exp}`);
  }
  await highlight(adminPage, '#priority-display', wrong.length ? '#f04438' : '#12b76a');
  await caption(adminPage, 'TC-PRB-038 · Step 1', wrong.length ? `Matrix mismatches: ${wrong.join('; ')}` : 'All 9 Impact × Urgency combinations show the expected priority.', wrong.length ? 'fail' : 'pass');
  await prb.fillForm(getNewProblem({ impact: 'Low', urgency: 'Low' }));
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const saved = ((await adminPage.locator('.sr-stat-value').first().textContent()) || '').trim();
  await highlight(adminPage, '.sr-stat-value', saved === 'Low' ? '#12b76a' : '#f04438');
  await verdict(adminPage, 'TC-PRB-038', !wrong.length && saved === 'Low', `${wrong.length ? `${wrong.length} wrong combination(s). ` : 'All 9 combinations correct. '}Saved Low × Low → Priority "${saved}".`);
  expect(wrong).toEqual([]);
  expect(saved).toBe('Low');
});

test('TC-PRB-039: priority override with reason', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.openAddForm();
  await prb.fillForm(getNewProblem());
  await adminPage.check('#priority_override');
  await adminPage.selectOption('#priority', 'Critical');
  const reason = 'CEO mailbox affected — business critical';
  await adminPage.fill('#priority_override_reason', reason);
  await caption(adminPage, 'TC-PRB-039 · Step 1', `Matrix says Medium. Override to Critical with reason "${reason}". Save.`);
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const stat = ((await adminPage.locator('.sr-stat-value').first().textContent()) || '').trim();
  const t = await bodyText(adminPage);
  const ok = /Critical \(overridden\)/.test(stat) && t.includes(reason);
  await highlight(adminPage, '.sr-stat-value', ok ? '#12b76a' : '#f04438');
  await verdict(adminPage, 'TC-PRB-039', ok, `Priority shows "${stat}"; reason ${t.includes(reason) ? 'shown' : 'not shown'} on the Track page.`, 'FAIL');
  expect(stat).toContain('Critical (overridden)');
  expect(t).toContain(reason);
});

test('TC-PRB-040: all dashboard cards match filtered lists', async ({ adminPage }) => {
  test.setTimeout(1200000); // 11 cards × (filtered list + dashboard reload)
  const prb = new ProblemPage(adminPage);
  await prb.gotoDashboardViaUI();
  const cards = await adminPage.locator('a.pd-card[href*="filter="]').evaluateAll((as) => as.map((a) => ({
    href: a.getAttribute('href') || '', label: (a.querySelector('.pd-label')?.textContent || '').trim(),
    value: Number((a.querySelector('.pd-value')?.textContent || '0').replace(/\D/g, '')),
  })));
  const rows: string[] = [];
  const bad: string[] = [];
  for (const c of cards) {
    if (!/\/problem\/dashboard/.test(adminPage.url())) {
      await adminPage.goBack({ waitUntil: 'domcontentloaded' });
      await adminPage.locator('a.pd-card').first().waitFor({ timeout: 20000 });
    }
    await adminPage.locator(`a.pd-card[href="${c.href}"]`).click();
    await adminPage.waitForURL(/filter=/, { timeout: 30000 });
    const total = await recordTotal(adminPage);
    rows.push(`${c.label}: card ${c.value} / list ${total}`);
    if (total !== c.value) bad.push(`${c.label} (card ${c.value}, list ${total})`);
  }
  await prb.gotoDashboardViaUI();
  await caption(adminPage, `TC-PRB-040 · Result ${bad.length ? '(MISMATCH)' : '(PASS)'}`, bad.length ? `Mismatched cards: ${bad.join('; ')}` : `All ${cards.length} cards match their filtered list.`, bad.length ? 'fail' : 'pass');
  await saveEvidence(adminPage, 'TC-PRB-040');
  console.log(`TC-PRB-040\n  ${rows.join('\n  ')}`);
  expect(bad).toEqual([]);
});

test('TC-PRB-041: list sort paging and no results', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.gotoListViaUI();
  const nos = async () => (await adminPage.locator('tr.data-row:visible td:first-child').allTextContents()).map((s) => s.trim());
  const opts = await adminPage.locator('#sort-filter option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  const notes: string[] = [];
  const bad: string[] = [];
  for (const v of opts) {
    await adminPage.selectOption('#sort-filter', v);
    await adminPage.waitForTimeout(800);
    const list = await nos();
    const sorted = [...list].sort();
    if (v === 'asc' && list.join() !== sorted.join()) bad.push('A-Z not ascending');
    if (v === 'desc' && list.join() !== [...sorted].reverse().join()) bad.push('Z-A not descending');
    notes.push(`${v}: ${list.slice(0, 3).join(', ')}…`);
  }
  await caption(adminPage, 'TC-PRB-041 · Step 1', `Sort options ${opts.join(', ')} — ${bad.length ? bad.join('; ') : 'orders correct'}.`, bad.length ? 'fail' : 'pass');
  const total = await recordTotal(adminPage);
  if (total > 20) {
    const first = (await nos())[0];
    await adminPage.locator('.pagination-btn', { hasText: 'Next' }).first().click();
    await adminPage.waitForLoadState('domcontentloaded');
    await adminPage.waitForTimeout(1000);
    const p2 = await nos();
    const ind = ((await adminPage.locator('.page-indicator').first().textContent().catch(() => '')) || '').trim();
    if (!p2.length || p2[0] === first || !/2/.test(ind)) bad.push(`page 2 wrong (indicator "${ind}", first row ${p2[0]})`);
    await caption(adminPage, 'TC-PRB-041 · Step 2', `Paging: ${total} records; page 2 shows ${p2.length} rows starting ${p2[0]} (${ind}).`, 'info');
  }
  await adminPage.fill('#data-search', 'zz-no-such-problem-qa');
  await adminPage.waitForTimeout(1500);
  const visible = await adminPage.locator('tr.data-row:visible').count();
  const empty = await adminPage.locator('.no-data-message, .no-results, td:has-text("No ")').first().isVisible().catch(() => false);
  if (visible !== 0 || !empty) bad.push(`no-results: ${visible} rows, message ${empty ? 'shown' : 'missing'}`);
  await highlight(adminPage, '.no-data-message, .no-results', empty ? '#12b76a' : '#f04438');
  console.log(`TC-PRB-041 ${notes.join(' | ')}`);
  await verdict(adminPage, 'TC-PRB-041', !bad.length, bad.length ? bad.join('; ') : `Sorting (${opts.length} options), paging and the no-results message work.`, 'FAIL');
  expect(bad).toEqual([]);
});

test('TC-PRB-042: status changes on edit and draft edit', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.setStatusViaEdit('Resolved');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const s1 = await prb.statusText();
  await prb.setStatusViaEdit('Cancelled');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const s2 = await prb.statusText();
  await caption(adminPage, 'TC-PRB-042 · Step 1', `Open → Resolved: "${s1}". Resolved → Cancelled: "${s2}".`, s1 === 'Resolved' && s2 === 'Cancelled' ? 'pass' : 'fail');
  const draft = getNewProblem({ status: 'Draft' });
  await prb.create(draft);
  await prb.clickEdit();
  await adminPage.fill('#title', `${draft.title} edited`);
  await prb.save();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const s3 = await prb.statusText();
  const titled = (await bodyText(adminPage)).includes(`${draft.title} edited`);
  await highlight(adminPage, '.sr-pill', s3 === 'Draft' ? '#12b76a' : '#f04438');
  const ok = s1 === 'Resolved' && s2 === 'Cancelled' && s3 === 'Draft' && titled;
  await verdict(adminPage, 'TC-PRB-042', ok, `Resolved ${s1 === 'Resolved' ? '✓' : `✗ (${s1})`}, Cancelled ${s2 === 'Cancelled' ? '✓' : `✗ (${s2})`}. Edited Draft: status "${s3}", new title ${titled ? 'saved' : 'not saved'}.`, 'FAIL');
  expect([s1, s2, s3]).toEqual(['Resolved', 'Cancelled', 'Draft']);
  expect(titled).toBe(true);
});

test('TC-PRB-043: capa completion and cancelled action', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  const actionRow = (d: string) => prb.card(/Corrective/).locator('tr', { hasText: d });
  const save = async (d: string, status: string, pct: string, due?: string) => {
    await prb.openSubForm('/action/add');
    await adminPage.evaluate(() => { (document.querySelector('form.form-grid') as HTMLFormElement).noValidate = true; });
    await adminPage.selectOption('#action_type', 'Corrective');
    await adminPage.selectOption('#status', status);
    await adminPage.fill('#description', d);
    await adminPage.fill('#completion_percentage', pct);
    if (due) await adminPage.fill('#due_date', due);
    await prb.saveSubForm();
    await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  };
  const notes: string[] = [];
  const bad: string[] = [];
  await save('QA action 150 pct', 'In Progress', '150');
  const r1 = ((await actionRow('QA action 150 pct').textContent()) || '').replace(/\s+/g, ' ');
  const pct1 = (r1.match(/(\d+)\s*%/) || [])[1] || '?';
  notes.push(`150% saved as ${pct1}%`);
  if (Number(pct1) > 100) bad.push(`completion stored as ${pct1}%`);
  await save('QA action completed at 40', 'Completed', '40');
  const r2 = ((await actionRow('QA action completed at 40').textContent()) || '').replace(/\s+/g, ' ');
  const pct2 = (r2.match(/(\d+)\s*%/) || [])[1] || '?';
  notes.push(`Completed at 40% saved (${pct2}%)`);
  if (/Completed/.test(r2) && pct2 !== '100') bad.push(`"Completed" accepted at ${pct2}%`);
  await caption(adminPage, 'TC-PRB-043 · Step 1', notes.join('. '), bad.length ? 'fail' : 'pass');
  // Overdue: an open action with a past due date; a cancelled one should not be overdue.
  await save('QA overdue open action', 'In Progress', '10', isoDate(-3));
  await save('QA overdue cancelled action', 'Cancelled', '0', isoDate(-3));
  const openOver = /Overdue/.test((await actionRow('QA overdue open action').textContent()) || '');
  const cancelOver = /Overdue/.test((await actionRow('QA overdue cancelled action').textContent()) || '');
  if (!openOver) bad.push('past-due open action not marked Overdue');
  if (cancelOver) bad.push('Cancelled action still marked Overdue');
  await highlight(adminPage, 'tr:has-text("QA overdue cancelled action")', cancelOver ? '#f04438' : '#12b76a');
  await caption(adminPage, 'TC-PRB-043 · Step 2', `Past-due open action Overdue: ${openOver}. Past-due Cancelled action Overdue: ${cancelOver}.`, openOver && !cancelOver ? 'pass' : 'fail');
  // Cancelled actions must not block closure: cancel every open action, then read the checklist.
  for (const d of ['QA action 150 pct', 'QA overdue open action']) {
    await actionRow(d).locator('a:has-text("Edit")').click();
    await adminPage.selectOption('#status', 'Cancelled');
    await prb.saveSubForm();
    await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  }
  const checklist = ((await prb.card(/Resolution/).textContent()) || '').replace(/\s+/g, ' ');
  const actionBlock = /action\(s\) are not yet completed/.test(checklist);
  if (actionBlock) bad.push('Cancelled actions still block closure');
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Resolution"))', actionBlock ? '#f04438' : '#12b76a');
  await verdict(adminPage, 'TC-PRB-043', !bad.length, bad.length ? bad.join('; ') : 'Completion clamped, Completed/Overdue/Cancelled rules correct.', bad.length ? 'BUG' : 'PASS');
  console.log(`TC-PRB-043 ${notes.join(' | ')} | issues: ${bad.join(' | ')}`);
  expect(bad).toEqual([]);
});

test('TC-PRB-044: rca rejected and investigation dates order', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/investigation');
  await adminPage.fill('#investigation_start_date', isoDate(0));
  await adminPage.fill('#investigation_completion_date', isoDate(-10));
  await adminPage.fill('#root_cause_summary', 'QA dates check');
  await highlight(adminPage, '#investigation_completion_date');
  await caption(adminPage, 'TC-PRB-044 · Step 1', `Start ${isoDate(0)}, Completion ${isoDate(-10)} (10 days BEFORE start). Save.`);
  await prb.saveSubForm();
  await adminPage.waitForLoadState('domcontentloaded');
  const err = (await prb.formError.isVisible().catch(() => false)) ? ((await prb.formError.textContent()) || '').trim() : '';
  const saved = /\/problem\/track\/\d+/.test(adminPage.url());
  await caption(adminPage, `TC-PRB-044 · Step 1 · Result ${err ? '(PASS)' : '(BUG)'}`, err ? `Rejected: "${err}"` : 'Saved without any message — completion date before start date accepted.', err ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-044-step1');
  if (!saved) await adminPage.goBack();
  await prb.saveInvestigation('QA rejected RCA', 'Rejected');
  const card = ((await prb.card(/Investigation/).textContent()) || '').replace(/\s+/g, ' ');
  const rejected = /Rejected/.test(card);
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Investigation"))', rejected ? '#12b76a' : '#f04438');
  await verdict(adminPage, 'TC-PRB-044', !!err && rejected, `Reverse dates: ${err ? 'rejected' : 'ACCEPTED'}. RCA approval "Rejected" ${rejected ? 'shown' : 'not shown'} on Track page.`);
  expect(err, 'completion date before start date is rejected').not.toBe('');
  expect(rejected).toBe(true);
});

test('TC-PRB-045: known error retired expiry publish and kb in help center', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const data = getNewProblem();
  await prb.create(data);
  const expiry = isoDate(30);
  await prb.openSubForm('/known-error');
  await adminPage.selectOption('#status', 'Published');
  await adminPage.fill('#expiry_review_date', expiry);
  await adminPage.check('#workaround_available');
  await adminPage.fill('#workaround_instructions', 'Restart the mail relay service.');
  await adminPage.check('#publish_to_service_desk');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const ke = ((await prb.card(/Known Error/).textContent()) || '').replace(/\s+/g, ' ');
  const [y, m, d] = expiry.split('-');
  const expShown = ke.includes(d) && (ke.includes(y) || ke.includes(y.slice(2)));
  await prb.openSubForm('/known-error');
  const pubKept = await adminPage.isChecked('#publish_to_service_desk');
  const expKept = (await adminPage.inputValue('#expiry_review_date')) === expiry;
  await caption(adminPage, 'TC-PRB-045 · Step 1', `Expiry ${expiry}: on Track page ${expShown ? 'shown' : 'NOT shown'}, kept in form ${expKept}. Publish to Service Desk kept: ${pubKept}.`, expKept && pubKept ? 'pass' : 'fail');
  await adminPage.locator('select[name="kb_category"]').selectOption({ index: 1 });
  await adminPage.locator('form[action$="/convert-to-kb"] button[type="submit"]').click();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const trackUrl = adminPage.url().split('?')[0];
  // Help Center: Dashboard → Knowledge Base → Help Center, search the article.
  await prb.openSidebar('knowledge_base', '/knowledge-base');
  await adminPage.locator('#kbSearchInput').fill(data.title.split(' mail')[0]);
  await adminPage.locator('#kbSearchBtn').click();
  await adminPage.waitForTimeout(2500);
  const inHelp = (await bodyText(adminPage)).includes(data.title.split(' mail')[0]);
  await highlight(adminPage, '#kbSearchInput', inHelp ? '#12b76a' : '#f04438');
  await caption(adminPage, 'TC-PRB-045 · Step 2', `Help Center search for the converted article: ${inHelp ? 'found' : 'NOT found'}.`, inHelp ? 'pass' : 'fail');
  await saveEvidence(adminPage, 'TC-PRB-045-helpcenter');
  await adminPage.goto(trackUrl, { waitUntil: 'domcontentloaded' });
  await prb.openSubForm('/known-error');
  await adminPage.selectOption('#status', 'Retired');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const retired = /Retired/.test(((await prb.card(/Known Error/).textContent()) || ''));
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Known Error"))', retired ? '#12b76a' : '#f04438');
  const ok = expKept && pubKept && inHelp && retired;
  await verdict(adminPage, 'TC-PRB-045', ok, `Expiry kept ${expKept}, Publish kept ${pubKept}, article in Help Center ${inHelp}, status Retired ${retired}.`, 'FAIL');
  expect([expKept, pubKept, inHelp, retired]).toEqual([true, true, true, true]);
});

test('TC-PRB-046: resolution fields saved and shown', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.openSubForm('/resolution');
  const v = {
    resolution_category: 'Permanent Fix', monitoring_period: '14 days', resolution_summary: 'Relay patched; queue limits raised.',
    permanent_fix_details: 'Upgraded relay to 4.2.1', validation_method: 'Synthetic mail every 5 minutes', validation_result: 'No failures in 14 days',
    lessons_learned: 'Add queue depth alerting',
  };
  for (const [id, val] of Object.entries(v)) {
    const el = adminPage.locator(`#${id}`);
    if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption({ index: 1 }); else await el.fill(val);
  }
  await adminPage.fill('#date_implemented', isoDate(-1));
  await adminPage.fill('#resolved_on', isoDate(0));
  if ((await adminPage.locator('#resolved_by_user_id option').count()) > 1) await adminPage.selectOption('#resolved_by_user_id', { index: 1 });
  await adminPage.check('#recurrence_detected');
  await adminPage.check('#knowledge_article_created');
  await caption(adminPage, 'TC-PRB-046 · Step 1', 'Fill every Resolution field incl. Recurrence Detected and Knowledge Article Created. Save.');
  await prb.saveSubForm();
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const toast = await prb.toastShown('Resolution saved successfully');
  const card = ((await prb.card(/Resolution/).textContent()) || '').replace(/\s+/g, ' ');
  const shownSummary = card.includes(v.resolution_summary);
  const recur = /Recurrence[^A-Za-z]*Yes/i.test(card) || /Yes/.test(card);
  await prb.openSubForm('/resolution');
  const missing: string[] = [];
  for (const [id, val] of Object.entries(v)) {
    const el = adminPage.locator(`#${id}`);
    if ((await el.evaluate((e) => e.tagName)) !== 'SELECT' && (await el.inputValue()) !== val) missing.push(id);
  }
  for (const id of ['recurrence_detected', 'knowledge_article_created']) if (!(await adminPage.isChecked(`#${id}`))) missing.push(id);
  const ok = toast && shownSummary && !missing.length;
  await verdict(adminPage, 'TC-PRB-046', ok, `Toast ${toast ? 'shown' : 'missing'}; summary on Track page ${shownSummary}; recurrence shown ${recur}; ${missing.length ? `NOT kept: ${missing.join(', ')}` : 'all fields kept in the form'}.`, 'FAIL');
  expect(toast).toBe(true);
  expect(missing).toEqual([]);
});

test('TC-PRB-047: duplicate incident link and root cause removed', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await highlight(adminPage, 'form[action$="/create-change"] button');
  await caption(adminPage, 'TC-PRB-047 · Step 1', 'Create a change request from the problem (to get a linked change).');
  await prb.postTrackForm('/create-change');
  await adminPage.waitForLoadState('domcontentloaded');
  const data = adminPage.url();
  if (!/\/problem\/track\//.test(data)) await adminPage.goBack();
  await adminPage.reload({ waitUntil: 'domcontentloaded' });
  const sel = prb.card('Related Changes').locator('select[name="root_cause_removed"]').first();
  const hasChange = await sel.isVisible().catch(() => false);
  expect(hasChange, 'a linked change request exists').toBe(true);
  await sel.selectOption('Yes');
  await adminPage.waitForLoadState('domcontentloaded');
  await adminPage.waitForTimeout(1500);
  await adminPage.reload({ waitUntil: 'domcontentloaded' });
  const val = await prb.card('Related Changes').locator('select[name="root_cause_removed"]').first().inputValue();
  const acts = (await prb.activityEntries()).join(' | ');
  await highlight(adminPage, 'select[name="root_cause_removed"]', val === 'Yes' ? '#12b76a' : '#f04438');
  await caption(adminPage, 'TC-PRB-047 · Step 1 · Result', `Root Cause Removed after reload: "${val}". Activity: ${/Root Cause/i.test(acts) ? 'logged' : 'not logged'}.`, val === 'Yes' ? 'pass' : 'fail');
  await verdict(adminPage, 'TC-PRB-047', val === 'Yes', `Root Cause Removed saved as "${val}". Duplicate-incident-link step not executable: incident linking is broken (KASSIST-1270).`, 'FAIL');
  expect(val).toBe('Yes');
});

test('TC-PRB-048: activity log records actions', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.create(getNewProblem());
  await prb.setStatusViaEdit('Under Investigation');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.addAction('QA activity action', 'Completed');
  await prb.closeProblem();
  adminPage.on('dialog', (d) => d.accept());
  await adminPage.locator('form[action$="/reopen"] input[name="reopen_reason"]').fill('QA activity reopen');
  await prb.postTrackForm('/reopen');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  const acts = (await prb.activityEntries()).join(' | ');
  const expected: Record<string, RegExp> = {
    Created: /Created/i, 'Status change': /Status Change|Status changed/i, 'Action added': /Action Added/i,
    'Investigation / RCA': /Investigation Updated|Rca Submitted/i, 'Resolution': /Resolution Updated/i,
    'Closure approved': /Closure Approved/i, Closed: /Closed/i, Reopened: /Reopened/i,
  };
  const missing = Object.entries(expected).filter(([, re]) => !re.test(acts)).map(([k]) => k);
  await adminPage.locator('section.sr-card:has(h2:has-text("Activity"))').scrollIntoViewIfNeeded();
  await highlight(adminPage, 'section.sr-card:has(h2:has-text("Activity"))', missing.length ? '#f04438' : '#12b76a');
  console.log(`TC-PRB-048 activity: ${acts.slice(0, 1500)}`);
  await verdict(adminPage, 'TC-PRB-048', !missing.length, missing.length ? `Activity has no entry for: ${missing.join(', ')}.` : `All 8 actions are in the Activity log (${(await prb.activityEntries()).length} entries).`, 'FAIL');
  expect(missing).toEqual([]);
});

test('TC-PRB-049: problem export api xlsx and csv', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  await prb.gotoListViaUI();
  const listTotal = await recordTotal(adminPage);
  const out: string[] = [];
  const counts: Record<string, number> = {};
  for (const fmt of ['xlsx', 'csv']) {
    // No UI button for this endpoint — called directly (documented exception).
    const r = await adminPage.request.get(`/api/problem/export?file_format=${fmt}`);
    const file = path.join(EVIDENCE_DIR, `TC-PRB-049-export.${fmt}`);
    fs.writeFileSync(file, await r.body());
    let rows = -1;
    if (r.ok() && fmt === 'csv') rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length - 1;
    if (r.ok() && fmt === 'xlsx') {
      const py = path.resolve(EVIDENCE_DIR, '../../../venv/bin/python');
      rows = Number(execFileSync(py, ['-c', 'import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;print(sum(1 for r in ws.iter_rows(values_only=True) if any(c not in (None,"") for c in r))-1)', file]).toString().trim());
    }
    counts[fmt] = rows;
    out.push(`${fmt}: HTTP ${r.status()}, ${r.headers()['content-type'] || '?'}, ${rows} rows`);
  }
  const ok = counts.xlsx === listTotal && counts.csv === listTotal;
  await highlight(adminPage, '.record-count', ok ? '#12b76a' : '#f04438');
  await verdict(adminPage, 'TC-PRB-049', ok, `List shows ${listTotal} records. ${out.join('; ')}.`, 'MISMATCH');
  expect(counts.xlsx).toBe(listTotal);
  expect(counts.csv).toBe(listTotal);
});

test('TC-PRB-050: notifications on resolved closed cancelled', async ({ adminPage }) => {
  const prb = new ProblemPage(adminPage);
  const a = await prb.create(getNewProblem());
  await prb.setStatusViaEdit('Resolved');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await prb.closeProblem();
  const b = await prb.create(getNewProblem());
  await prb.setStatusViaEdit('Cancelled');
  await adminPage.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  await caption(adminPage, 'TC-PRB-050 · Step 1', `${a}: Resolved, then Closed. ${b}: Cancelled. Open the notification bell.`);
  await prb.gotoHome(); // the bell lives on the Dashboard header
  await adminPage.locator('[data-notify-btn]').first().click({ timeout: 20000 });
  const panel = adminPage.locator('.notify-panel');
  await panel.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(2000);
  const text = ((await panel.textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
  const want = [`${a} resolved`, `${a} closed`, `${b} cancelled`];
  const missing = want.filter((w) => !text.toLowerCase().includes(w.toLowerCase()));
  await highlight(adminPage, '.notify-panel', missing.length ? '#f04438' : '#12b76a');
  console.log(`TC-PRB-050 panel: ${text.slice(0, 600)}`);
  await verdict(adminPage, 'TC-PRB-050', !missing.length, missing.length ? `Bell has no notification for: ${missing.join(', ')}.` : `Bell shows: "Problem ${a} resolved", "Problem ${a} closed", "Problem ${b} cancelled".`, 'FAIL');
  expect(missing).toEqual([]);
});
