import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { IncidentPage } from '../../../pages/IncidentPage';
import { AssetPage } from '../../../pages/AssetPage';
import { getNewAsset } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1057 sub-tasks TC-INC-016..TC-INC-018 (sample/upload).
// Upload required cols: Asset Serial, Problem, Priority, Effort, AMC Scope.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const inc = new IncidentPage(adminPage);
  await inc.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  await gotoUpload(adminPage);
  const link = adminPage.locator('a[href$="/incident/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/incident/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-inc-sample-${Date.now()}-${attempt}.xlsx`);
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

/** Append a valid incident row (+ blank) referencing an existing asset. */
function buildUploadFile(samplePath: string, tag: string, serial: string): { file: string; problem: string } {
  const out = path.join(os.tmpdir(), `qa-incs-${tag}-${Date.now()}.xlsx`);
  const problem = `QA incident ${tag}`;
  const lines = [
    'import sys,openpyxl',
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active',
    'hdr=[str(c.value or "") for c in ws[1]]',
    'idx={h:i for i,h in enumerate(hdr)}',
    'base=[""]*len(hdr)',
    'r=list(base)',
    'r[idx["Asset Serial"]]=sys.argv[4]',
    `r[idx["Problem"]]=sys.argv[5]`,
    'r[idx["Priority"]]="P3";r[idx["Effort"]]="Skill"',
    'r[idx["AMC Scope"]]="Non-AMC"',
    'ws.append(r);ws.append(base)',
    'wb.save(sys.argv[2])',
  ];
  execFileSync(VENV_PYTHON, ['-c', lines.join('\n'), samplePath, out, tag, serial, problem], {
    timeout: 60000,
  });
  return { file: out, problem };
}

test('TC-INC-016: sample template downloads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  const headers = sampleHeaders(file);
  for (const h of ['Asset Serial', 'Problem', 'Priority', 'Effort', 'AMC Scope']) {
    expect(headers).toContain(h);
  }
  await saveEvidence(adminPage, 'TC-INC-016');
});

test('TC-INC-017: valid xlsx upload inserts', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(600000);
  // Uploaded rows reference real assets (standing rule).
  const ast = new AssetPage(adminPage);
  const asset = getNewAsset();
  await ast.addAsset(asset);
  await gotoUpload(adminPage);
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const { file, problem } = buildUploadFile(sample, tag, asset.serial);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*[1-9]/)).toBeVisible({ timeout: 30000 });
  const inc = new IncidentPage(adminPage);
  await inc.gotoViaUI();
  await adminPage.fill('#data-search', problem);
  await adminPage.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await adminPage.waitForTimeout(1500);
  await expect(adminPage.locator('tr.data-row')).toHaveCount(1, { timeout: 20000 });
  await saveEvidence(adminPage, 'TC-INC-017');
});

test('TC-INC-018: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-inc-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Asset Serial\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-INC-018');
});
