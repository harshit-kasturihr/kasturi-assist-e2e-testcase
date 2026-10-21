import { expect, type Page } from '@playwright/test';
import { ROUTES } from '../constants/routes';

export class CompanyPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.companyTab);
  }

  async expectTabLoaded(): Promise<void> {
    await expect(this.page.locator('#company-tab')).toBeVisible();
  }

  /** Enable edit mode via the Edit button. */
  async startEdit(): Promise<void> {
    await this.goto();
    await this.page.locator('#company-edit-btn').click();
  }

  async saveExpectUpdated(): Promise<void> {
    await this.page.locator('#company-save-btn').click();
    await this.page.waitForURL('**/home?tab=company&updated=1');
  }

  async saveExpectError(): Promise<void> {
    await this.page.locator('#company-save-btn').click();
    await this.page.waitForURL('**/home?tab=company&company_update_error=1');
  }

  /**
   * The company email input is type=email: the BROWSER blocks submit
   * natively (bubble "Please include an '@'..."), so no request is sent.
   * Assert the block instead of waiting for a server redirect that never comes.
   */
  async expectBrowserBlocksInvalidEmail(email: string, gst: string): Promise<void> {
    await this.startEdit();
    await this.page.fill('input[name="email"]', email);
    await this.page.fill('input[name="gst"]', gst);
    await this.page.locator('#company-save-btn').click();
    const msg: string | null = await this.page.evaluate(() => {
      const input = document.querySelector(
        'input[name="email"]',
      ) as HTMLInputElement | null;
      return input ? input.validationMessage : null;
    });
    expect(msg).toBeTruthy();
    await expect(this.page).toHaveURL(/tab=company/);
  }
}
