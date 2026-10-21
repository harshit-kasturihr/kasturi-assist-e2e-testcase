import { expect, type Page } from '@playwright/test';
import type { NewClient } from '../utils/testData';

export class ClientPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Client. */
  async gotoViaUI(): Promise<void> {
    await this.page.goto('/home');
    await this.page.locator('button[data-tour="panel-master"]').click();
    await this.page.locator('a[href$="/client"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  row(name: string) {
    return this.page.locator('tr.data-row', { hasText: name });
  }

  /**
   * List rows are cached server-side for 60s, so a just-created row may be
   * invisible for up to a minute. Poll with reloads (honest wait, not a
   * fixed sleep) before concluding absence.
   */
  async expectRowVisible(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const row = this.row(name).first();
    const deadline = Date.now() + 75000;
    for (;;) {
      if ((await row.count()) > 0) {
        await expect(row).toBeVisible();
        return;
      }
      if (Date.now() > deadline) break;
      await this.page.waitForTimeout(5000);
      await this.page.reload();
    }
    await expect(row).toBeVisible();
  }

  async addClient(data: NewClient): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/client/add"]').click();
    await this.page.fill('input[name="company_name"]', data.companyName);
    await this.page.fill('input[name="custom_code"]', data.code);
    await this.page.fill('input[name="address"]', data.address);
    await this.page.fill('input[name="pin"]', data.pin);
    await this.page.fill('input[name="contact_person"]', data.contactPerson);
    await this.page.fill('input[name="contact_email"]', data.contactEmail);
    await this.page.fill('input[name="contact_phone"]', data.contactPhone);
    await this.page.getByRole('button', { name: 'Save' }).click();
    await this.page.waitForURL('**/client', { timeout: 15000 });
    // Already on the list (no re-entry): search inline and assert.
    await this.page.fill('#data-search', data.companyName);
    await expect(this.row(data.companyName).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.row(name).locator('a.edit-btn').click();
  }

  /**
   * Submit expecting rejection. Client form shows no inline server errors,
   * so acceptance == redirect to /client list; anything else (staying with
   * browser validation or an error box) counts as rejected.
   */
  async submitExpectReject(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save' }).click();
    const outcome = await Promise.race([
      this.page
        .waitForURL('**/client', { timeout: 12000 })
        .then(() => 'accepted'),
      this.page
        .locator('.alert-error')
        .waitFor({ state: 'visible', timeout: 12000 })
        .then(() => 'rejected')
        .catch(() => 'stayed'),
    ]);
    if (outcome === 'accepted') {
      throw new Error('NOT-ENFORCED: invalid client data was accepted');
    }
  }

  /** Delete a row via the dustbin confirm modal; row must disappear. */
  async deleteClient(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const target = this.row(name);
    await target.locator('button.delete-btn').click();
    await this.page.locator('.confirm-yes').click();
    // No URL wait: local reload can beat the waiter (race). The row
    // disappearing IS the proof (auto-retried, race-free).
    await expect(target).toHaveCount(0, { timeout: 20000 });
  }

  /** Add a location to a client; success shows the location back in list. */
  async addLocation(clientName: string, address: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', clientName);
    await this.row(clientName).locator('a[title="Add Location"]').click();
    await this.page.fill('input[name="address"]', address);
    await this.page.getByRole('button', { name: 'Save Location' }).click();
    await expect(
      this.page.getByText(address, { exact: false }).first(),
    ).toBeVisible({ timeout: 15000 });
  }

  /** Print view opens in a popup with Company Details. */
  async expectPrintView(clientName: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', clientName);
    const [popup] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.row(clientName).locator('a[title="Print"]').click(),
    ]);
    await expect(popup.getByText('Company Details')).toBeVisible();
    await expect(popup.getByText(clientName).first()).toBeVisible();
    await popup.close();
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
    // Selection navigates (?sort=); wait for it, then for rows to settle.
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
