import { expect, type Page } from '@playwright/test';

export class IncomingPOPage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Inventory → Incoming PO. */
  async gotoViaUI(): Promise<void> {
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
    await this.page.locator('button[data-tour="panel-inventory"]').click();
    await this.page.locator('a[href="/incoming-po"]').click();
    await expect(this.page.locator('#search')).toBeVisible({ timeout: 20000 });
  }

  rows() {
    return this.page.locator('tbody tr');
  }

  row(key: string) {
    return this.page.locator('tbody tr', { hasText: key });
  }

  async applyFilters(fields: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(fields)) {
      const el = this.page.locator(`[name="${name}"]`);
      const tag = await el.evaluate((e) => e.tagName).catch(() => '');
      if (tag === 'SELECT') await el.selectOption(value);
      else await el.fill(value);
    }
    await this.page.locator('form.ipo-filter-grid button[type="submit"]').click();
    await this.page.waitForTimeout(2500);
  }
}
