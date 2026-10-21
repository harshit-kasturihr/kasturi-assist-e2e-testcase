import { test, expect } from '../../../fixtures/test-fixtures';
import { CostCentrePage } from '../../../pages/CostCentrePage';
import { getNewCostCentre } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-790 sub-tasks TC-CST-001..TC-CST-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-CST-001: cost centre list loads', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  await centres.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/cost-centres/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-CST-001');
});

test('TC-CST-002: valid cost centre add works', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  await centres.addCostCentre(getNewCostCentre());
  await saveEvidence(adminPage, 'TC-CST-002');
});

test('TC-CST-003: empty name blocked', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  await centres.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/cost-centres/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Cost Centre' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-CST-003');
});

test('TC-CST-004: duplicate cost centre handled', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  const data = getNewCostCentre();
  await centres.addCostCentre(data);
  await centres.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/cost-centres/add"]').click();
  await centres.fillCostCentreForm(data);
  await centres.submitExpectReject();
  await saveEvidence(adminPage, 'TC-CST-004');
});

test('TC-CST-005: edit cost centre saves', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  const data = getNewCostCentre();
  await centres.addCostCentre(data);
  await centres.openEdit(data.name);
  const updated = `QA CostCentre Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Cost Centre' }).click();
  await adminPage.waitForURL('**/cost-centres', { timeout: 15000 });
  await centres.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-CST-005');
});

test('TC-CST-006: delete test cost centre removes', async ({ adminPage }) => {
  // Lightweight by design (proven pattern from TC-STL-006): reuse a leftover
  // QA row instead of add+delete in one test — halves heavy navigations that
  // repeatedly kill the renderer on loaded machines.
  const centres = new CostCentrePage(adminPage);
  await centres.gotoViaUI();
  await adminPage.fill('#data-search', 'QA CostCentre');
  const firstRow = centres.row('QA CostCentre').first();
  await expect(firstRow).toBeVisible({ timeout: 20000 });
  // Pin the exact name: other QA rows must not satisfy this TC's assertion.
  const victim = ((await firstRow.locator('td').first().textContent()) || '').trim();
  expect(victim).toContain('QA CostCentre');
  const target = centres.row(victim);
  const delBtn = target.locator('button.delete-btn');
  await delBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  await delBtn.click();
  await expect(adminPage.getByText(/Are you sure you want to delete/i)).toBeVisible();
  await adminPage.locator('.confirm-yes').click({ noWaitAfter: true });
  await expect(centres.row(victim)).toHaveCount(0, { timeout: 25000 });
  await saveEvidence(adminPage, 'TC-CST-006');
});

test('TC-CST-007: search filters cost centre rows', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  const data = getNewCostCentre();
  await centres.addCostCentre(data);
  await centres.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-centre-xyz');
  await expect(centres.row(data.name)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-CST-007');
});

test('TC-CST-008: sorting reorders cost centre rows', async ({ adminPage }) => {
  const centres = new CostCentrePage(adminPage);
  await centres.gotoViaUI();
  const read = async (v: 'asc' | 'desc'): Promise<string[]> => {
    await adminPage.selectOption('#sort-filter', v);
    await adminPage.waitForTimeout(800);
    return adminPage.locator('tr.data-row td:first-child').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  };
  const asc = await read('asc');
  const desc = await read('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect(desc).toEqual([...asc].reverse());
  await saveEvidence(adminPage, 'TC-CST-008');
});

test('TC-CST-013: search highlight keeps & and markup intact (KASSIST-982)', async ({ adminPage }) => {
  test.slow();
  const cc = new CostCentrePage(adminPage);
  const stamp = Date.now().toString().slice(-6);
  const data = { ...getNewCostCentre(), name: `QA CC Camp ${stamp}`, description: 'R&D testing & QA' };
  await cc.addCostCentre(data);

  const search = async (term: string) => {
    await cc.gotoViaUI();
    await adminPage.fill('#data-search', term);
    await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await adminPage.waitForTimeout(1500);
  };
  const rowText = async () => ((await cc.row(data.name).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

  // Step 1: search "amp" - matches the name ("Camp"), and the highlighter
  // also runs over the "&" in the description.
  await search('amp');
  const ampRow = await rowText();
  const ampBroken = /&amp;|&lt;|&gt;|<span|<\/span>/i.test(ampRow) || !ampRow.includes('R&D testing & QA');
  await highlight(adminPage, `tr.data-row:has-text("${data.name}")`, ampBroken ? '#f04438' : '#12b76a');
  await caption(
    adminPage,
    `KASSIST-982 · Step 1 · Search "amp" ${ampBroken ? '(BUG)' : '(FIXED)'}`,
    `Cost centre "${data.name}" with description "R&D testing & QA". Row shows: ${ampRow.slice(0, 160)}`,
    ampBroken ? 'fail' : 'pass',
  );
  await saveEvidence(adminPage, 'TC-CST-013');

  // Step 2: regex metacharacter in the search must not break highlighting.
  await search(`Camp ${stamp} (`);
  const metaRowVisible = await cc.row(data.name).count();
  const pageErr = (await adminPage.locator('body').innerText()).includes('Invalid regular expression');
  await caption(
    adminPage,
    `KASSIST-982 · Step 2 · Search with "(" ${!pageErr ? '(no error)' : '(BUG)'}`,
    `Searched "Camp ${stamp} (" - page works, rows shown: ${metaRowVisible}.`,
    !pageErr ? 'pass' : 'fail',
  );

  expect(ampRow, 'description must render as plain "R&D testing & QA"').toContain('R&D testing & QA');
  expect(ampBroken, 'no raw entity/markup fragments in the row').toBe(false);
  expect(pageErr).toBe(false);
});
