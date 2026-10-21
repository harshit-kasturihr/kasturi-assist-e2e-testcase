import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { SkillsPage } from '../../../pages/SkillsPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-708 sub-tasks TC-SKL-008..TC-SKL-012 (search/sort/upload).
// Upload source: the app's own /skills/upload/sample (downloaded at runtime).
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

test('TC-SKL-008: search filters skill rows', async ({ adminPage }) => {
  const skills = new SkillsPage(adminPage);
  await skills.gotoViaUI();
  await adminPage.fill('#data-search', 'no-such-skill-xyz');
  await expect(adminPage.locator('tr.data-row')).toHaveCount(0);
  await saveEvidence(adminPage, 'TC-SKL-008');
});

test('TC-SKL-009: sort dropdown reorders', async ({ adminPage }) => {
  const skills = new SkillsPage(adminPage);
  const asc = await skills.sortAndReadNames('asc');
  const desc = await skills.sortAndReadNames('desc');
  expect(asc.length).toBeGreaterThan(1);
  expect(desc).toEqual([...asc].reverse());
  await saveEvidence(adminPage, 'TC-SKL-009');
});

async function downloadSample(adminPage: import('@playwright/test').Page): Promise<string> {
  const skills = new SkillsPage(adminPage);
  await skills.gotoUpload();
  const link = adminPage.locator('a[href$="/skills/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    if (saved && isParseableXlsx(saved)) return saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await adminPage.request.get('/skills/upload/sample');
    if (resp.status() !== 200) continue;
    const buf = await resp.body();
    const tmp = path.join(os.tmpdir(), `qa-skill-sample-${Date.now()}-${attempt}.xlsx`);
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

test('TC-SKL-010: sample template downloads', async ({ adminPage }) => {
  const file = await downloadSample(adminPage);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-SKL-010');
});

function buildUploadFile(samplePath: string, tag: string): string {
  const out = path.join(os.tmpdir(), `qa-skills-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'ws.append(["QA Sk "+sys.argv[3]+" A"]);' +
    'ws.append(["QA Sk "+sys.argv[3]+" B"]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, samplePath, out, tag], {
    timeout: 60000,
  });
  return out;
}

test('TC-SKL-011: valid xlsx upload inserts, dupes rejected', async ({
  adminPage,
}) => {
  const skills = new SkillsPage(adminPage);
  await skills.gotoUpload();
  const sample = await downloadSample(adminPage);
  const tag = Date.now().toString().slice(-6);
  const file = buildUploadFile(sample, tag);
  const result = adminPage.getByText(/Total Rows|Inserted/i);
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*2/)).toBeVisible({ timeout: 30000 });
  await saveEvidence(adminPage, 'TC-SKL-011-step1');
  // Re-upload same file: duplicates must be rejected, not doubled.
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Failed:\s*[1-9]|Duplicate/i).first()).toBeVisible({
    timeout: 30000,
  });
  const skills2 = new SkillsPage(adminPage);
  await skills2.gotoViaUI();
  await adminPage.fill('#data-search', `QA Sk ${tag} A`);
  await expect(skills2.row(`QA Sk ${tag} A`)).toHaveCount(1);
  await saveEvidence(adminPage, 'TC-SKL-011');
});

test('TC-SKL-012: invalid file rejected', async ({ adminPage }) => {
  const skills = new SkillsPage(adminPage);
  await skills.gotoUpload();
  const bad = path.join(os.tmpdir(), `qa-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Skill Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-SKL-012');
});
