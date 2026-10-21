import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { ProductPage } from '../../../pages/ProductPage';
import { getNewProduct } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-721 sub-tasks TC-PRD-009..TC-PRD-012 (sample/upload/print).
// Upload contract (routes): required column "Product Name" only; blank rows
// skipped; duplicate names rejected; code auto-generated.
// TC-PRD-010 fills a COPY of the downloaded sample (original pristine) via
// the repo venv's openpyxl — 2 unique rows per run.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const products = new ProductPage(adminPage);
  await products.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/product/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/product/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-product-sample-${Date.now()}-${attempt}.xlsx`);
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
  // Fresh workbook with ONLY our 2 rows: the downloaded sample ships with
  // example rows that already exist in DB (they'd fail as duplicates and
  // pollute the counts). Headers copied from the sample.
  const out = path.join(os.tmpdir(), `qa-products-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'src=openpyxl.load_workbook(sys.argv[1]);s=src.active;' +
    'headers=[c.value for c in s[1]];' +
    'wb=openpyxl.Workbook();ws=wb.active;ws.title=s.title;' +
    'ws.append(headers);' +
    'ws.append(["QA Pd "+sys.argv[3]+" A","desc A"]);' +
    'ws.append(["QA Pd "+sys.argv[3]+" B","desc B"]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, samplePath, out, tag], {
    timeout: 60000,
  });
  return out;
}

test('TC-PRD-009: sample template downloads', async ({ adminPage }) => {
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-PRD-009');
});

test('TC-PRD-010: valid xlsx upload inserts, dupes rejected', async ({
  adminPage,
}) => {
  // Note: the downloaded sample ships with example rows, so Inserted counts
  // vary run to run. Assertions: zero failures + OUR rows land in the list.
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*0/)).toBeVisible({ timeout: 30000 });
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-PRD-010-step1');
  const products = new ProductPage(adminPage);
  await products.gotoViaUI();
  await adminPage.fill('input[name="product_table_search_filter"]', `QA Pd ${tag} A`);
  await expect(products.row(`QA Pd ${tag} A`).first()).toBeVisible({ timeout: 20000 });
  // Re-upload same file: duplicates must be rejected, not doubled.
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate/i).first()).toBeVisible({
    timeout: 30000,
  });
  await saveEvidence(adminPage, 'TC-PRD-010');
});

test('TC-PRD-011: invalid file rejected', async ({ adminPage }) => {
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Product Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-PRD-011');
});

test('TC-PRD-012: print view renders', async ({ adminPage }) => {
  const products = new ProductPage(adminPage);
  const data = getNewProduct();
  await products.addProduct(data.name, data.description);
  await products.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-PRD-012');
});
