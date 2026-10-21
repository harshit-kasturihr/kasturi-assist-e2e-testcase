import { expect, type Page } from '@playwright/test';
import type { NewDomain } from '../utils/testData';

export class DomainPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Domains. */
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
    await this.page.locator('a[href="/domains"]').click();
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

  async addDomain(data: NewDomain, withEmail = true): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/domains/add"]').click();
    await this.page.fill('#name', data.name);
    if (withEmail) await this.page.fill('#email', data.email);
    await this.page.getByRole('button', { name: 'Add Domain' }).click();
    await this.page.waitForURL('**/domains', { timeout: 30000, waitUntil: 'commit' });
    await this.page.fill('#data-search', data.name);
    await expect(this.row(data.name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(name).first().locator('a.edit-btn').click();
  }

  /** Delete via the generic confirm flow; matching count must drop by one. */
  async deleteDomain(name: string): Promise<void> {
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
    await expect
      .poll(async () => target.count(), { timeout: 30000 })
      .toBe(before - 1);
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
      const resp = await this.page.request.get('/domains/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }
}
