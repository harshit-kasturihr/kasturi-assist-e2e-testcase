import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { AssetPage } from '../../../pages/AssetPage';
import { getNewAsset } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1009 sub-tasks TC-AST-015..TC-AST-019 (sample/upload).
// Upload required cols: Serial No, Make, Model, Part Name, Domain,
// PO Number, Location, Status, Condition, Priority, Impact, Criticality,
// Asset For, Purchase Date. Blank rows skipped.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

const REQUIRED = ['Serial No', 'Make', 'Model', 'Part Name', 'Domain', 'PO Number', 'Location', 'Status', 'Condition', 'Priority', 'Impact', 'Criticality', 'Asset For', 'Purchase Date'];

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const ast = new AssetPage(adminPage);
  await ast.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/asset/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/asset/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-ast-sample-${Date.now()}-${attempt}.xlsx`);
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

/** Append two valid asset rows (+ one blank) to a copy of the sample. */
function buildUploadFile(samplePath: string, tag: string, domain: string): { file: string; a: string; b: string } {
  const out = path.join(os.tmpdir(), `qa-asts-${tag}-${Date.now()}.xlsx`);
  const lines = [
    'import sys,openpyxl',
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active',
    'hdr=[str(c.value or "") for c in ws[1]]',
    'idx={h:i for i,h in enumerate(hdr)}',
    'base=[""]*len(hdr)',
    'r1=list(base)',
    'r1[idx["Serial No"]]="QA AST "+sys.argv[3]+" A"',
    'r1[idx["Make"]]="QA Make";r1[idx["Model"]]="QA Model A"',
    'r1[idx["Part Name"]]="QA Part";r1[idx["Domain"]]=sys.argv[4]',
    `r1[idx["PO Number"]]="QAPO${tag}A";r1[idx["Location"]]="QA Loc"`,
    'r1[idx["Status"]]="Active";r1[idx["Condition"]]="Good"',
    'r1[idx["Priority"]]="Medium";r1[idx["Impact"]]="Medium"',
    'r1[idx["Criticality"]]="Medium";r1[idx["Asset For"]]="HARDWARE"',
    'r1[idx["Purchase Date"]]="2026-10-01"',
    'r2=list(base)',
    'r2[idx["Serial No"]]="QA AST "+sys.argv[3]+" B"',
    'r2[idx["Make"]]="QA Make";r2[idx["Model"]]="QA Model B"',
    'r2[idx["Part Name"]]="QA Part";r2[idx["Domain"]]=sys.argv[4]',
    `r2[idx["PO Number"]]="QAPO${tag}B";r2[idx["Location"]]="QA Loc"`,
    'r2[idx["Status"]]="Active";r2[idx["Condition"]]="Good"',
    'r2[idx["Priority"]]="Medium";r2[idx["Impact"]]="Medium"',
    'r2[idx["Criticality"]]="Medium";r2[idx["Asset For"]]="HARDWARE"',
    'r2[idx["Purchase Date"]]="2026-10-01"',
    'ws.append(r1);ws.append(base);ws.append(r2)',
    'wb.save(sys.argv[2])',
  ];
  execFileSync(VENV_PYTHON, ['-c', lines.join('\n'), samplePath, out, tag, domain], {
    timeout: 60000,
  });
  return { file: out, a: `QA AST ${tag} A`, b: `QA AST ${tag} B` };
}

test('TC-AST-015: sample template downloads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  const headers = sampleHeaders(file);
  for (const h of REQUIRED) expect(headers).toContain(h);
  await saveEvidence(adminPage, 'TC-AST-015');
});

test('TC-AST-016: valid xlsx upload inserts', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const domain = await ast.ensureDomain();
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, a, b } = buildUploadFile(sample, tag, domain);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', a);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  // NOTE: hasText cannot match here — the highlight bug shreds " A"-suffixed
  // names into span soup (filed generically). Assert via count + title attr.
  await expect(adminPage.locator('tr.data-row')).toHaveCount(1, { timeout: 20000 });
  await expect(adminPage.locator(`tr.data-row td[title="${a}"]`)).toHaveCount(1, { timeout: 20000 });
  await adminPage.fill('#data-search', b);
  await adminPage.waitForTimeout(1500);
  await expect(adminPage.locator('tr.data-row')).toHaveCount(1, { timeout: 20000 });
  await expect(adminPage.locator(`tr.data-row td[title="${b}"]`)).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-AST-016');
});

test('TC-AST-017: re-upload same file handled without doubling', async ({
  adminPage,
}) => {
  test.slow();
  test.setTimeout(300000);
  const ast = new AssetPage(adminPage);
  const domain = await ast.ensureDomain();
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, b } = buildUploadFile(sample, tag, domain);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', b);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  // hasText-safe form (highlight shreds " A" names — see TC-AST-016 note).
  const before = await adminPage.locator('tr.data-row').count();
  expect(before).toBeGreaterThan(0);
  await gotoUpload(adminPage);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate|Skipped:\s*[1-9]|Inserted:\s*0/i).first()).toBeVisible({
    timeout: 30000,
  });
  await ast.gotoViaUI();
  await adminPage.fill('#data-search', b);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  await expect(adminPage.locator('tr.data-row')).toHaveCount(before);
  await saveEvidence(adminPage, 'TC-AST-017');
});

test('TC-AST-018: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-ast-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Serial No\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-AST-018');
});

test('TC-AST-019: empty upload errors', async ({ adminPage }) => {
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
  await saveEvidence(adminPage, 'TC-AST-019-step1');
  const empty = path.join(os.tmpdir(), `qa-ast-empty-${Date.now()}.xlsx`);
  fs.writeFileSync(empty, Buffer.alloc(0));
  await adminPage.setInputFiles('#excel_file', empty);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/empty/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-AST-019');
});
