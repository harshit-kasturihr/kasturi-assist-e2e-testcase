import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { DomainPage } from '../../../pages/DomainPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-924 sub-tasks TC-DOM-016..TC-DOM-020 (sample/upload).
// Upload contract: required "Domain Name"; optional Email. Blank rows
// skipped, duplicate names rejected.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/domains/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/domains/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-dom-sample-${Date.now()}-${attempt}.xlsx`);
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

/** Append two valid domain rows (+ one blank) to a copy of the sample. */
function buildUploadFile(samplePath: string, tag: string): { file: string; a: string; b: string } {
  const out = path.join(os.tmpdir(), `qa-doms-${tag}-${Date.now()}.xlsx`);
  const lines = [
    'import sys,openpyxl',
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active',
    'hdr=[str(c.value or "") for c in ws[1]]',
    'idx={h:i for i,h in enumerate(hdr)}',
    'base=[""]*len(hdr)',
    'r1=list(base)',
    'r1[idx["Domain Name"]]="QA Dom "+sys.argv[3]+" A"',
    `r1[idx["Email"]]="qa.doma.${tag}@example.com"`,
    'r2=list(base)',
    'r2[idx["Domain Name"]]="QA Dom "+sys.argv[3]+" B"',
    `r2[idx["Email"]]="qa.domb.${tag}@example.com"`,
    'ws.append(r1);ws.append(base);ws.append(r2)',
    'wb.save(sys.argv[2])',
  ];
  execFileSync(VENV_PYTHON, ['-c', lines.join('\n'), samplePath, out, tag], {
    timeout: 60000,
  });
  return { file: out, a: `QA Dom ${tag} A`, b: `QA Dom ${tag} B` };
}

test('TC-DOM-016: sample template downloads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  const headers = sampleHeaders(file);
  expect(headers).toContain('Domain Name');
  expect(headers).toContain('Email');
  await saveEvidence(adminPage, 'TC-DOM-016');
});

test('TC-DOM-017: valid xlsx upload inserts', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, a, b } = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.fill('#data-search', a);
  await expect(dom.row(a).first()).toBeVisible({ timeout: 20000 });
  await adminPage.fill('#data-search', b);
  await expect(dom.row(b).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-DOM-017');
});

test('TC-DOM-018: re-upload same file rejects duplicates', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, b } = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const dom = new DomainPage(adminPage);
  await dom.gotoViaUI();
  await adminPage.fill('#data-search', b);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const before = await dom.row(b).count();
  expect(before).toBeGreaterThan(0);
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate|Skipped:\s*[1-9]|Inserted:\s*0/i).first()).toBeVisible({
    timeout: 30000,
  });
  await dom.gotoViaUI();
  await adminPage.fill('#data-search', b);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  await expect(dom.row(b)).toHaveCount(before);
  await saveEvidence(adminPage, 'TC-DOM-018');
});

test('TC-DOM-019: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-dom-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Domain Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-DOM-019');
});

test('TC-DOM-020: empty upload errors', async ({ adminPage }) => {
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
  await saveEvidence(adminPage, 'TC-DOM-020-step1');
  const empty = path.join(os.tmpdir(), `qa-dom-empty-${Date.now()}.xlsx`);
  fs.writeFileSync(empty, Buffer.alloc(0));
  await adminPage.setInputFiles('#excel_file', empty);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/empty/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-DOM-020');
});
