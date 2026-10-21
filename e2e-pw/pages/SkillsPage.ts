import { expect, type Page } from '@playwright/test';

export class SkillsPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Skills. */
  async gotoViaUI(): Promise<void> {
    // /home navigations intermittently abort (ERR_ABORTED) under load when
    // a previous page is still settling — a safe GET retry, max 3.
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
    await this.page.locator('a[href$="/skills"]').click();
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

  async addSkill(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/skills/add"]').click();
    await this.page.fill('input[name="name"]', name);
    await this.page.getByRole('button', { name: 'Add Skill' }).click();
    await this.page.waitForURL('**/skills?created=1', { timeout: 15000 });
    await this.expectRowVisible(name);
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.row(name).locator('a.edit-btn').click();
  }

  /** Delete via the dustbin confirm modal; row must disappear. */
  async deleteSkill(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const target = this.row(name);
    await target.locator('button.delete-btn').click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    await this.page.locator('.confirm-yes').click();
    await expect(target).toHaveCount(0, { timeout: 20000 });
  }

  /** Sort dropdown (client-side reorder); returns visible name column. */
  async sortAndReadNames(value: 'asc' | 'desc'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForTimeout(800);
    return this.page.locator('tr.data-row td:nth-child(2)').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  }

  /** Upload page (toolbar Upload Excel link). */
  async gotoUpload(): Promise<void> {
    await this.gotoViaUI();
    await this.page.getByRole('link', { name: 'Upload Excel' }).click();
  }
}
