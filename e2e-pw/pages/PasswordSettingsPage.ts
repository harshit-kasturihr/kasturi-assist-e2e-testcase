import { expect, type Page } from '@playwright/test';

/** Home → Settings → security panel: change-password OTP request step. */
export class PasswordSettingsPage {
  constructor(private page: Page) {}

  async gotoSecurity(): Promise<void> {
    await this.page.goto('/home?tab=settings');
    await this.page.locator('[data-settings-section="security"]').click();
    await expect(this.page.locator('#password-settings-form')).toBeVisible();
  }

  /** Wrong current password must be rejected before any OTP is sent. */
  async requestOtpExpectError(currentPassword: string): Promise<void> {
    await this.gotoSecurity();
    await this.page.fill('#current-password-setting', currentPassword);
    await this.page.locator('#password-send-otp-btn').click();
    await expect(this.page.locator('#password-settings-message')).toHaveClass(
      /is-error/,
    );
  }
}
