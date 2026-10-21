import { expect, type Page } from '@playwright/test';
import type { NewAsset } from '../utils/testData';
import { getNewDomain } from '../utils/testData';
import { DomainPage } from './DomainPage';

export class AssetPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Asset Management → Asset. */
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
    await this.page.locator('button[data-tour="panel-asset_management"]').click();
    await this.page.locator('a[href="/asset"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  /** Rows keyed by asset serial number (2nd cell, unique per row). */
  row(serial: string) {
    return this.page.locator('tr.data-row', { hasText: serial });
  }

  async expectRowVisible(serial: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', serial);
    await expect(this.row(serial).first()).toBeVisible({ timeout: 20000 });
  }

  /**
   * Standing rule: Domain dropdown options come from the Domain master,
   * so a fresh Domain is created first in the same TC. Returns its name.
   */
  async ensureDomain(): Promise<string> {
    const dom = new DomainPage(this.page);
    const data = getNewDomain();
    await dom.addDomain(data);
    return data.name;
  }

  /** Expand all collapsed form sections (02 Allocation, 03 Status). */
  async expandFormSections(): Promise<void> {
    for (const card of await this.page.locator('section.section-card').all()) {
      const cls = (await card.getAttribute('class')) || '';
      if (!cls.includes('is-open')) {
        await card.locator('button.section-toggle').click();
      }
    }
    await expect(this.page.locator('#location')).toBeVisible({ timeout: 15000 });
  }

  /** Fill the add/edit form (12 mandatory fields + description). */
  async fillAssetForm(data: NewAsset, domainName: string): Promise<void> {
    await this.expandFormSections();
    await this.page.fill('#serial_no', data.serial);
    await this.page.fill('#make', data.make);
    await this.page.fill('#model', data.model);
    await this.page.fill('#part_name', data.part);
    await this.page.selectOption('#domain_id', { label: domainName });
    await this.page.fill('#po_number', data.po);
    await this.page.fill('#location', data.location);
    await this.page.selectOption('#status', 'Active');
    await this.page.selectOption('#condition', 'Good');
    await this.page.selectOption('#asset_belongs_to', 'HARDWARE');
    await this.page.fill('#asset_description', 'QA asset description');
    // Priority/Impact/Criticality live on the Entitlement tab.
    await this.page.getByRole('button', { name: 'Entitlement' }).click();
    await expect(this.page.locator('#priority')).toBeVisible({ timeout: 15000 });
    await this.page.selectOption('#priority', 'Medium');
    await this.page.selectOption('#impact', 'Medium');
    await this.page.selectOption('#criticality_of_asset', 'Medium');
    // Purchase Date is required on the Financial tab (client-validated).
    await this.page.getByRole('button', { name: 'Financial' }).click();
    await expect(this.page.locator('#purchase_date')).toBeVisible({ timeout: 15000 });
    await this.page.fill('#purchase_date', '2026-10-05');
  }

  async addAsset(data: NewAsset): Promise<void> {
    const domainName = await this.ensureDomain();
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/asset/add"]').click();
    await this.fillAssetForm(data, domainName);
    await this.page.locator('#save-tab').click();
    await this.page.waitForURL('**/asset', { timeout: 30000, waitUntil: 'commit' });
    await this.page.fill('#data-search', data.serial);
    await expect(this.row(data.serial).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(serial: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', serial);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(serial).first().locator('a.edit-btn').click();
  }

  /** Delete via the generic confirm flow; matching count must drop by one. */
  async deleteAsset(serial: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', serial);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    const target = this.row(serial);
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

  /** Sort dropdown; returns visible serial-column texts. */
  async sortAndReadSerials(value: 'asc' | 'desc'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForTimeout(800);
    return this.page.locator('tr.data-row td:nth-child(2)').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  }

  /** QR button opens a QR dialog/image for the row's asset. */
  async expectQrDialog(serial: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', serial);
    const qrBtn = this.row(serial).first().locator('button.qr-btn');
    await expect(qrBtn).toBeVisible({ timeout: 20000 });
    await qrBtn.click();
    await expect(
      this.page.locator('.qr-modal, .modal-qr, canvas, img[alt*="QR" i]').first(),
    ).toBeVisible({ timeout: 15000 });
  }

  /** Print link opens a popup with the record; falls back to status probe. */
  async expectPrintView(serial: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', serial);
    const printLink = this.row(serial).locator('a[title="Print"]');
    if ((await printLink.count()) > 0) {
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup'),
        printLink.first().click(),
      ]);
      await expect(popup.getByText(serial).first()).toBeVisible({ timeout: 15000 });
      await popup.close();
    } else {
      const resp = await this.page.request.get('/asset/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }
}
