import { expect, type Page } from '@playwright/test';
import type { NewAsset, NewEmployee } from '../utils/testData';
import { getNewAsset, getNewEmployee, getNewIncident } from '../utils/testData';
import { AssetPage } from './AssetPage';
import { EmployeePage } from './EmployeePage';

export interface IncidentPrereqs {
  asset: NewAsset;
  employee: NewEmployee;
}

export class IncidentPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Incident → Incident. */
  async gotoViaUI(): Promise<void> {
    // domcontentloaded: the dashboard's full 'load' event stalls under CPU
    // pressure (charts/widgets); explicit timeout keeps retries fast.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/home', { timeout: 30000, waitUntil: 'domcontentloaded' });
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        await this.page.waitForTimeout(1000);
      }
    }
    if (lastError) throw lastError;
    await this.page.locator('button[data-tour="panel-incident"]').click();
    await this.page.locator('a[href="/incident"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  /** Rows keyed by the (unique, untruncated) problem text. */
  row(problem: string) {
    return this.page.locator('tr.data-row', { hasText: problem });
  }

  async expectRowVisible(problem: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', problem);
    await expect(this.row(problem).first()).toBeVisible({ timeout: 20000 });
  }

  /**
   * Standing rule: an Incident needs an Asset (with Domain) and an
   * Employee (engineer) — all created first in the same TC.
   */
  async ensurePrerequisites(): Promise<IncidentPrereqs> {
    const assetPage = new AssetPage(this.page);
    const empPage = new EmployeePage(this.page);
    const asset = getNewAsset();
    await assetPage.addAsset(asset);
    const employee = getNewEmployee();
    await empPage.addEmployee(employee);
    return { asset, employee };
  }

  /** Pick the asset in the serial autocomplete (sets the hidden asset id). */
  async pickAssetSerial(serial: string): Promise<void> {
    await this.page.fill('#asset_serial_input', serial);
    const opt = this.page.locator('#asset_serial_suggestions > *').first();
    await expect(opt).toBeVisible({ timeout: 15000 });
    await opt.click();
    const hidden = await this.page.inputValue('#asset_serial_hidden');
    expect(hidden).toBeTruthy();
  }

  /** Fill the add/edit form (problem + selects + engineer + address/pin). */
  async fillIncidentForm(problem: string, assetSerial: string, engineerName: string): Promise<void> {
    await this.pickAssetSerial(assetSerial);
    await this.page.fill('#problem', problem);
    await this.page.selectOption('#priority', 'P3');
    await this.page.selectOption('#status', 'Open');
    await this.page.selectOption('#effort', 'Skill');
    await this.page.selectOption('#amc_scope', 'Non-AMC');
    await this.page.selectOption('#domain_id', { index: 1 });
    await this.page.selectOption('#engineer', { label: engineerName });
    await this.page.fill('#address', 'QA Address 1');
    // NOTE: pincode autocomplete suggestions hang under automation;
    // pin is not server-mandatory, so it is left blank.
  }

  /** Submit the incident form (scrolls past the Kira avatar overlay). */
  async submitForm(): Promise<void> {
    const submit = this.page.locator('button[type="submit"].btn-primary');
    await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await submit.click();
  }

  async addIncident(problem: string, assetSerial: string, engineerName: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/incident/add"]').click();
    await this.fillIncidentForm(problem, assetSerial, engineerName);
    await this.submitForm();
    await this.page.waitForURL('**/incident', { timeout: 30000, waitUntil: 'commit' });
    await this.page.fill('#data-search', problem);
    await expect(this.row(problem).first()).toBeVisible({ timeout: 20000 });
  }

  /** Assign an engineer via the status-pill modal; returns toast text. */
  async assignEngineer(problem: string, engineerName: string): Promise<string> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', problem);
    const pill = this.row(problem).first().locator('span.sr-assign-trigger');
    await expect(pill).toBeVisible({ timeout: 20000 });
    await pill.click();
    await expect(this.page.locator('#sr-assign-modal')).toBeVisible({ timeout: 15000 });
    await this.page.selectOption('#sr-assign-select', { label: engineerName });
    await this.page.locator('#sr-assign-save').click();
    await this.page.waitForTimeout(3000);
    return ((await this.page.locator('.toast.show, .toast').first().textContent().catch(() => '')) || '').trim();
  }
}
