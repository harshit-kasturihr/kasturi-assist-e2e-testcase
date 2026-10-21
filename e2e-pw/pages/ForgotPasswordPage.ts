import { expect, type Page } from '@playwright/test';
import { MESSAGES } from '../constants/messages';

export class ForgotPasswordPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/forgot-password');
    await expect(this.page.getByText(MESSAGES.resetTitle)).toBeVisible();
  }

  private message() {
    return this.page.locator('#forgot-password-message');
  }

  /** Step 1: request OTP. Ends on step 2 (Verify OTP). */
  async requestOtp(username: string): Promise<void> {
    await this.goto();
    await this.page.fill(
      '#forgot-password-request-form input[name="username"]',
      username,
    );
    await this.page
      .locator('#forgot-password-request-form button[type="submit"]')
      .click();
    await expect(
      this.page.locator('[data-reset-badge="2"].active'),
    ).toBeVisible();
  }

  /** Step 1, negative: request must fail with an error, stays on step 1. */
  async requestOtpExpectError(username: string): Promise<void> {
    await this.goto();
    await this.page.fill(
      '#forgot-password-request-form input[name="username"]',
      username,
    );
    await this.page
      .locator('#forgot-password-request-form button[type="submit"]')
      .click();
    await expect(this.message()).toHaveClass(/show.*error/);
  }

  /** Fill OTP + submit (fully automatic cases). */
  async verifyOtp(otp: string): Promise<void> {
    const submit = this.page.locator(
      '#forgot-password-verify-form button[type="submit"]',
    );
    // The form disables the button while a verify request is in flight AND a
    // global double-submit guard can hold it briefly. Never click into a
    // disabled button — that submit is swallowed and the attempt is lost.
    // BOTH conditions prove the previous cycle fully settled: enabled button
    // plus restored idle label (set in the same finally block).
    await expect(submit).toBeEnabled({ timeout: 25000 });
    await expect(submit).toHaveText('Verify OTP', { timeout: 25000 });
    await this.page.fill(
      '#forgot-password-verify-form input[name="otp"]',
      otp,
    );
    await submit.click();
  }

  /** Click Verify only — used after pauseForRealOtp when the user typed it. */
  async submitVerify(): Promise<void> {
    await this.page
      .locator('#forgot-password-verify-form button[type="submit"]')
      .click();
  }

  async expectVerifyError(part: string): Promise<void> {
    await expect(this.message()).toHaveClass(/show.*error/);
    await expect(this.message()).toContainText(part);
  }

  /** Step 3 reached = OTP accepted, reset allowed (we never submit new passwords). */
  async expectResetStep(): Promise<void> {
    await expect(
      this.page.locator('#forgot-password-complete-form.active'),
    ).toBeVisible();
  }

  /** Start Over must return the flow to a clean step 1. */
  async startOver(): Promise<void> {
    await this.page.locator('#forgot-password-restart').click();
    await expect(
      this.page.locator('#forgot-password-request-form.active'),
    ).toBeVisible();
  }

  /**
   * Headed pause: the user types the REAL 6-digit OTP from their mailbox
   * into the page's OTP field, then presses Resume in the inspector.
   * Be quick — OTP TTL is ~60 seconds from request.
   */
  async pauseForRealOtp(): Promise<void> {
    await this.page.pause();
  }
}
