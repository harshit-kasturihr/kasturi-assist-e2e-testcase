import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { StoreLocationPage } from '../../../pages/StoreLocationPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-778 sub-tasks TC-STL-009..TC-STL-011 (sample/upload).
// Upload contract: required "Store Location Name" only; blank rows skipped,
// duplicate names rejected.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const locs = new StoreLocationPage(adminPage);
  await locs.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/store-location/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/store-location/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-storeloc-sample-${Date.now()}-${attempt}.xlsx`);
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
  const out = path.join(os.tmpdir(), `qa-storelocs-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'ws.append(["QA StL "+sys.argv[3]+" A"]);' +
    'ws.append(["QA StL "+sys.argv[3]+" B"]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, samplePath, out, tag], {
    timeout: 60000,
  });
  return out;
}

test('TC-STL-009: sample template downloads', async ({ adminPage }) => {
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-STL-009');
});

test('TC-STL-010: valid xlsx upload inserts, dupes rejected', async ({
  adminPage,
}) => {
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  await saveEvidence(adminPage, 'TC-STL-010-step1');
  const locs = new StoreLocationPage(adminPage);
  await locs.gotoViaUI();
  await adminPage.fill('#data-search', `QA StL ${tag} A`);
  await expect(locs.row(`QA StL ${tag} A`).first()).toBeVisible({ timeout: 20000 });
  // Re-upload same file: duplicates must be rejected, not doubled.
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate/i).first()).toBeVisible({
    timeout: 30000,
  });
  await saveEvidence(adminPage, 'TC-STL-010');
});

test('TC-STL-011: invalid file rejected', async ({ adminPage }) => {
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Store Location Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-STL-011');
});
