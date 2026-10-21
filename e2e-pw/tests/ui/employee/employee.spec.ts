import { test, expect } from '../../../fixtures/test-fixtures';
import { EmployeePage } from '../../../pages/EmployeePage';
import { getNewEmployee } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { recordToasts } from '../../../utils/narrate';
import { expectSuccessToast } from '../../../utils/toastCheck';
import { expectCleanMultiWordSearch } from '../../../utils/searchCheck';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-866 sub-tasks TC-EMP-001..TC-EMP-015 + TC-EMP-022.
// (TC-EMP-023 sync deliberately not automated.)
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-EMP-001: employee list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  await expect(adminPage.locator('#data-search')).toBeVisible();
  await expect(
    adminPage.locator('a.btn-add[href$="/employee/add"]'),
  ).toBeVisible();
  for (const col of ['Employee ID', 'Employee Name', 'Contact No.', 'Email', 'Department']) {
    await expect(adminPage.locator('th', { hasText: col }).first()).toBeVisible();
  }
  await saveEvidence(adminPage, 'TC-EMP-001');
});

test('TC-EMP-002: valid employee add works', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await saveEvidence(adminPage, 'TC-EMP-002');
});

test('TC-EMP-003: mandatory missing blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  const prereq = await emp.ensurePrerequisites();
  await emp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/employee/add"]').click();
  await emp.fillEmployeeForm(data, true, prereq);
  // Bypass native `required` to reach server-side mandatory validation.
  await adminPage.evaluate(() => {
    const dept = document.getElementById('department') as HTMLInputElement | null;
    dept?.removeAttribute('required');
    if (dept) dept.value = '';
  });
  await adminPage.getByRole('button', { name: 'Add Employee' }).click();
  await expect(adminPage.locator('.alert-error').first()).toContainText(
    /mandatory/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-EMP-003');
});

test('TC-EMP-004: invalid email blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/employee/add"]').click();
  await adminPage.fill('#email', 'not-an-email');
  await adminPage.getByRole('button', { name: 'Add Employee' }).click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.getElementById('email') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-EMP-004');
});

test('TC-EMP-005: non-numeric user type blocked', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  const prereq = await emp.ensurePrerequisites();
  await emp.gotoViaUI();
  await adminPage.locator('a.btn-add[href$="/employee/add"]').click();
  await emp.fillEmployeeForm(data, true, prereq);
  // Force an invalid numeric value into the hidden user_type field.
  await adminPage.evaluate(() => {
    const hidden = document.getElementById('user_type') as HTMLInputElement | null;
    if (hidden) hidden.value = 'abc';
  });
  await adminPage.getByRole('button', { name: 'Add Employee' }).click();
  await expect(adminPage.locator('.alert-error').first()).toContainText(
    /numeric/i,
    { timeout: 15000 },
  );
  await saveEvidence(adminPage, 'TC-EMP-005');
});

test('TC-EMP-006: duplicate official ID rejected', async ({ adminPage }) => {
  // KASSIST-890 regression: duplicate Official Employee ID must be rejected
  // inline (same ID + email, and same ID with a different email).
  test.slow();
  test.setTimeout(400000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await highlight(adminPage, `tr.data-row:has-text("${data.officialId}")`, '#12b76a');
  await caption(adminPage, 'KASSIST-890 · Step 1', `Employee with Official ID "${data.officialId}" (${data.email}) created - 1 row.`);

  const prereq = await emp.ensurePrerequisites();
  const tryAdd = async (email: string): Promise<string> => {
    await emp.gotoViaUI();
    await adminPage.locator('a.btn-add[href$="/employee/add"]').click();
    await emp.fillEmployeeForm({ ...data, email }, true, prereq);
    await adminPage.getByRole('button', { name: 'Add Employee' }).click();
    const err = adminPage.locator('.alert-error').first();
    const shown = await Promise.race([
      err.waitFor({ state: 'visible', timeout: 15000 }).then(() => true),
      adminPage.waitForURL('**/employee', { timeout: 15000 }).then(() => false),
    ]).catch(() => false);
    return shown ? (await err.innerText()).trim() : '';
  };

  const sameErr = await tryAdd(data.email);
  await highlight(adminPage, '.alert-error', sameErr ? '#12b76a' : '#f04438');
  await caption(
    adminPage,
    `KASSIST-890 · Step 2 · Same Official ID + email ${sameErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    sameErr ? `Add Employee again with "${data.officialId}" / ${data.email} → error: "${sameErr}"` : 'Saved with no error.',
    sameErr ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-EMP-006');

  const otherEmail = `alt.${data.email}`;
  const idErr = await tryAdd(otherEmail);
  await caption(
    adminPage,
    `KASSIST-890 · Step 3 · Same Official ID, new email ${idErr ? '(REJECTED - FIXED)' : '(ACCEPTED - BUG)'}`,
    idErr ? `"${data.officialId}" with ${otherEmail} → error: "${idErr}"` : `"${data.officialId}" with ${otherEmail} saved with no error.`,
    idErr ? 'pass' : 'fail',
  );

  await emp.gotoViaUI();
  await adminPage.fill('#data-search', data.officialId);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const rows = await emp.row(data.officialId).count();
  await caption(adminPage, `KASSIST-890 · Step 4 · ${rows === 1 ? 'Result (FIXED)' : 'Actual result (BUG)'}`, `List search for "${data.officialId}": ${rows} row(s). Expected exactly 1.`, rows === 1 ? 'pass' : 'fail');
  expect(sameErr, 'duplicate Official ID + email rejected inline').not.toBe('');
  expect(idErr, 'duplicate Official ID with new email rejected inline').not.toBe('');
  // More than one row = silent duplicate = APPLICATION_BUG.
  expect(rows).toBe(1);
});

test('TC-EMP-007: edit employee saves', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await emp.openEdit(data.officialId);
  await adminPage.fill('#department', 'QA Edited Dept');
  await adminPage.getByRole('button', { name: 'Update Employee' }).click();
  await adminPage.waitForURL('**/employee', { timeout: 30000, waitUntil: 'commit' });
  await adminPage.fill('#data-search', data.officialId);
  await expect(emp.row(data.officialId).first()).toContainText('QA Edited Dept');
  await saveEvidence(adminPage, 'TC-EMP-007');
});

test('TC-EMP-008: edit mandatory validation', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await emp.openEdit(data.officialId);
  await adminPage.evaluate(() => {
    const dept = document.getElementById('department') as HTMLInputElement | null;
    dept?.removeAttribute('required');
    if (dept) dept.value = '';
  });
  await highlight(adminPage, '#department', '#1d3a8a');
  await caption(adminPage, 'KASSIST-891 · Step 1', `Edit employee "${data.officialId}": clear the mandatory Department field and click Update Employee.`);
  await adminPage.getByRole('button', { name: 'Update Employee' }).click();
  await adminPage.waitForLoadState('domcontentloaded');
  const body = (await adminPage.locator('body').innerText().catch(() => '')).trim();
  const rawJson = body.startsWith('{') && body.includes('"detail"');
  const err = rawJson ? '' : ((await adminPage.locator('.alert-error').first().innerText().catch(() => '')) || '').trim();
  const formKept = (await adminPage.locator('#emp_id_official').inputValue().catch(() => '')) === data.officialId;
  const ok = !rawJson && /mandatory/i.test(err) && formKept;
  if (ok) await highlight(adminPage, '.alert-error', '#12b76a');
  await caption(
    adminPage,
    `KASSIST-891 · Step 2 · ${ok ? 'Result (FIXED)' : 'Actual result (BUG)'}`,
    rawJson ? `Raw JSON page shown: ${body.slice(0, 140)}` : `Edit form re-rendered with inline error: "${err}". Entered values kept (Employee ID ${formKept ? 'still filled' : 'LOST'}).`,
    ok ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-EMP-008');
  expect(rawJson, 'raw JSON page shown').toBe(false);
  await expect(adminPage.locator('.alert-error').first()).toContainText(/mandatory/i, { timeout: 15000 });
  expect(formKept, 'form values preserved').toBe(true);
  await emp.expectRowVisible(data.officialId);
});

test('TC-EMP-009: delete test employee removes', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await emp.deleteEmployee(data.officialId);
  await saveEvidence(adminPage, 'TC-EMP-009');
});

test('TC-EMP-010: new row visible without search (cache)', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  // Plain list page 1, no search: the 60s page cache must have been
  // invalidated by the write.
  await emp.gotoViaUI();
  await expect(emp.row(data.officialId).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-EMP-010');
});

test('TC-EMP-011: inactive employee shows Offline', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data, false);
  await emp.gotoViaUI();
  await adminPage.fill('#data-search', data.officialId);
  await expect(emp.row(data.officialId).first()).toContainText(/Offline/i);
  await saveEvidence(adminPage, 'TC-EMP-011');
});

test('TC-EMP-012: multi-field search finds row', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await emp.gotoViaUI();
  for (const q of [data.name, data.email, data.department]) {
    await adminPage.fill('#data-search', q);
    await expect(emp.row(data.officialId).first()).toBeVisible({ timeout: 20000 });
  }
  await saveEvidence(adminPage, 'TC-EMP-012');
});

test('TC-EMP-013: no-match search shows zero rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-emp-xyz-123');
  await expect(emp.row('no-such-emp-xyz-123')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-EMP-013');
});

test('TC-EMP-014: server pagination is consistent', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  const countText = (await adminPage.locator('.record-count').first().textContent()) || '';
  const total = Number((countText.match(/of\s+(\d+)/) || [])[1] || '0');
  const indicator = (await adminPage.locator('.page-indicator').first().textContent()) || '';
  if (total > 20) {
    const firstPage1 = await adminPage.locator('tr.data-row td:first-child').first().textContent();
    await adminPage.locator('.pagination-btn', { hasText: 'Next' }).click();
    await expect(adminPage.locator('.page-indicator')).toContainText('Page 2', { timeout: 20000 });
    const firstPage2 = await adminPage.locator('tr.data-row td:first-child').first().textContent();
    expect(firstPage2).not.toBe(firstPage1);
  } else {
    expect(indicator).toMatch(/Page 1 of 1/);
  }
  await saveEvidence(adminPage, 'TC-EMP-014');
});

test('TC-EMP-015: sorting reorders employee rows', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  const read = async (v: 'asc' | 'desc'): Promise<string[]> => {
    await adminPage.selectOption('#sort-filter', v);
    await adminPage.waitForTimeout(800);
    return adminPage.locator('tr.data-row td:nth-child(2)').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  };
  const asc = await read('asc');
  const desc = await read('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect([...asc].sort()).toEqual([...desc].sort());
  expect(asc[0]).not.toBe(desc[0]);
  await saveEvidence(adminPage, 'TC-EMP-015');
});

test('TC-EMP-022: print view renders', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  await emp.expectPrintView(data.officialId, data.name);
  await saveEvidence(adminPage, 'TC-EMP-022');
});

test('TC-EMP-023: multi-word search keeps cells readable (KASSIST-992)', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = { ...getNewEmployee(), name: `QA Em ${Date.now().toString().slice(-6)} A` };
  await emp.addEmployee(data);
  await emp.gotoViaUI();
  await expectCleanMultiWordSearch(adminPage, { name: data.name, row: (n) => adminPage.locator('tr.data-row', { hasText: n }), bugKey: 'KASSIST-992', tcId: 'TC-EMP-023', screen: 'Employee' });
});

test('TC-EMP-024: success toast on create and edit (KASSIST-1000)', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await recordToasts(adminPage);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  const prereq = await emp.ensurePrerequisites();
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-1000', step: `Create employee "${data.officialId}"`, expect: /added|created/i, evidenceId: 'TC-EMP-024',
    save: async () => {
      await emp.gotoViaUI();
      await adminPage.locator('a.btn-add[href$="/employee/add"]').click();
      await emp.fillEmployeeForm(data, true, prereq);
      await adminPage.getByRole('button', { name: 'Add Employee' }).click();
    },
  });
  await expectSuccessToast(adminPage, {
    bugKey: 'KASSIST-1000', step: `Edit employee "${data.officialId}"`, expect: /updated|saved/i, evidenceId: 'TC-EMP-024-edit',
    save: async () => {
      await emp.openEdit(data.officialId);
      await adminPage.fill('#department', 'QA Toast Dept');
      await adminPage.getByRole('button', { name: 'Update Employee' }).click();
    },
  });
});
