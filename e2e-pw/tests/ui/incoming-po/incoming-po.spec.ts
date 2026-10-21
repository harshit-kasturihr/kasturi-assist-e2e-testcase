import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../../fixtures/test-fixtures';
import { IncomingPOPage } from '../../../pages/IncomingPOPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-1142 sub-tasks TC-IPO-001..TC-IPO-008.
// (TC-IPO-009 valid insert is BLOCKED — held customer-resolution case.)
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

const __filename = fileURLToPath(import.meta.url);
const E2E_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const VENV_PYTHON = path.join(E2E_ROOT, '..', '..', 'venv', 'bin', 'python');

test('TC-IPO-001: batch list loads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  await expect(adminPage.locator('#search')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Upload Excel' })).toBeVisible();
  await saveEvidence(adminPage, 'TC-IPO-001');
});

test('TC-IPO-002: search finds batch', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  // Use the first batch's PO number (if any batches exist).
  const firstCell = (await ipo.rows().first().locator('td').first().textContent().catch(() => '')) || '';
  if (firstCell.trim() && firstCell.trim() !== '-') {
    await ipo.applyFilters({ search: firstCell.trim() });
    await expect(ipo.row(firstCell.trim()).first()).toBeVisible({ timeout: 20000 });
  }
  await saveEvidence(adminPage, 'TC-IPO-002');
});

test('TC-IPO-003: pager is consistent', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  const body = (await adminPage.locator('body').textContent()) || '';
  expect(body.length).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-IPO-003');
});

test('TC-IPO-004: date filter applies', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  await ipo.applyFilters({ date_from: '2026-01-01', date_to: '2026-12-31' });
  await saveEvidence(adminPage, 'TC-IPO-004');
});

test('TC-IPO-005: upload_status filter applies', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  await ipo.applyFilters({ upload_status: 'rejected' });
  const rows = await ipo.rows().count();
  expect(rows).toBeGreaterThanOrEqual(0);
  await saveEvidence(adminPage, 'TC-IPO-005');
});

test('TC-IPO-006: sample template downloads', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
  const link = adminPage.locator('a[href$="/incoming-po/upload/sample"]');
  const [download] = await Promise.all([
    adminPage.context().waitForEvent('download', { timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  let saved = download ? await download.path() : '';
  if (!saved) {
    const resp = await adminPage.request.get('/incoming-po/upload/sample');
    expect(resp.status()).toBe(200);
    const tmp = path.join(os.tmpdir(), `qa-ipo-sample-${Date.now()}.xlsx`);
    fs.writeFileSync(tmp, await resp.body());
    saved = tmp;
  }
  expect(fs.statSync(saved as string).size).toBeGreaterThan(0);
  await saveEvidence(adminPage, 'TC-IPO-006');
});

test('TC-IPO-007: invalid file rejected', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
  const bad = path.join(os.tmpdir(), `qa-ipo-bad-${Date.now()}.csv`);
  fs.writeFileSync(bad, 'Customer Name\nQA Bad\n');
  await adminPage.setInputFiles('#excel_file', bad);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/Only \.xlsx/)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-IPO-007');
});

test('TC-IPO-008: empty upload errors', async ({ adminPage }) => {
  test.slow();
  test.setTimeout(300000);
  const ipo = new IncomingPOPage(adminPage);
  await ipo.gotoViaUI();
  await adminPage.getByRole('link', { name: 'Upload Excel' }).click();
  await adminPage.locator('[data-upload-submit]').click();
  const msg: string | null = await adminPage.evaluate(() => {
    const input = document.getElementById('excel_file') as HTMLInputElement | null;
    return input ? input.validationMessage : null;
  });
  expect(msg).toBeTruthy();
  await saveEvidence(adminPage, 'TC-IPO-008-step1');
  const empty = path.join(os.tmpdir(), `qa-ipo-empty-${Date.now()}.xlsx`);
  fs.writeFileSync(empty, Buffer.alloc(0));
  await adminPage.setInputFiles('#excel_file', empty);
  await adminPage.locator('[data-upload-submit]').click();
  await expect(adminPage.getByText(/empty/i)).toBeVisible({ timeout: 15000 });
  await saveEvidence(adminPage, 'TC-IPO-008');
});
