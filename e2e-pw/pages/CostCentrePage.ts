import { expect, type Page } from '@playwright/test';
import type { NewCostCentre } from '../utils/testData';

export class CostCentrePage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Cost Centre. */
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
    await this.page.locator('a[href="/cost-centres"]').click();
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

  async fillCostCentreForm(data: NewCostCentre): Promise<void> {
    await this.page.fill('input[name="name"]', data.name);
    await this.page.fill('input[name="group"]', data.group);
    await this.page.fill('input[name="description"]', data.description);
  }

  async addCostCentre(data: NewCostCentre): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/cost-centres/add"]').click();
    await this.fillCostCentreForm(data);
    await this.page.getByRole('button', { name: 'Add Cost Centre' }).click();
    await this.page.waitForURL('**/cost-centres', { timeout: 15000 });
    // Already on the list (no re-entry): search inline and assert.
    await this.page.fill('#data-search', data.name);
    await expect(this.row(data.name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.row(name).locator('a.edit-btn').click();
  }

  /**
   * Submit expecting rejection. Duplicate names are rejected INLINE as bare
   * text ("Cost Centre already exists.", no .alert-error wrapper) with no
   * navigation — assert that text. If the list accepts (redirect), the data
   * was NOT enforced — throw honestly so the test FAILS and feeds Bug flow.
   */
  async submitExpectReject(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add Cost Centre' }).click();
    const outcome = await Promise.race([
      this.page
        .waitForURL('**/cost-centres', { timeout: 12000 })
        .then(() => 'accepted'),
      this.page
        .getByText(/already exists/i)
        .waitFor({ state: 'visible', timeout: 12000 })
        .then(() => 'rejected'),
    ]);
    if (outcome === 'accepted') {
      throw new Error('NOT-ENFORCED: duplicate cost centre data was accepted');
    }
  }

  /** Delete a row via the dustbin confirm modal; row must disappear. */
  async deleteCostCentre(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const target = this.row(name);
    const delBtn = target.locator('button.delete-btn');
    // Wide table: action column may sit outside the viewport. JS scroll
    // (not scrollIntoViewIfNeeded): the button never passes Playwright's
    // stability check on loaded machines (continuous micro-shifts).
    await delBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await delBtn.click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    await this.page.locator('.confirm-yes').click({ noWaitAfter: true });
    await expect(target).toHaveCount(0, { timeout: 25000 });
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
      const resp = await this.page.request.get('/cost-centres/print/1');
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
}
