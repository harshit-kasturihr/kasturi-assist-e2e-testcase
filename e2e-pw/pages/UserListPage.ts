import { expect, type Page } from '@playwright/test';

export class UserListPage {
  constructor(private page: Page) {}

  row(email: string) {
    return this.page.locator('tr.data-row', { hasText: email });
  }

  /** Add button disabled state (user-limit gate). */
  async isAddDisabled(): Promise<boolean> {
    await this.gotoViaUI();
    return (
      (await this.page
        .locator('span.btn-add[style*="not-allowed"]')
        .count()) > 0
    );
  }

  /**
   * Click-through entry (navigation rule): Dashboard → Master group →
   * User Accounts link. No direct-URL deep navigation.
   */
  async gotoViaUI(): Promise<void> {
    await this.page.goto('/home');
    await this.page.locator('button[data-tour="panel-master"]').click();
    await this.page.locator('a[href$="/account_creation"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  async expectRowVisible(email: string): Promise<void> {
    // Toolbar search (client) after click-through entry — deterministic
    // regardless of list ordering/pagination.
    await this.gotoViaUI();
    await this.search(email);
    await expect(this.row(email).first()).toBeVisible();
  }

  /** Client-side toolbar filter. */
  async search(query: string): Promise<void> {
    await this.page.fill('#data-search', query);
  }

  /** Sort dropdown (client-side reorder). Returns visible first-column texts. */
  async sortAndReadFirstColumn(value: 'asc' | 'desc'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForTimeout(800);
    return this.page.locator('tr.data-row td:first-child').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  }

  /** Click a pager link (First/Last/numbered) and read the first row. */
  async pagerGoTo(label: string): Promise<string> {
    await this.gotoViaUI();
    await this.page.locator('.pagination-controls a', { hasText: label }).first().click();
    const cell = this.page.locator('tr.data-row td').first();
    await expect(cell).toBeVisible();
    return ((await cell.textContent()) || '').trim();
  }

  async openEdit(email: string): Promise<void> {
    await this.gotoViaUI();
    await this.search(email);
    await this.row(email).locator('a.edit-btn').click();
  }

  /** Click-through pager: page 1 vs page 2 first rows must differ. */
  async expectPageTwoDiffers(): Promise<boolean> {
    await this.gotoViaUI();
    const firstPage1 =
      ((await this.page.locator('tr.data-row td').first().textContent()) || '').trim();
    const page2 = this.page.locator('.pagination-controls a', { hasText: '2' });
    if ((await page2.count()) === 0) return false;
    await page2.first().click();
    const firstPage2 =
      ((await this.page.locator('tr.data-row td').first().textContent()) || '').trim();
    expect(firstPage1.length).toBeGreaterThan(0);
    expect(firstPage2.length).toBeGreaterThan(0);
    expect(firstPage2).not.toBe(firstPage1);
    return true;
  }
}
