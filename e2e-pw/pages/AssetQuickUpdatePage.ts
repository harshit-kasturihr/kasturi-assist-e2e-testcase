import { expect, type Page } from '@playwright/test';
import type { NewAsset } from '../utils/testData';
import { getNewAsset } from '../utils/testData';
import { AssetPage } from './AssetPage';

export class AssetQuickUpdatePage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Asset Management → Asset Quick Update. */
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
    await this.page.locator('a[href="/asset-quick-update"]').click();
    await expect(this.page.locator('input.aqu-search-input')).toBeVisible();
  }

  /** Standing rule: a fresh Asset (with Domain) is created first. */
  async ensureAsset(): Promise<NewAsset> {
    const assetPage = new AssetPage(this.page);
    const data = getNewAsset();
    await assetPage.addAsset(data);
    return data;
  }

  /** GET search for a serial; returns the result row count. */
  async search(serial: string): Promise<number> {
    await this.gotoViaUI();
    await this.page.fill('input.aqu-search-input', serial);
    await this.page.getByRole('button', { name: /Search/ }).click();
    await this.page.waitForTimeout(2000);
    return this.page.locator('table.aqu-table tbody tr').count();
  }

  /** Open the inline edit form for the first result row. */
  async openEdit(): Promise<void> {
    await this.page.locator('table.aqu-table a', { hasText: 'Update' }).first().click();
    await expect(this.page.locator('#aq_status')).toBeVisible({ timeout: 15000 });
  }

  /** Save the quick-edit form; returns visible toast/message text. */
  async save(): Promise<string> {
    await this.page.locator('button.aqu-btn-green').click();
    await this.page.waitForTimeout(3000);
    const toast = await this.page.evaluate(() => {
      const els = document.querySelectorAll('.toast.show, .toast, [data-toast-message]');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (el.textContent || '').trim()) {
          return (el.textContent || '').trim().slice(0, 80);
        }
      }
      return '';
    });
    return `${toast} || url=${this.page.url()}`;
  }
}
