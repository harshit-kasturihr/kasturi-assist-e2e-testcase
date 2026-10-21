import { expect, type Page } from '@playwright/test';
import { MESSAGES } from '../constants/messages';
import { ROUTES } from '../constants/routes';

export class LogoutPage {
  constructor(private page: Page) {}

  async gotoHome(): Promise<void> {
    await this.page.goto(ROUTES.home);
  }

  async expectLoginPage(): Promise<void> {
    await expect(this.page.getByText(MESSAGES.signInHeading)).toBeVisible();
  }

  async expectDashboardGone(): Promise<void> {
    await expect(
      this.page.locator(`//h1[contains(.,"${MESSAGES.dashboardHeading}")]`),
    ).toBeHidden();
  }

  /**
   * Full sidebar chain: sidebar link → JS modal ("Leaving already?!") →
   * confirm page ("Leave Kasturi Assist?") → POST → login page.
   */
  async logoutViaSidebar(): Promise<void> {
    await this.gotoHome();
    await this.page.locator('a[data-logout]').click();
    await expect(this.page.getByText(MESSAGES.leavingTitle)).toBeVisible();
    await this.page.locator('.modal-logout .logout-yes').click();
    await expect(this.page.getByText(MESSAGES.leaveTitle)).toBeVisible();
    await this.page
      .getByRole('button', { name: MESSAGES.confirmLogout })
      .click();
    await this.expectLoginPage();
  }

  /** Sidebar modal → Stay: must remain logged in. */
  async dismissSidebarModal(): Promise<void> {
    await this.gotoHome();
    await this.page.locator('a[data-logout]').click();
    await expect(this.page.getByText(MESSAGES.leavingTitle)).toBeVisible();
    await this.page.locator('.modal-logout .logout-cancel').first().click();
    await expect(
      this.page.locator(`//h1[contains(.,"${MESSAGES.dashboardHeading}")]`),
    ).toBeVisible();
  }

  /** Open the confirm page and cancel — session must survive. */
  async cancelLogout(): Promise<void> {
    await this.page.goto('/logout');
    await expect(this.page.getByText(MESSAGES.leaveTitle)).toBeVisible();
    await this.page.getByRole('link', { name: MESSAGES.cancelLogout }).click();
  }

  /** Second logout path: Settings → session panel form (direct POST, modal). */
  async settingsLogout(): Promise<void> {
    await this.page.goto('/home?tab=settings');
    await this.page.locator('[data-settings-section="session"]').click();
    await this.page.locator('#settings-logout-button').click();
    await expect(this.page.getByText(MESSAGES.leavingTitle)).toBeVisible();
    await this.page.locator('.modal-logout .logout-yes').click();
    await this.expectLoginPage();
  }

  /** Rapid double confirm (double-submit guard probe). */
  async doubleConfirmLogout(): Promise<void> {
    await this.page.goto('/logout');
    await expect(this.page.getByText(MESSAGES.leaveTitle)).toBeVisible();
    await this.page
      .getByRole('button', { name: MESSAGES.confirmLogout })
      .dblclick();
    await this.expectLoginPage();
  }

  async getSessionId(): Promise<string> {
    const cookies = await this.page.context().cookies();
    return cookies.find((c) => c.name === 'session_id')?.value ?? '';
  }

  /** Re-inject a (stale) session cookie and open home (server-side check). */
  async injectSessionAndGotoHome(sessionId: string): Promise<void> {
    await this.page.context().clearCookies();
    if (sessionId) {
      await this.page.context().addCookies([
        { name: 'session_id', value: sessionId, domain: 'localhost', path: '/' },
      ]);
    }
    await this.gotoHome();
  }
}
