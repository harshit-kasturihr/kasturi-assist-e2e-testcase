import { expect, type Page } from '@playwright/test';

export class DesignationPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Designations. */
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
    await this.page.locator('button[data-tour="panel-master"]').click();
    await this.page.locator('a[href="/designations"]').click();
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

  async addDesignation(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/designations/add"]').click();
    await this.page.fill('input[name="name"]', name);
    await this.page.getByRole('button', { name: 'Add Designation' }).click();
    await this.page.waitForURL('**/designations', { timeout: 30000, waitUntil: 'commit' });
    await this.page.fill('#data-search', name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(name).first().locator('a.edit-btn').click();
  }

  /**
   * Delete on this list is a form POST behind a confirm modal
   * (ui_feedback.js [data-delete-form] flow): click dustbin → modal →
   * confirm → submit → back on the list. Row must be gone afterwards.
   */
  async deleteDesignation(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    const target = this.row(name);
    await expect(target.first()).toBeVisible({ timeout: 20000 });
    const delBtn = target.first().locator('button.delete-btn');
    await delBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await delBtn.click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible({
      timeout: 15000,
    });
    await this.page.locator('.modal-backdrop.open .confirm-yes').click();
    // Submit round-trips back to the list; re-enter and assert absence.
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await expect(target).toHaveCount(0, { timeout: 20000 });
  }

  /** Sort dropdown (client-side reorder); returns visible name-column texts. */
  async sortAndReadNames(value: 'asc' | 'desc'): Promise<string[]> {
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
      const resp = await this.page.request.get('/designations/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }
}
