import { expect, type Locator, type Page } from '@playwright/test';
import { ROUTES } from '../constants/routes';
import { MESSAGES } from '../constants/messages';

export class DashboardPage {
  readonly heading: Locator;

  constructor(private page: Page) {
    this.heading = page.locator(`//h1[contains(.,"${MESSAGES.dashboardHeading}")]`);
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.home);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }
}
