import { expect, type Page } from '@playwright/test';

export class PurchaseOrderPage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Inventory → PO Outgoing (the form). */
  async gotoFormViaUI(): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/home', { timeout: 30000, waitUntil: 'domcontentloaded' });
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        await this.page.waitForTimeout(1000);
      }
    }
    if (lastError) throw lastError;
    await this.page.locator('button[data-tour="panel-inventory"]').click();
    await this.page.locator('a[href="/purchase-order"]').click();
    await expect(this.page.locator('#po_supplier')).toBeVisible({ timeout: 20000 });
  }

  /** The listing page (redirect target after save). */
  async gotoList(): Promise<void> {
    await this.gotoFormViaUI();
    // The form page links back to the listing.
    const listLink = this.page.locator('a[href="/purchase-order/list"]');
    if ((await listLink.count()) > 0) {
      await listLink.first().click();
    } else {
      await this.page.goto('/purchase-order/list');
    }
    await this.page.waitForTimeout(2000);
  }

  row(key: string) {
    return this.page.locator('tr', { hasText: key });
  }

  /**
   * Standing rule: PO needs a Vendor and a pending indent item (which
   * needs a Product). Vendor is created here; the indent item comes from
   * a PR created via PurchaseRequisitionPage. Returns vendor name.
   */
  async ensureVendor(): Promise<string> {
    const name = `QA VND PO ${Date.now().toString().slice(-6)}`;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/home', { timeout: 30000, waitUntil: 'domcontentloaded' });
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
    await this.page.locator('#data-search').waitFor({ timeout: 15000 });
    await this.page.locator('a.btn-add[href$="/vendor/add"]').click();
    // NOTE: VendorCode column is short — keep the code <= 10 chars.
    const code = `QV${Date.now().toString().slice(-6)}`;
    await this.page.fill('#name', name);
    await this.page.fill('#vendor_code', code);
    await this.page.fill('#address1', 'Plot 1');
    await this.page.fill('#address2', 'Street 2');
    await this.page.fill('#contact_person', 'QA');
    await this.page.fill('#contact_email', 'qa.vnd@example.com');
    await this.page.fill('#contact_phone', '9000000001');
    await this.page.fill('#pin', '110');
    await this.page.waitForTimeout(2500);
    // The pin widget is flaky: only submit once city actually resolved,
    // otherwise the server rejects the vendor silently.
    let city = '';
    for (let i = 0; i < 5 && !city; i++) {
      if ((await this.page.locator('#pincode-dropdown > *').count()) > 0) {
        await this.page.locator('#pincode-dropdown > *').first().click().catch(() => null);
        await this.page.waitForTimeout(1000);
      }
      city = await this.page.inputValue('#city_name').catch(() => '');
      if (!city) await this.page.waitForTimeout(1500);
    }
    expect(city).toBeTruthy();
    await this.page.getByRole('button', { name: 'Add Vendor' }).click();
    await this.page.waitForURL('**/vendor', { timeout: 30000, waitUntil: 'commit' });
    return name;
  }

  /** Open the Pending Indent picker and Use the first available row. */
  async useFirstIndent(): Promise<string> {
    await this.page.locator('#po-pending-indent-trigger').click();
    const useBtn = this.page.locator('button.po-picker-action').first();
    await expect(useBtn).toBeVisible({ timeout: 20000 });
    // PR number of the picked row for later assertions.
    const rowText = (await useBtn.locator('xpath=ancestor::tr[1]').textContent()) || '';
    await useBtn.click();
    await this.page.waitForTimeout(1500);
    // "Use" stages only the item name — complete the line (qty + types)
    // then push it into the PO Items grid via Add Item.
    await this.page.fill('#po_qty', '5');
    const matType = this.page.locator('#po_material_type option');
    const matCount = await matType.count();
    if (matCount > 1) {
      const matVal = await matType.nth(1).getAttribute('value');
      if (matVal) await this.page.selectOption('#po_material_type', matVal);
    }
    const poType = this.page.locator('#po_type option');
    if ((await poType.count()) > 1) {
      const typeVal = await poType.nth(1).getAttribute('value');
      if (typeVal) await this.page.selectOption('#po_type', typeVal);
    }
    await this.page.getByRole('button', { name: 'Add Item' }).click();
    await this.page.waitForTimeout(1500);
    const m = rowText.match(/PR[-\s]?\d+/i);
    return (m ? m[0] : rowText.slice(0, 20)).trim();
  }

  /** Full create: supplier + indent item + save; returns PO number. */
  async addPurchaseOrder(vendorName: string): Promise<string> {
    await this.gotoFormViaUI();
    await this.page.selectOption('#po_supplier', { label: vendorName });
    await this.useFirstIndent();
    const poNo = await this.page.inputValue('#po_number');
    const saveBtn = this.page.locator('#po-save-button');
    await saveBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await saveBtn.click();
    await this.page.waitForURL('**/purchase-order/list', { timeout: 30000 });
    await this.page.waitForTimeout(2000);
    return poNo;
  }
}
