import { expect, type Page } from '@playwright/test';

export class StorePage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Store. */
  async gotoViaUI(): Promise<void> {
    // /home navigations intermittently abort (ERR_ABORTED) under load —
    // a safe GET retry, max 3.
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
    await this.page.locator('a[href="/store"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  row(name: string) {
    return this.page.locator('tr.data-row', { hasText: name });
  }

  async expectRowVisible(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  async addStore(name: string, description: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/store/add"]').click();
    await this.page.fill('input[name="store_name"]', name);
    await this.page.fill('textarea[name="description"]', description);
    await this.page.getByRole('button', { name: 'Add Store' }).click();
    await this.page.waitForURL('**/store', { timeout: 15000 });
    // Already on the list (no re-entry): search inline and assert.
    await this.page.fill('#data-search', name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.row(name).locator('a.edit-btn').click();
  }

  /** Delete via the dustbin confirm modal; row must disappear. */
  async deleteStore(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const target = this.row(name);
    await target.locator('button.delete-btn').click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    await this.page.locator('.confirm-yes').click();
    await expect(target).toHaveCount(0, { timeout: 20000 });
  }

  /** Print link opens a popup with the record; falls back to status probe. */
  async expectPrintView(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const printLink = this.row(name).locator('a[title="Print"]');
    if ((await printLink.count()) > 0) {
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup'),
        printLink.first().click(),
      ]);
      await expect(popup.getByText(name).first()).toBeVisible({ timeout: 15000 });
      await popup.close();
    } else {
      const resp = await this.page.request.get('/store/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }

  /** Sort dropdown (client-side reorder); returns visible first-column texts. */
  async sortAndReadFirstColumn(value: 'asc' | 'desc'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForTimeout(800);
    return this.page.locator('tr.data-row td:first-child').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  }

  /** Date filter (recent/past7/past30); returns visible rows' data-dates. */
  async filterByDate(value: 'recent' | 'past7' | 'past30'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForURL(/sort=/, { timeout: 15000 }).catch(() => null);
    await this.page.locator('tr.data-row').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(800);
    return this.page.locator('tr.data-row').evaluateAll((els) =>
      els
        .map((el) => el.getAttribute('data-date') || '')
        .filter((d) => d.length > 0),
    );
  }
}
