import { test, expect } from '../../../fixtures/test-fixtures';
import { ManufacturePage } from '../../../pages/ManufacturePage';
import { getNewManufacture } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-803 sub-tasks TC-MFG-001..TC-MFG-008.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-MFG-001: manufacture list loads', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  await mfg.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/manufactures/add"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-MFG-001');
});

test('TC-MFG-002: valid manufacture add works', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  const data = getNewManufacture();
  await mfg.addManufacture(data.name, data.description);
  await saveEvidence(adminPage, 'TC-MFG-002');
});

test('TC-MFG-003: empty name blocked', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  await mfg.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/manufactures/add"]').click();
  await adminPage.getByRole('button', { name: 'Add Manufacture' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-MFG-003');
});

test('TC-MFG-004: duplicate manufacture handled', async ({ adminPage }) => {
  // KASSIST-827 regression: duplicate names (exact and different case) must
  // be rejected inline, leaving exactly one row.
  test.slow();
  const mfg = new ManufacturePage(adminPage);
  const data = getNewManufacture();
  await mfg.addManufacture(data.name, data.description);
  await highlight(adminPage, `tr.data-row:has-text("${data.name}")`, '#12b76a');
  await caption(adminPage, 'KASSIST-827 · Step 1', `Manufacture "${data.name}" created (1 row).`);

  const tryAdd = async (name: string): Promise<string> => {
    await mfg.gotoViaUI();
    await adminPage.locator('a.btn-add[href$="/manufactures/add"]').click();
    await adminPage.fill('input[name="name"]', name);
    await adminPage.fill('input[name="description"]', data.description);
    await adminPage.getByRole('button', { name: 'Add Manufacture' }).click();
    const err = adminPage.locator('.alert-error, .form-error-text').first();
    const shown = await err.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    return shown ? (await err.innerText()).trim() : '';
  };

  const exactErr = await tryAdd(data.name);
  await highlight(adminPage, '.alert-error, .form-error-text', exactErr ? '#12b76a' : '#f04438');
  await caption(
    adminPage,
    `KASSIST-827 · Step 2 · Same name ${exactErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    exactErr ? `Add "${data.name}" again → error: "${exactErr}"` : `Add "${data.name}" again → no error, saved.`,
    exactErr ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-MFG-004');

  const upper = data.name.toUpperCase();
  const caseErr = await tryAdd(upper);
  await caption(
    adminPage,
    `KASSIST-827 · Step 3 · Different case ${caseErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    caseErr ? `Add "${upper}" → error: "${caseErr}"` : `Add "${upper}" → no error, saved.`,
    caseErr ? 'pass' : 'fail',
  );

  await mfg.gotoViaUI();
  await adminPage.fill('#data-search', data.name);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const rows = await mfg.row(data.name).count();
  await caption(adminPage, `KASSIST-827 · Step 4 · ${rows === 1 ? 'Result (FIXED)' : 'Actual result (BUG)'}`, `List search for "${data.name}": ${rows} row(s). Expected exactly 1.`, rows === 1 ? 'pass' : 'fail');
  expect(exactErr, 'exact duplicate rejected').not.toBe('');
  expect(caseErr, 'case-variant duplicate rejected').not.toBe('');
  expect(rows).toBe(1);
});

test('TC-MFG-005: edit manufacture saves', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  const data = getNewManufacture();
  await mfg.addManufacture(data.name, data.description);
  await mfg.openEdit(data.name);
  const updated = `QA Mfg Edited ${Date.now().toString().slice(-5)}`;
  await adminPage.fill('input[name="name"]', updated);
  await adminPage.getByRole('button', { name: 'Update Manufacture' }).click();
  await adminPage.waitForURL('**/manufactures', { timeout: 15000 });
  await mfg.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-MFG-005');
});

test('TC-MFG-006: delete test manufacture removes', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  // Lightweight: reuse a leftover QA row instead of add+delete in one test.
  await mfg.gotoViaUI();
  await adminPage.fill('#data-search', 'QA Mfg');
  // Search triggers navigation (?search=); let the table settle first.
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1000);
  const target = mfg.row('QA Mfg').first();
  await expect(target).toBeVisible({ timeout: 20000 });
  // Name column is the 2nd td (1st is S.NO) — read it for the final assert.
  const name = ((await target.locator('td:nth-child(2)').textContent()) || '').trim();
  const delBtn = target.locator('button.delete-btn');
  await delBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  await delBtn.click();
  await expect(adminPage.getByText(/Are you sure you want to delete/i)).toBeVisible({ timeout: 15000 });
  await adminPage.locator('.confirm-yes').click({ noWaitAfter: true });
  await expect(mfg.row(name)).toHaveCount(0, { timeout: 25000 });
  await saveEvidence(adminPage, 'TC-MFG-006');
});

test('TC-MFG-007: search filters manufacture rows', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  const data = getNewManufacture();
  await mfg.addManufacture(data.name, data.description);
  await mfg.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-mfg-xyz');
  await expect(mfg.row(data.name)).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-MFG-007');
});

test('TC-MFG-008: sorting reorders manufacture rows', async ({ adminPage }) => {
  const mfg = new ManufacturePage(adminPage);
  await mfg.gotoViaUI();
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
  // Same items, different order (exact collation is app-defined).
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-MFG-008');
});

test('TC-MFG-013: multi-word search keeps cells readable (KASSIST-985)', async ({ adminPage }) => {
  test.slow();
  const mfg = new ManufacturePage(adminPage);
  const name = `QA Mf ${Date.now().toString().slice(-6)} A`;
  await mfg.addManufacture(name, 'QA automation test manufacture');
  await mfg.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name, row: (n) => mfg.row(n), bugKey: 'KASSIST-985', tcId: 'TC-MFG-013', screen: 'Manufacture' });
});

test('TC-MFG-014: S.No renumbers 1..N after sorting (KASSIST-1002)', async ({ adminPage }) => {
  test.slow();
  const mfg = new ManufacturePage(adminPage);
  const readTable = () => adminPage.locator('tr.data-row').evaluateAll((rows) =>
    rows.filter((r) => (r as HTMLElement).offsetParent !== null).map((r) => {
      const cells = Array.from(r.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
      return { sno: cells[0], name: cells[1] };
    }));
  const check = async (order: 'asc' | 'desc', label: string) => {
    await mfg.gotoViaUI();
    await adminPage.selectOption('#sort-filter', order);
    await adminPage.waitForTimeout(1200);
    const rows = await readTable();
    const snos = rows.map((r) => Number(r.sno));
    const sequential = snos.every((n, i) => n === i + 1);
    await highlight(adminPage, 'tr.data-row td:first-child', sequential ? '#12b76a' : '#f04438');
    await caption(
      adminPage,
      `KASSIST-1002 · Sort ${label} ${sequential ? '(S.No 1..N - FIXED)' : '(S.No scrambled - BUG)'}`,
      `S.No top to bottom: ${snos.slice(0, 12).join(', ')}${snos.length > 12 ? ', ...' : ''} | first names: ${rows.slice(0, 3).map((r) => r.name).join(' / ')}`,
      sequential ? 'pass' : 'fail',
    );
    return { rows, sequential };
  };
  const asc = await check('asc', 'Ascending');
  await saveEvidence(adminPage, 'TC-MFG-014');
  const desc = await check('desc', 'Descending');
  expect(asc.rows.length).toBeGreaterThan(1);
  expect(asc.sequential, 'S.No 1..N after Ascending sort').toBe(true);
  expect(desc.sequential, 'S.No 1..N after Descending sort').toBe(true);
  // Rows really were reordered (sort applied), not just renumbered.
  expect(asc.rows.map((r) => r.name)).not.toEqual(desc.rows.map((r) => r.name));
});
