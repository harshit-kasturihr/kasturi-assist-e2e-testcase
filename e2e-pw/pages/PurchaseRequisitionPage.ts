import { expect, type Page } from '@playwright/test';

export class PurchaseRequisitionPage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Inventory → Purchase Requisition
   * (lands on the form) → View Listing link → the list page. */
  async gotoViaUI(): Promise<void> {
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
    await this.page.locator('a[href="/purchase-requisition"]').click();
    await this.page.getByRole('link', { name: 'View Listing' }).click();
    await expect(this.page.locator('input[name="search"]').first()).toBeVisible({ timeout: 20000 });
  }

  row(key: string) {
    return this.page.locator('tr', { hasText: key }).filter({ hasNotText: 'S.No.' });
  }

  /**
   * Standing rule: PR items reference master products — a fresh Product
   * is created first in the same TC. Returns its name.
   */
  async ensureProduct(): Promise<string> {
    const name = `QA Prd ${Date.now().toString().slice(-6)}`;
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
    await this.page.locator('a[href="/product"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
    await this.page.locator('a.btn-add[href$="/product/add"]').click();
    await this.page.fill('#product_name', name);
    await this.page.getByRole('button', { name: 'Add Product' }).click();
    await this.page.waitForURL('**/product', { timeout: 30000, waitUntil: 'commit' });
    return name;
  }

  /** Add a table row and pick a product via autocomplete; set quantity. */
  async addItemRow(productName: string, qty = '5'): Promise<void> {
    // A blank row exists by default — only add one when the grid is empty.
    if ((await this.page.locator('tr.pr-item-row').count()) === 0) {
      await this.page.locator('#add_item_row').click();
    }
    const row = this.page.locator('tr.pr-item-row').first();
    // The suggestion click MUST win a 180ms race: input blur schedules
    // menu removal, so a slow Playwright click lands on nothing. A sync
    // DOM click fires the handler deterministically.
    let hidden = '';
    for (let attempt = 0; attempt < 3 && !hidden; attempt++) {
      await row.locator('.item-search').fill(productName);
      const opt = row.locator('.item-menu > *').first();
      await expect(opt).toBeVisible({ timeout: 15000 });
      await opt.evaluate((el: HTMLElement) => el.click());
      await this.page.waitForTimeout(1000);
      hidden = await row.locator('.item-id').inputValue();
    }
    expect(hidden).toBeTruthy();
    await row.locator('.quantity').fill(qty);
  }

  /** Full create: dept + one product row + remark + submit; returns PR no.
   * NOTE: success redirects back to the FORM (?saved_mreq_no=...), not the
   * list — the PR number comes from the URL, then the list is searched. */
  async addRequisition(productName: string, dept = 'QA Dept'): Promise<string> {
    await this.gotoViaUI();
    await this.page.getByRole('link', { name: 'New Requisition' }).click();
    await this.addItemRow(productName);
    await this.page.fill('#dept', dept);
    await this.page.fill('#remark', 'QA remark');
    const submit = this.page.locator('button.pr-submit-btn');
    await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await submit.click();
    // Success toast carries the PR number ("... PR No: 9"). The URL flags
    // (?saved_mreq_no=) are stripped by ui_feedback.js within ~a second,
    // so the toast text — not the URL — is the reliable source.
    let mreqNo = '';
    for (let i = 0; i < 20 && !mreqNo; i++) {
      const toast = await this.page.evaluate(() => {
        const els = document.querySelectorAll('.toast.show, .toast, [data-toast-message]');
        for (const el of els) {
          const t = (el.textContent || '').trim();
          if (/PR No\s*:/i.test(t)) return t;
        }
        return '';
      }).catch(() => '');
      const m = toast.match(/PR No\s*:?\s*(\d+)/i);
      if (m) mreqNo = m[1];
      else await this.page.waitForTimeout(500);
    }
    // Fallback: URL flag (usually already stripped, but harmless to try).
    if (!mreqNo) {
      mreqNo = new URL(this.page.url()).searchParams.get('saved_mreq_no') || '';
    }
    expect(mreqNo).toBeTruthy();
    // Now verify on the list.
    await this.gotoViaUI();
    await this.page.locator('input[name="search"]').first().fill(mreqNo);
    await this.page.waitForTimeout(2000);
    await expect(this.row(mreqNo).first()).toBeVisible({ timeout: 20000 });
    return mreqNo;
  }
}
