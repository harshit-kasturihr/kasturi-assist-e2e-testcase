import { expect, type Page } from '@playwright/test';
import { MESSAGES } from '../constants/messages';
import { ROUTES } from '../constants/routes';
import type { LocationFormData } from '../types/location.types';

export class LocationPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.companyTab);
  }

  async addLocation(data: LocationFormData): Promise<void> {
    await this.goto();
    await this.page.getByText(MESSAGES.addLocation).click();
    await this.page.getByPlaceholder('Address').fill(data.address);
    await this.page.getByPlaceholder('Enter Pincode').fill(data.pincode);
    await this.selectGeographySuggestionIfPresent();
    await this.page.getByPlaceholder('Contact Person').fill(data.contactPerson);
    await this.page.getByPlaceholder('Designation').fill(data.designation);
    await this.page.getByPlaceholder('Contact Number').fill(data.contactNumber);
    await this.page.getByPlaceholder('Contact Email').fill(data.contactEmail);
    await this.page.getByRole('button', { name: MESSAGES.saveLocation }).click();
    await expect(this.page.getByText(MESSAGES.locationAdded)).toBeVisible();
  }

  /**
   * Geography autocomplete is temporarily disabled server-side (see the
   * "Calls Geography temporarily disabled" note in home.html) — the
   * suggestion list may never appear. Click it only when present instead
   * of timing out the whole test.
   */
  private async selectGeographySuggestionIfPresent(): Promise<void> {
    const suggestion = this.page.locator('(//div[@class="autocomplete-item"])[1]');
    try {
      await suggestion.waitFor({ state: 'visible', timeout: 4000 });
      await suggestion.click();
    } catch {
      /* no suggestions — submit without a selection */
    }
  }

  /** Submit expecting the server-side error box; returns its text. */
  async addLocationExpectError(data: LocationFormData): Promise<string> {
    await this.goto();
    await this.page.getByText(MESSAGES.addLocation).click();
    await this.page.getByPlaceholder('Address').fill(data.address);
    await this.page.getByPlaceholder('Enter Pincode').fill(data.pincode);
    await this.selectGeographySuggestionIfPresent();
    await this.page.getByPlaceholder('Contact Person').fill(data.contactPerson);
    await this.page.getByPlaceholder('Designation').fill(data.designation);
    await this.page.getByPlaceholder('Contact Number').fill(data.contactNumber);
    await this.page.getByPlaceholder('Contact Email').fill(data.contactEmail);
    await this.page.getByRole('button', { name: MESSAGES.saveLocation }).click();
    const alert = this.page.locator('.alert-error');
    await expect(alert).toBeVisible();
    return ((await alert.textContent()) || '').trim();
  }

  /** Location row edit/delete controls (dev Task KASSIST-537 scope). */
  async expectRowControls(): Promise<void> {
    await this.goto();
    const controls = this.page.locator(
      'a[href*="location"][href*="edit"], a[href*="location"][href*="delete"]',
    );
    expect(await controls.count()).toBeGreaterThan(0);
  }

  /** Open the add form (caller fills and asserts). */
  async openAddForm(): Promise<void> {
    await this.goto();
    await this.page.getByText(MESSAGES.addLocation).click();
  }

  /** Invalid contact email must be blocked by the browser (type=email). */
  async expectBrowserBlocksBadContactEmail(data: LocationFormData): Promise<void> {
    await this.openAddForm();
    await this.page.getByPlaceholder('Address').fill(data.address);
    await this.page.getByPlaceholder('Enter Pincode').fill(data.pincode);
    await this.selectGeographySuggestionIfPresent();
    await this.page.getByPlaceholder('Contact Person').fill(data.contactPerson);
    await this.page.getByPlaceholder('Contact Email').fill('not-an-email');
    await this.page.getByRole('button', { name: MESSAGES.saveLocation }).click();
    const msg: string | null = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="email"]'));
      return inputs.length
        ? (inputs[0] as HTMLInputElement).validationMessage
        : null;
    });
    expect(msg).toBeTruthy();
  }

  /** State/City are readonly auto-fill (geography currently disabled). */
  async expectGeoFieldsReadonly(): Promise<void> {
    await this.openAddForm();
    await expect(this.page.locator('#state_name')).toHaveAttribute('readonly', '');
    await expect(this.page.locator('#city_name')).toHaveAttribute('readonly', '');
  }

  /** Empty required address must block submit at the browser. */
  async expectBrowserBlocksEmptyAddress(): Promise<void> {
    await this.openAddForm();
    await this.page.getByPlaceholder('Contact Person').fill('QA Person');
    await this.page.getByRole('button', { name: MESSAGES.saveLocation }).click();
    const msg: string | null = await this.page.evaluate(() => {
      const addr = document.querySelector(
        'input[name="address"]',
      ) as HTMLInputElement | null;
      return addr ? addr.validationMessage : null;
    });
    expect(msg).toBeTruthy();
  }

  /** Company Locations table row for an address (KASSIST-537 edit/delete). */
  row(address: string) {
    return this.page.locator('#companyLocationsWrapper tbody tr', { hasText: address });
  }

  /** Row → ✎ Edit → change contact person/designation → Update Location. */
  async editLocation(address: string, contactPerson: string, designation: string): Promise<void> {
    await this.row(address).first().locator('a.btn-edit').click();
    await expect(this.page.getByRole('button', { name: 'Update Location' })).toBeVisible({ timeout: 20000 });
    await this.page.locator('input[name="contact_person"]').fill(contactPerson);
    await this.page.locator('input[name="designation"]').fill(designation);
    await this.page.getByRole('button', { name: 'Update Location' }).click();
    await this.page.waitForURL(/tab=company/, { timeout: 30000 });
  }

  /** Row → 🗑 Delete → in-page confirm dialog; returns the dialog text. */
  async openDeleteConfirm(address: string): Promise<string> {
    await this.row(address).first().locator('button.btn-delete').click();
    const dialog = this.page.locator('.confirm-modal').filter({ has: this.page.locator('.confirm-yes') }).first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    return ((await dialog.locator('.confirm-message').textContent()) || '').trim();
  }

  /** New location row must appear in the Company Locations table. */
  async expectRowInList(address: string): Promise<void> {
    await this.goto();
    await expect(
      this.page.getByText(address, { exact: false }).first(),
    ).toBeVisible();
  }
}
