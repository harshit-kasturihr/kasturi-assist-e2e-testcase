import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { VendorPage } from '../../../pages/VendorPage';
import { getNewVendor } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight } from '../../../utils/narrate';

// Covers KASSIST-738 sub-tasks TC-VND-009..TC-VND-012 (sample/upload/print).
// Upload contract: 8 required columns (Vendor Name, Vendor Code, Address1,
// Address2, Pincode, Contact Person, Contact Email, Contact Phone) + GST No.
// TC-VND-010 fills a COPY of the downloaded sample (original pristine) via
// the repo venv's openpyxl — 2 unique rows per run.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const vendors = new VendorPage(adminPage);
  await vendors.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/vendor/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/vendor/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-vendor-sample-${Date.now()}-${attempt}.xlsx`);
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
  const out = path.join(os.tmpdir(), `qa-vendors-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'ws.append(["QA Vd "+sys.argv[3]+" A","QAV"+sys.argv[3],"Addr A","Addr A2","201301","QA","qa.a@ex.com","9000000001",""]);' +
    'ws.append(["QA Vd "+sys.argv[3]+" B","QAV"+sys.argv[3]+"b","Addr B","Addr B2","201301","QA","qa.b@ex.com","9000000002",""]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, samplePath, out, tag], {
    timeout: 60000,
  });
  return out;
}

test('TC-VND-009: sample template downloads', async ({ adminPage }) => {
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-VND-009');
});

test('TC-VND-010: valid xlsx upload inserts, dupes rejected', async ({
  adminPage,
}) => {
  // Note: the downloaded sample ships with example rows that fail
  // server-side ("Vendor Code is required") — only OUR 2 appended rows
  // count. Assert Inserted == 2 and prove our rows landed in the list.
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*2/)).toBeVisible({ timeout: 30000 });
  await saveEvidence(adminPage, 'TC-VND-010-step1');
  const vendors = new VendorPage(adminPage);
  await vendors.gotoViaUI();
  await adminPage.fill('#data-search', `QA Vd ${tag} A`);
  await expect(vendors.row(`QA Vd ${tag} A`).first()).toBeVisible({ timeout: 20000 });
  // Re-upload same file: our 2 rows are now duplicates → must be rejected.
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate/i).first()).toBeVisible({
    timeout: 30000,
  });
  await saveEvidence(adminPage, 'TC-VND-010');
});

test('TC-VND-011: invalid file rejected', async ({ adminPage }) => {
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Vendor Name,Vendor Code\nQA Bad,QABAD\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-VND-011');
});

test('TC-VND-012: print view renders', async ({ adminPage }) => {
  const vendors = new VendorPage(adminPage);
  const data = getNewVendor();
  await vendors.addVendor(data);
  await vendors.expectPrintView(data.name);
  await saveEvidence(adminPage, 'TC-VND-012');
});

test('TC-VND-013: uploaded vendors visible in plain list immediately (KASSIST-751)', async ({ adminPage }) => {
  // The search box bypasses the list cache, so check the PLAIN list total.
  test.setTimeout(400000);
  const vendors = new VendorPage(adminPage);
  const total = async () => {
    const t = (await adminPage.getByText(/Showing .* records/).first().innerText().catch(() => '')) || '';
    return Number((t.match(/of\s+(\d+)\s+records/) || [])[1] || '0');
  };

  // Step 1: open the plain list (fills the list cache) and note the total.
  await vendors.gotoViaUI();
  const before = await total();
  await highlight(adminPage, 'text=/Showing .* records/', '#1d3a8a');
  await caption(adminPage, 'KASSIST-751 · Step 1', `Vendor list (no search): ${before} records.`);

  // Step 2: upload 2 new vendors.
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  await adminPage.setInputFiles('#excel_file', buildUploadFile(sample, tag));
  await adminPage.locator('[data-upload-submit]').click();
  // Import is queued and processed in the background - wait for the summary.
  await expect(adminPage.getByText(/Inserted:\s*2/)).toBeVisible({ timeout: 180000 });
  await caption(adminPage, 'KASSIST-751 · Step 2', `Upload Excel with 2 new vendors (QA Vd ${tag} A / B) → Import Summary: Inserted 2.`);

  // Step 3: open the plain list again immediately.
  await vendors.gotoViaUI();
  const after = await total();
  const ok = after === before + 2;
  await highlight(adminPage, 'text=/Showing .* records/', ok ? '#12b76a' : '#f04438');
  await caption(
    adminPage,
    `KASSIST-751 · Step 3 · ${ok ? 'Result (FIXED)' : 'Actual result (BUG)'}`,
    `Re-opened Vendor list right away (no search): ${after} records (was ${before}). ${ok ? 'Both uploaded vendors counted immediately.' : 'List is stale - uploaded vendors not shown yet.'}`,
    ok ? 'pass' : 'fail',
  );
  await saveEvidence(adminPage, 'TC-VND-013');
  expect(after).toBe(before + 2);
});
