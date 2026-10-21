import { expect, type Page } from '@playwright/test';

export class StoreLocationPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Store Location. */
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
    await this.page.locator('a[href="/store-location"]').click();
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

  async addLocation(name: string, description: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/store-location/add"]').click();
    await this.page.fill('input[name="store_location_name"]', name);
    await this.page.fill('textarea[name="description"]', description);
    await this.page.getByRole('button', { name: 'Add Store Location' }).click();
    await this.page.waitForURL('**/store-location', { timeout: 15000 });
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
  async deleteLocation(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const target = this.row(name);
    await target.locator('button.delete-btn').click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    // noWaitAfter: the confirm fires fetch+reload; awaiting that navigation
    // inside click() repeatedly dies on loaded machines. The row-gone assert
    // below is the real proof (auto-retried, race-free).
    await this.page.locator('.confirm-yes').click({ noWaitAfter: true });
    await expect(target).toHaveCount(0, { timeout: 25000 });
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
}
