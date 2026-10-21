import { expect, type Page } from '@playwright/test';
import { PurchaseOrderPage } from './PurchaseOrderPage';
import { PurchaseRequisitionPage } from './PurchaseRequisitionPage';

export class GRNPage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Inventory → GRN (the form). */
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
    await this.page.locator('a[href="/grn"]').click();
    await expect(this.page.locator('#grn_vendor')).toBeVisible({ timeout: 20000 });
  }

  /** The GRN listing page. */
  async gotoList(): Promise<void> {
    await this.page.goto('/grn/list');
    await this.page.waitForTimeout(2000);
  }

  row(key: string) {
    return this.page.locator('tr', { hasText: key });
  }

  /**
   * Standing rule: a GRN needs a Vendor and a pending PO (which needs a
   * PR, which needs a Product). Returns vendor name + PO number.
   */
  async ensureVendorAndPO(): Promise<{ vendor: string; poNo: string }> {
    const po = new PurchaseOrderPage(this.page);
    const pr = new PurchaseRequisitionPage(this.page);
    const product = await pr.ensureProduct();
    const dept = `QA Dept GRN ${Date.now().toString().slice(-5)}`;
    await pr.addRequisition(product, dept);
    const vendor = await po.ensureVendor();
    const poNo = await po.addPurchaseOrder(vendor);
    return { vendor, poNo };
  }

  /** Select vendor, then pick the first pending PO; returns PO value. */
  async selectVendorAndPO(vendorName: string): Promise<string> {
    // Vendor options may populate asynchronously — wait for them first.
    await this.page.waitForFunction(
      () => ((document.getElementById('grn_vendor') as HTMLSelectElement | null)?.options.length || 0) > 1,
      { timeout: 20000 },
    );
    // Vendor options carry ids; match by visible name.
    const vendorId: string = await this.page.evaluate((nm: string) => {
      const sel = document.getElementById('grn_vendor') as HTMLSelectElement | null;
      if (!sel) return '';
      const opt = Array.from(sel.options).find((o) => (o.textContent || '').trim() === nm);
      return opt ? opt.value : '';
    }, vendorName);
    expect(vendorId).toBeTruthy();
    await this.page.selectOption('#grn_vendor', vendorId);
    const poSel = this.page.locator('#grn_po_no');
    await expect(poSel).toBeEnabled({ timeout: 20000 });
    await this.page.waitForTimeout(2000);
    const poCount = await this.page.locator('#grn_po_no option').count();
    expect(poCount).toBeGreaterThan(1);
    await this.page.selectOption('#grn_po_no', { index: 1 });
    await this.page.waitForTimeout(2000);
    return this.page.inputValue('#grn_po_no');
  }

  /** Fill received qty on all item rows + store picks, then save. */
  async receiveAll(storePick = true): Promise<void> {
    const qtyInputs = this.page.locator('input[data-qty-index]');
    await expect(qtyInputs.first()).toBeVisible({ timeout: 20000 });
    const n = await qtyInputs.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await qtyInputs.nth(i).fill('2');
    }
    if (storePick) {
      for (const sel of ['#grn_store', '#grn_cost_centre', '#grn_store_location']) {
        const el = this.page.locator(sel);
        if ((await el.count()) > 0) {
          // First non-empty option (index 1 is often another placeholder).
          const val: string = await el.evaluate((s: HTMLSelectElement) => {
            const opt = Array.from(s.options).find((o) => o.value && o.value !== '0');
            return opt ? opt.value : '';
          });
          if (val) await el.selectOption(val);
        }
      }
    }
    // First GRN ever: GRN No. is an empty editable box (later auto-filled).
    const grnNo = this.page.locator('#grn_no');
    if ((await grnNo.count()) > 0 && !((await grnNo.inputValue()).trim())) {
      const readonly = await grnNo.evaluate((el) => (el as HTMLInputElement).readOnly);
      if (!readonly) await grnNo.fill('1001');
    }
    const saveBtn = this.page.locator('#grn-save-placeholder, button:has-text("Save GRN")').first();
    await saveBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    const respP = this.page.waitForResponse(
      (r) => r.url().includes('/api/grn/save') && r.request().method() === 'POST',
      { timeout: 30000 },
    );
    await saveBtn.click();
    const resp = await respP;
    const body = await resp.json().catch(() => ({}));
    expect(resp.ok() && body.status === 'success', `GRN save failed: ${JSON.stringify(body).slice(0, 200)}`).toBe(true);
    await this.page.waitForURL('**/grn/list', { timeout: 30000 });
  }
}
