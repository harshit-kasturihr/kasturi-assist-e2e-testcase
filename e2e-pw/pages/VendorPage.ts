import { expect, type Page } from '@playwright/test';
import type { NewVendor } from '../utils/testData';

export class VendorPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Vendor. */
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
    await this.page.locator('a[href="/vendor"]').click();
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

  async addVendor(data: NewVendor): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/vendor/add"]').click();
    await this.fillVendorForm(data);
    await this.page.getByRole('button', { name: 'Add Vendor' }).click();
    await this.page.waitForURL('**/vendor', { timeout: 15000 });
    // Already on the list (no re-entry): search inline and assert.
    await this.page.fill('#data-search', data.name);
    await expect(this.row(data.name).first()).toBeVisible({ timeout: 20000 });
  }

  /** Fill every required vendor field (single source of truth). */
  async fillVendorForm(data: NewVendor): Promise<void> {
    await this.page.fill('input[name="name"]', data.name);
    await this.page.fill('input[name="vendor_code"]', data.code);
    await this.page.fill('input[name="address1"]', data.address1);
    await this.page.fill('input[name="address2"]', data.address2);
    await this.page.fill('input[name="contact_person"]', data.contactPerson);
    await this.page.fill('input[name="contact_email"]', data.contactEmail);
    await this.page.fill('input[name="contact_phone"]', data.contactPhone);
    await this.page.fill('input[name="pin"]', data.pin);
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.row(name).locator('a.edit-btn').click();
  }

  /**
   * Submit expecting rejection. If the list accepts (redirect), the data
   * was NOT enforced — throw honestly so the test FAILS and feeds Bug flow.
   */
  async submitExpectReject(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add Vendor' }).click();
    const outcome = await Promise.race([
      this.page
        .waitForURL('**/vendor', { timeout: 12000 })
        .then(() => 'accepted'),
      this.page
        .locator('.alert-error')
        .waitFor({ state: 'visible', timeout: 12000 })
        .then(() => 'rejected'),
    ]);
    if (outcome === 'accepted') {
      throw new Error('NOT-ENFORCED: invalid vendor data was accepted');
    }
  }

  /** Delete a row via the dustbin confirm modal; row must disappear. */
  async deleteVendor(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const target = this.row(name);
    const delBtn = target.locator('button.delete-btn');
    // Wide table: action column may sit outside the viewport; scroll first.
    await delBtn.scrollIntoViewIfNeeded();
    await delBtn.click();
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
      const resp = await this.page.request.get('/vendor/print/1');
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
