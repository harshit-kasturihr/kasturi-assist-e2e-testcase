import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { EmployeePage } from '../../../pages/EmployeePage';
import { getNewEmployee } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-866 sub-tasks TC-EMP-016..TC-EMP-021 (sample/upload).
// Upload contract: 7 required cols (Employee Name, Official Employee ID,
// Contact No, Email, Department, User Type, Date of Joining); optional:
// Project Name, Designation, Skill, Reporting Manager Employee ID,
// Active Status. Upsert mode allowed; blank rows skipped.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');
// Canonical upload base for TC-EMP-017..019 (user-provided fixture).
const UPLOAD_TEMPLATE = path.join(E2E_ROOT, 'test-data', 'employee_upload_template.xlsx');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/employee/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/employee/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-emp-sample-${Date.now()}-${attempt}.xlsx`);
    fs.writeFileSync(tmp, buf);
    if (isParseableXlsx(tmp)) return tmp;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Sample template is not a parseable xlsx after 3 attempts');
}

/** True only when openpyxl can actually open the file (not just PK magic). */
function isParseableXlsx(p: string): boolean {
  try {
    execFileSync(
      VENV_PYTHON,
      ['-c', 'import sys,openpyxl;openpyxl.load_workbook(sys.argv[1]);print("ok")', p],
      { timeout: 30000, stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

function sampleHeaders(samplePath: string): string[] {
  const out = execFileSync(
    VENV_PYTHON,
    [
      '-c',
      'import sys,openpyxl;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;print("|".join([str(c.value or "") for c in ws[1]]))',
      samplePath,
    ],
    { timeout: 30000, encoding: 'utf8' },
  ) as unknown as string;
  return (out || '').trim().split('|');
}

/** Append two valid employee rows (+ one blank) to a copy of the sample. */
function buildUploadFile(
  samplePath: string,
  tag: string,
  desig = '',
  skill = '',
): { file: string; a: string; b: string } {
  const out = path.join(os.tmpdir(), `qa-emps-${tag}-${Date.now()}.xlsx`);
  const lines = [
    'import sys,openpyxl',
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active',
    'hdr=[str(c.value or "") for c in ws[1]]',
    'idx={h:i for i,h in enumerate(hdr)}',
    'base=[""]*len(hdr)',
    'r1=list(base)',
    'r1[idx["Employee Name"]]="QA Emp "+sys.argv[3]+" A"',
    `r1[idx["Official Employee ID"]]="QAEMP${tag}A"`,
    'r1[idx["Contact No"]]="9000000001"',
    `r1[idx["Email"]]="qa.empa.${tag}@example.com"`,
    'r1[idx["Department"]]="QA";r1[idx["User Type"]]="Engineer";r1[idx["Date of Joining"]]="2026-09-30"',
    'r2=list(base)',
    'r2[idx["Employee Name"]]="QA Emp "+sys.argv[3]+" B"',
    `r2[idx["Official Employee ID"]]="QAEMP${tag}B"`,
    'r2[idx["Contact No"]]="9000000002"',
    `r2[idx["Email"]]="qa.empb.${tag}@example.com"`,
    'r2[idx["Department"]]="QA";r2[idx["User Type"]]="Engineer";r2[idx["Date of Joining"]]="2026-09-30"',
    `r1[idx["Designation"]]="${desig}";r1[idx["Skill"]]="${skill}"`,
    `r2[idx["Designation"]]="${desig}";r2[idx["Skill"]]="${skill}"`,
    'ws.append(r1);ws.append(base);ws.append(r2)',
    'wb.save(sys.argv[2])',
  ];
  execFileSync(VENV_PYTHON, ['-c', lines.join('\n'), samplePath, out, tag], {
    timeout: 60000,
  });
  return { file: out, a: `QAEMP${tag}A`, b: `QAEMP${tag}B` };
}

test('TC-EMP-016: sample template downloads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  const headers = sampleHeaders(file);
  for (const h of ['Employee Name', 'Official Employee ID', 'Contact No', 'Email', 'Department', 'User Type', 'Date of Joining']) {
    expect(headers).toContain(h);
  }
  await saveEvidence(adminPage, 'TC-EMP-016');
});

test('TC-EMP-017: valid xlsx upload inserts', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp0 = new EmployeePage(adminPage);
  const pq = await emp0.ensurePrerequisites();
  await gotoUpload(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, a, b } = buildUploadFile(UPLOAD_TEMPLATE, tag, pq.designation, pq.skill);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  await adminPage.fill('#data-search', a);
  await expect(emp.row(a).first()).toBeVisible({ timeout: 20000 });
  await adminPage.fill('#data-search', b);
  await expect(emp.row(b).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-EMP-017');
});

test('TC-EMP-018: upsert updates existing row', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const emp = new EmployeePage(adminPage);
  const data = getNewEmployee();
  await emp.addEmployee(data);
  const pq = await emp.ensurePrerequisites();
  await gotoUpload(adminPage);
  const sample = UPLOAD_TEMPLATE;
  // Same official ID, changed department, upsert mode.
  const out = path.join(os.tmpdir(), `qa-emp-upsert-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'hdr=[str(c.value or "") for c in ws[1]];' +
    'idx={h:i for i,h in enumerate(hdr)};' +
    'r=[""]*len(hdr);' +
    `r[idx["Employee Name"]]=sys.argv[3];r[idx["Official Employee ID"]]=sys.argv[4];` +
    'r[idx["Contact No"]]="9000000002";r[idx["Email"]]=sys.argv[5];' +
    'r[idx["Department"]]="QA UPSERTED";r[idx["User Type"]]="Engineer";r[idx["Date of Joining"]]="2026-09-30";' +
    `r[idx["Designation"]]=sys.argv[6];r[idx["Skill"]]=sys.argv[7];` +
    'ws.append(r);wb.save(sys.argv[2])';
  execFileSync(
    VENV_PYTHON,
    ['-c', py, sample, out, data.name, data.officialId, data.email, pq.designation, pq.skill],
    {
      timeout: 60000,
    },
  );
  await adminPage.selectOption('#mode', 'upsert');
  await adminPage.setInputFiles('#excel_file', out);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Updated:\s*[1-9]|Inserted:\s*[0-9]/).first()).toBeVisible({
    timeout: 30000,
  });
  await emp.gotoViaUI();
  await adminPage.fill('#data-search', data.officialId);
  await expect(emp.row(data.officialId)).toHaveCount(1);
  await expect(emp.row(data.officialId).first()).toContainText('QA UPSERTED');
  await saveEvidence(adminPage, 'TC-EMP-018');
});

test('TC-EMP-019: re-upload same file handled without doubling', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const emp0 = new EmployeePage(adminPage);
  const pq = await emp0.ensurePrerequisites();
  await gotoUpload(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, b } = buildUploadFile(UPLOAD_TEMPLATE, tag, pq.designation, pq.skill);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const emp = new EmployeePage(adminPage);
  await emp.gotoViaUI();
  await adminPage.fill('#data-search', b);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const before = await emp.row(b).count();
  expect(before).toBeGreaterThan(0);
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate|Skipped:\s*[1-9]|Inserted:\s*0/i).first()).toBeVisible({
    timeout: 30000,
  });
  await emp.gotoViaUI();
  await adminPage.fill('#data-search', b);
  await expect(emp.row(b)).toHaveCount(before);
  await saveEvidence(adminPage, 'TC-EMP-019');
});

test('TC-EMP-020: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-emp-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Employee Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-EMP-020');
});

test('TC-EMP-021: empty upload errors', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  // No file chosen: native required validation on the file input.
  await adminPage.locator('[data-upload-submit]').click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.getElementById('excel_file') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-EMP-021-step1');
  const empty = path.join(os.tmpdir(), `qa-emp-empty-${Date.now()}.xlsx`);
  fs.writeFileSync(empty, Buffer.alloc(0));
  await adminPage.setInputFiles('#excel_file', empty);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/empty/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-EMP-021');
});
