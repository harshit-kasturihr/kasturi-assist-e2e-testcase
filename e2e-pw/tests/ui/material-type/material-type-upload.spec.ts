import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { MaterialTypePage } from '../../../pages/MaterialTypePage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-828 sub-tasks TC-MTP-013..TC-MTP-017 (sample/upload).
// Upload contract: required "Material Type Name"; blank rows skipped,
// duplicates rejected; insert_only mode.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const mtp = new MaterialTypePage(adminPage);
  await mtp.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/material-types/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/material-types/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-mtp-sample-${Date.now()}-${attempt}.xlsx`);
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

function buildUploadFile(samplePath: string, tag: string): string {
  const out = path.join(os.tmpdir(), `qa-mtps-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'ws.append(["QA MTP "+sys.argv[3]+" A"]);' +
    'ws.append([]);' +
    'ws.append(["QA MTP "+sys.argv[3]+" B"]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, samplePath, out, tag], {
    timeout: 60000,
  });
  return out;
}

function sampleHeader(samplePath: string): string {
  const out = execFileSync(
    VENV_PYTHON,
    [
      '-c',
      'import sys,openpyxl;wb=openpyxl.load_workbook(sys.argv[1]);print(wb.active.cell(1,1).value)',
      samplePath,
    ],
    { timeout: 30000, encoding: 'utf8' },
  ) as unknown as string;
  return (out || '').trim();
}

test('TC-MTP-013: sample template downloads', async ({ adminPage }) => {
  test.slow();
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  expect(sampleHeader(file)).toMatch(/Material Type Name/i);
  await saveEvidence(adminPage, 'TC-MTP-013');
});

test('TC-MTP-014: valid xlsx upload inserts', async ({
  adminPage,
}) => {
  test.slow();
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const mtp = new MaterialTypePage(adminPage);
  await mtp.gotoViaUI();
  await adminPage.fill('#data-search', `QA MTP ${tag} A`);
  await expect(mtp.row(`QA MTP ${tag} A`).first()).toBeVisible({ timeout: 20000 });
  await adminPage.fill('#data-search', `QA MTP ${tag} B`);
  await expect(mtp.row(`QA MTP ${tag} B`).first()).toBeVisible({ timeout: 20000 });
  await saveEvidence(adminPage, 'TC-MTP-014');
});

test('TC-MTP-015: re-upload same file rejects duplicates', async ({
  adminPage,
}) => {
  test.slow();
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const mtp = new MaterialTypePage(adminPage);
  await mtp.gotoViaUI();
  await adminPage.fill('#data-search', `QA MTP ${tag} B`);
  const before = await mtp.row(`QA MTP ${tag} B`).count();
  expect(before).toBeGreaterThan(0);
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate/i).first()).toBeVisible({
    timeout: 30000,
  });
  await mtp.gotoViaUI();
  await adminPage.fill('#data-search', `QA MTP ${tag} B`);
  await expect(mtp.row(`QA MTP ${tag} B`)).toHaveCount(before);
  await saveEvidence(adminPage, 'TC-MTP-015');
});

test('TC-MTP-016: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-mtp-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Material Type Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-MTP-016');
});

test('TC-MTP-017: empty upload errors', async ({ adminPage }) => {
  test.slow();
  await gotoUpload(adminPage);
  // No file chosen at all: the required file input blocks submit natively
  // (the server-side "Please choose an Excel file" is defense-in-depth).
  await adminPage.locator('[data-upload-submit]').click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.querySelector(
      '#excel_file',
    ) as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-MTP-017-step1');
  // Zero-byte .xlsx.
  const empty = path.join(os.tmpdir(), `qa-mtp-empty-${Date.now()}.xlsx`);
  fs.writeFileSync(empty, Buffer.alloc(0));
  await adminPage.setInputFiles('#excel_file', empty);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/File is empty/)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-MTP-017');
});
