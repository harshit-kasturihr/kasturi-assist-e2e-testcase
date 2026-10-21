import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { StorePage } from '../../../pages/StorePage';
import { getNewStore } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-752 sub-tasks TC-STR-009..TC-STR-012 (sample/upload/print).
// Upload contract: required "Store Name" only; blank rows skipped, duplicate
// names rejected. TC-STR-010 fills a COPY of the downloaded sample (original
// pristine) via the repo venv's openpyxl — 2 unique rows per run.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const stores = new StorePage(adminPage);
  await stores.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/store/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/store/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-store-sample-${Date.now()}-${attempt}.xlsx`);
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
  const out = path.join(os.tmpdir(), `qa-stores-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'ws.append(["QA St "+sys.argv[3]+" A"]);' +
    'ws.append(["QA St "+sys.argv[3]+" B"]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, samplePath, out, tag], {
    timeout: 60000,
  });
  return out;
}

test('TC-STR-009: sample template downloads', async ({ adminPage }) => {
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-STR-009');
});

test('TC-STR-010: valid xlsx upload inserts, dupes rejected', async ({
  adminPage,
}) => {
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  await saveEvidence(adminPage, 'TC-STR-010-step1');
  const stores = new StorePage(adminPage);
  await stores.gotoViaUI();
  await adminPage.fill('#data-search', `QA St ${tag} A`);
  await expect(stores.row(`QA St ${tag} A`).first()).toBeVisible({ timeout: 20000 });
  // Re-upload same file: duplicates must be rejected, not doubled.
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate/i).first()).toBeVisible({
    timeout: 30000,
  });
  await saveEvidence(adminPage, 'TC-STR-010');
});

test('TC-STR-011: invalid file rejected', async ({ adminPage }) => {
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Store Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-STR-011');
});

test('TC-STR-012: print view renders', async ({ adminPage }) => {
  const stores = new StorePage(adminPage);
  const data = getNewStore();
  await stores.addStore(data.name, data.description);
  await stores.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-STR-012');
});
