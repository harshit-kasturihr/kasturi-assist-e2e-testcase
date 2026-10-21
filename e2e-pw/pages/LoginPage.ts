import { expect, type Page } from '@playwright/test';
import { ROUTES } from '../constants/routes';
import { MESSAGES } from '../constants/messages';
import { env } from '../config/env';

export class LoginPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.login);
  }

  async login(username: string, password: string): Promise<void> {
    await this.goto();
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    await this.page.press('input[name="password"]', 'Enter');
    await this.page.waitForURL(ROUTES.homeWildcard);
  }

  async loginAsAdmin(): Promise<void> {
    await this.login(env.adminUsername, env.adminPassword);
  }

  /** Login honouring ?next= (post-login redirect target). */
  async loginWithNext(username: string, password: string, next: string): Promise<void> {
    await this.page.goto(`/login?next=${encodeURIComponent(next)}`);
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    await this.page.getByRole('button', { name: 'Continue' }).click();
  }

  /** Rapid double submit with valid creds (double-submit guard probe). */
  async doubleSubmitLogin(username: string, password: string): Promise<void> {
    await this.goto();
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    await this.page.getByRole('button', { name: 'Continue' }).dblclick();
  }

  /** Fill + submit via the Continue button, staying on the page for error assertions. */
  async attemptLogin(username: string, password: string): Promise<void> {
    await this.goto();
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    await this.page.getByRole('button', { name: 'Continue' }).click();
  }

  async expectInvalidCredentialsError(): Promise<void> {
    await expect(this.page.locator('.error-msg')).toHaveText(
      MESSAGES.invalidCredentials,
    );
  }

  async expectThrottleError(): Promise<void> {
    await expect(this.page.locator('.error-msg')).toContainText(
      MESSAGES.throttlePrefix,
    );
  }

  async expectDeactivatedError(): Promise<void> {
    await expect(this.page.locator('.error-msg')).toHaveText(
      MESSAGES.deactivatedAccount,
    );
  }

  /** Empty submit must be blocked by browser `required` validation (no server round-trip). */
  async expectRequiredValidation(): Promise<void> {
    await this.goto();
    await expect(this.page.locator('input[name="username"]')).toHaveAttribute(
      'required',
      '',
    );
    await expect(this.page.locator('input[name="password"]')).toHaveAttribute(
      'required',
      '',
    );
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await expect(this.page.getByText(MESSAGES.signInHeading)).toBeVisible();
  }
}
