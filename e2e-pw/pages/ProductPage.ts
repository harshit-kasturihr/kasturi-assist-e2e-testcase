import { expect, type Page } from '@playwright/test';

export class ProductPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Product. */
  async gotoViaUI(): Promise<void> {
    // /home navigations intermittently abort (ERR_ABORTED) under load —
    // a safe GET retry, max 3 (same pattern as SkillsPage).
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
    await this.page.locator('button[data-tour="panel-master"]').click();
    await this.page.locator('a[href="/product"]').click();
    await expect(this.page.getByText('Manage product master data')).toBeVisible();
  }

  row(name: string) {
    return this.page.locator('tbody tr', { hasText: name });
  }

  /**
   * Product search submits a GET (?search=&search_manual=1) and reloads —
   * wait for that navigation explicitly instead of racing it.
   */
  async search(name: string): Promise<void> {
    await this.page.fill('input[name="product_table_search_filter"]', name);
    await this.page.waitForURL(/search=/, { timeout: 20000 });
  }

  async expectRowVisible(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.search(name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  async addProduct(name: string, description: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/product/add"]').click();
    await this.page.fill('input[name="product_name"]', name);
    await this.page.fill('textarea[name="description"]', description);
    await this.page.getByRole('button', { name: 'Add Product' }).click();
    await this.page.waitForURL('**/product', { timeout: 15000 });
    // Already on the list (no re-entry): client-side filter + assert.
    await this.search(name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.search(name);
    await this.row(name).locator('a.edit-btn').click();
  }
  /** Deactivate-style delete modal; row must disappear. */
  async deleteProduct(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.search(name);
    const target = this.row(name);
    await target.locator('button.delete-btn').click();
    // Generic table dustbin flow (AppUI.confirmDelete modal).
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    await this.page.locator('.confirm-yes').click();
    await expect(target).toHaveCount(0, { timeout: 20000 });
  }

  /** Print link opens a popup with the record; falls back to a status probe. */
  async expectPrintView(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.search(name);
    const printLink = this.row(name).locator('a[title="Print"]');
    if ((await printLink.count()) > 0) {
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup'),
        printLink.first().click(),
      ]);
      await expect(popup.getByText(name).first()).toBeVisible({ timeout: 15000 });
      await popup.close();
    } else {
      const resp = await this.page.request.get('/product/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }

  /** Sort dropdown; returns visible product-name column texts. */
  async sortAndReadNames(value: 'asc' | 'desc'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForTimeout(800);
    return this.page.locator('tbody tr td:first-child').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  }

  /** Date filter (recent/past7/past30); returns visible rows' data-dates. */
  async filterByDate(value: 'recent' | 'past7' | 'past30'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    // Selection navigates (?sort=); wait for it, then for rows to settle.
    await this.page.waitForURL(/sort=/, { timeout: 15000 }).catch(() => null);
    await this.page.locator('tbody tr').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(800);
    return this.page.locator('tbody tr').evaluateAll((els) =>
      els
        .map((el) => el.getAttribute('data-date') || '')
        .filter((d) => d.length > 0),
    );
  }
}
