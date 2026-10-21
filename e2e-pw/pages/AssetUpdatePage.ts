import { expect, type Page } from '@playwright/test';
import type { NewAsset, NewEmployee } from '../utils/testData';
import { getNewAsset, getNewEmployee } from '../utils/testData';
import { AssetPage } from './AssetPage';
import { EmployeePage } from './EmployeePage';

export class AssetUpdatePage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Asset Management → Asset Update. */
  async gotoViaUI(): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/home');
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        await this.page.waitForTimeout(1000);
      }
    }
    if (lastError) throw lastError;
    await this.page.locator('button[data-tour="panel-asset_management"]').click();
    await this.page.locator('a[href="/asset-update"]').click();
    await expect(this.page.locator('#serial_no')).toBeVisible();
  }

  /**
   * Standing rule: needs an Asset (with Domain) and an Employee assignee —
   * all created first in the same TC. Returns identifiers for the test.
   */
  async ensureAssetAndAssignee(): Promise<{ asset: NewAsset; employee: NewEmployee }> {
    const assetPage = new AssetPage(this.page);
    const empPage = new EmployeePage(this.page);
    const asset = getNewAsset();
    await assetPage.addAsset(asset);
    const employee = getNewEmployee();
    await empPage.addEmployee(employee);
    return { asset, employee };
  }

  /**
   * Search by serial via the autocomplete suggestion (the working path —
   * the Search button with free text hits a 422, filed separately).
   */
  async searchAsset(serial: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#serial_no', serial);
    const opt = this.page.locator('.asset-update-option', { hasText: serial }).first();
    await expect(opt).toBeVisible({ timeout: 15000 });
    await opt.click();
    await expect(this.page.locator('#current-source')).not.toContainText(
      /Waiting for search/i,
      { timeout: 20000 },
    );
  }

  /** Type a fragment and pick the first autocomplete suggestion. */
  async pickSuggestion(fragment: string): Promise<string> {
    await this.gotoViaUI();
    await this.page.fill('#serial_no', fragment);
    const first = this.page.locator('#serial-search-results > *').first();
    await expect(first).toBeVisible({ timeout: 15000 });
    const text = ((await first.textContent()) || '').trim();
    await first.click();
    return text;
  }

  /** Current status message text (success/error/info). */
  async statusText(): Promise<string> {
    return ((await this.page.locator('#asset-update-status').textContent()) || '').trim();
  }

  /** Select assignee by visible employee name in the dropdown. */
  async selectAssignee(employeeName: string): Promise<void> {
    await this.page.selectOption('#assign_to', { label: employeeName });
  }

  /** Save via the Update button; returns the status message shown. */
  async saveUpdate(opts: { location?: string; note?: string } = {}): Promise<string> {
    if (opts.location !== undefined) await this.page.fill('#location', opts.location);
    if (opts.note !== undefined) await this.page.fill('#note', opts.note);
    await this.page.locator('#asset-update-save').click();
    await this.page.waitForFunction(
      () => (document.getElementById('asset-update-status')?.textContent || '').trim().length > 0,
      { timeout: 20000 },
    ).catch(() => null);
    await this.page.waitForTimeout(1000);
    return this.statusText();
  }

  /** Prefilled current-details text (assignee/location/updated/source). */
  async currentDetails(): Promise<string> {
    const parts = await Promise.all([
      this.page.locator('#current-assignee').textContent(),
      this.page.locator('#current-location').textContent(),
      this.page.locator('#current-updated-on').textContent(),
      this.page.locator('#current-source').textContent(),
    ]);
    return parts.map((p) => (p || '').trim()).join(' | ');
  }

  /** Ensure the history panel ends open regardless of prior state. */
  async ensureHistoryOpen(): Promise<void> {
    const cls = (await this.page.locator('#asset-history-panel').getAttribute('class')) || '';
    if (!cls.includes('is-open')) {
      await this.page.locator('#history-toggle-top').click();
      await this.page.waitForTimeout(1000);
    }
    await expect(this.page.locator('#asset-history-panel')).toHaveClass(/is-open/);
  }

  async closeHistory(): Promise<boolean> {
    const cls = (await this.page.locator('#asset-history-panel').getAttribute('class')) || '';
    if (cls.includes('is-open')) {
      await this.page.locator('#history-toggle-bottom').click();
      await this.page.waitForTimeout(1000);
    }
    const after = (await this.page.locator('#asset-history-panel').getAttribute('class')) || '';
    return !after.includes('is-open');
  }

  async historyText(): Promise<string> {
    return ((await this.page.locator('#asset-history-timeline').textContent()) || '').trim();
  }
}
