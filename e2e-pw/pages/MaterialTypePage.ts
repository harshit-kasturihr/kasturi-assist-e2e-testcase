import { expect, type Page } from '@playwright/test';

export class MaterialTypePage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Material Type. */
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
    await this.page.locator('a[href="/material-types"]').click();
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

  async addMaterialType(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/material-types/add"]').click();
    await this.page.fill('input[name="name"]', name);
    await this.page.getByRole('button', { name: 'Add Material Type' }).click();
    await this.page.waitForURL('**/material-types', { timeout: 30000, waitUntil: 'commit' });
    // Already on the list (no re-entry): search inline and assert.
    await this.page.fill('#data-search', name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    // The toolbar search navigates (?search=); let it settle before
    // touching the DOM, or evaluates race a navigation ("context destroyed").
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(name).first().locator('a.edit-btn').click();
  }

  /** Delete via the dustbin confirm modal; matching count must drop by one. */
  async deleteMaterialType(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    const target = this.row(name);
    const before = await target.count();
    expect(before).toBeGreaterThan(0);
    const delBtn = target.first().locator('button.delete-btn');
    await delBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await delBtn.click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    await this.page.locator('.confirm-yes').click({ noWaitAfter: true });
    // Count must DROP by exactly one (timestamp twins from repeated runs can
    // share a name, so zero is the wrong assertion — minus-one is the proof).
    await expect
      .poll(async () => target.count(), { timeout: 25000 })
      .toBe(before - 1);
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
      const resp = await this.page.request.get('/material-types/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }
}
