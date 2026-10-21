import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { ServiceRequestPage } from '../../../pages/ServiceRequestPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1183 sub-tasks TC-SRQ-017..TC-SRQ-019 (sample/upload).
// Upload required cols: Company, Domain, Problem Description, Priority,
// Effort Level, AMC Scope, Contact Person, Contact Number, Contact Email.
// Optional: Engineer, Asset Serial No.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const srq = new ServiceRequestPage(adminPage);
  await srq.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/service-request/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/service-request/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-srq-sample-${Date.now()}-${attempt}.xlsx`);
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

/** Append a valid request row (+ blank) to a copy of the sample. */
function buildUploadFile(
  samplePath: string, tag: string, company: string, domain: string,
): { file: string; problem: string } {
  const out = path.join(os.tmpdir(), `qa-srqs-${tag}-${Date.now()}.xlsx`);
  const problem = `QA SR up ${tag}`;
  const lines = [
    'import sys,openpyxl',
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active',
    'hdr=[str(c.value or "") for c in ws[1]]',
    'idx={h:i for i,h in enumerate(hdr)}',
    '# Drop the template example rows - only the QA row should be imported.',
    'ws.delete_rows(2, max(ws.max_row - 1, 0))',
    'base=[""]*len(hdr)',
    'r=list(base)',
    'r[idx["Company"]]=sys.argv[4]',
    'r[idx["Domain"]]=sys.argv[5]',
    `r[idx["Problem Description"]]=sys.argv[6]`,
    'r[idx["Priority"]]="P3";r[idx["Effort Level"]]="Skill"',
    'r[idx["AMC Scope"]]="Non-AMC"',
    `r[idx["Contact Person"]]="QA";r[idx["Contact Number"]]="9000000001"`,
    `r[idx["Contact Email"]]="qa.sr.${tag}@example.com"`,
    'ws.append(r)',
    'wb.save(sys.argv[2])',
  ];
  execFileSync(VENV_PYTHON, ['-c', lines.join('\n'), samplePath, out, tag, company, domain, problem], {
    timeout: 60000,
  });
  return { file: out, problem };
}

test('TC-SRQ-017: sample template downloads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  const headers = sampleHeaders(file);
  for (const h of ['Company', 'Domain', 'Problem Description', 'Priority']) {
    expect(headers).toContain(h);
  }
  await saveEvidence(adminPage, 'TC-SRQ-017');
});

test('TC-SRQ-018: valid xlsx upload inserts', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(900000);
  const srq = new ServiceRequestPage(adminPage);
  const pre = await srq.ensurePrerequisites();
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, problem } = buildUploadFile(sample, tag, pre.company, pre.domain);
  // Upload validates against the same 300s company lookup cache as the
  // form (KASSIST-1208) - re-upload until the fresh company is accepted.
  const deadline = Date.now() + 330000;
  for (;;) {
    await adminPage.setInputFiles('#excel_file', file);
    await Promise.all([
      adminPage.waitForEvent('load', { timeout: 60000 }),
      adminPage.locator('[data-upload-submit]').click(),
    ]);
    await expect(adminPage.getByText(/Import Summary/)).toBeVisible({ timeout: 30000 });
    if (await adminPage.getByText(/Inserted:\s*[1-9]/).isVisible()) break;
    const stale = await adminPage.getByText('Please select a valid company.').isVisible();
    if (!stale || Date.now() > deadline) {
      await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 5000 });
    }
    await adminPage.waitForTimeout(20000);
  }
  await srq.gotoViaUI();
  await adminPage.fill('#data-search', problem);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  await expect(adminPage.locator('tr.data-row')).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-SRQ-018');
});

test('TC-SRQ-019: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-srq-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Company\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-SRQ-019');
});
