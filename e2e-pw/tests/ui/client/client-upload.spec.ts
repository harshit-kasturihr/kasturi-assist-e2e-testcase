import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { ClientPage } from '../../../pages/ClientPage';
import { getNewClient } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-694 sub-tasks TC-CLT-009..TC-CLT-013 (upload + print + export).
// Upload source: test-data/client_upload_template.xlsx (user-provided).
// TC-CLT-010 fills a COPY (original stays pristine) via the repo venv's
// openpyxl — 2 unique rows per run, no cross-run collisions.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const TEMPLATE = path.join(E2E_ROOT, 'test-data', 'client_upload_template.xlsx');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

function buildUploadFile(tag: string): string {
  const out = path.join(os.tmpdir(), `qa-clients-${tag}-${Date.now()}.xlsx`);
  const py =
    'import sys,openpyxl;' +
    'wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;' +
    'ws.append(["QA Up "+sys.argv[3]+" A","QAU"+sys.argv[3],"Up Addr A","201301","QA","qa.a@ex.com","9000000001",""]);' +
    'ws.append(["QA Up "+sys.argv[3]+" B","QAU"+sys.argv[3]+"b","Up Addr B","201301","QA","qa.b@ex.com","9000000002",""]);' +
    'wb.save(sys.argv[2])';
  execFileSync(VENV_PYTHON, ['-c', py, TEMPLATE, out, tag], {
    timeout: 60000,
  });
  return out;
}

async function gotoUpload(adminPage: import('@playwright/test').Page): Promise<void> {
  const clients = new ClientPage(adminPage);
  await clients.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
}

test('TC-CLT-009: sample template downloads', async ({ adminPage }) => {
  // The sample link has no download attribute: browsers may download it or
  // navigate to it. Handle both — either way the xlsx bytes must arrive.
  await gotoUpload(adminPage);
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    adminPage.locator('a[href$="/client/upload/sample"]').click(),
  ]);
  if (download) {
    const saved = await download.path();
    expect(saved).toBeTruthy();
    expect(download.suggestedFilename()).toContain('.xlsx');
    expect(fs.statSync(saved as string).size).toBeGreaterThan(0);
  } else {
    const resp = await adminPage.request.get('/client/upload/sample');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type'] || '').toContain('spreadsheet');
    const buf = await resp.body();
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 2).toString()).toBe('PK');
  }
  await saveEvidence(adminPage, 'TC-CLT-009');
});

test('TC-CLT-010: valid xlsx upload inserts', async ({ adminPage }) => {
  await gotoUpload(adminPage);
  const file = buildUploadFile(Date.now().toString().slice(-6));
  await adminPage.setInputFiles('#excel_file', file);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Inserted:\s*2/)).toBeVisible({ timeout: 30000 });
  await saveEvidence(adminPage, 'TC-CLT-010');
});

test('TC-CLT-011: invalid file rejected', async ({ adminPage }) => {
  await gotoUpload(adminPage);
  const bad = path.join(os.tmpdir(), `qa-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Client Name,Client Code\nQA Bad,QABAD\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible();
  await saveEvidence(adminPage, 'TC-CLT-011');
});

test('TC-CLT-012: print view renders', async ({ adminPage }) => {
  const clients = new ClientPage(adminPage);
  const data = getNewClient();
  await clients.addClient(data);
  await clients.expectPrintView(data.companyName);
  await saveEvidence(adminPage, 'TC-CLT-012');
});

test('TC-CLT-013: export Excel downloads client xlsx', async ({ adminPage }) => {
  // Generic table export (table.html else-branch → /api/export/client).
  // Like the sample link it may download or navigate — handle both.
  const clients = new ClientPage(adminPage);
  await clients.gotoViaUI();
  const link = adminPage.locator('a[href$="/api/export/client"]');
  await expect(link).toBeVisible();
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 20000 }).catch(() => null),
    link.click(),
  ]);
  if (download) {
    const saved = await download.path();
    expect(saved).toBeTruthy();
    expect(fs.statSync(saved as string).size).toBeGreaterThan(0);
  } else {
    const resp = await adminPage.request.get('/api/export/client');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type'] || '').toMatch(/spreadsheet|excel|octet-stream/);
    const buf = await resp.body();
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 2).toString()).toBe('PK');
  }
  await saveEvidence(adminPage, 'TC-CLT-013');
});
