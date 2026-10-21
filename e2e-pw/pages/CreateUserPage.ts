import { expect, type Page } from '@playwright/test';
import type { NewLoginUser } from '../utils/testData';
import { UserListPage } from './UserListPage';

export class CreateUserPage {
  constructor(readonly page: Page) {}

  /**
   * Click-through entry (navigation rule): list via sidebar → Add button.
   * No direct-URL deep navigation anywhere in this page object.
   */
  async openCreateForm(): Promise<void> {
    const list = new UserListPage(this.page);
    await list.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/create-user"]').click();
  }

  /** Fill the whole form (caller submits and asserts the outcome). */
  async fillForm(data: NewLoginUser): Promise<void> {
    await this.openCreateForm();
    await this.page.fill('input[name="username"]', data.username);
    await this.page.fill('input[name="empcode"]', data.empcode);
    await this.page.fill('input[name="password"]', data.password);
    // Form gained a required Confirm Password field (KASSIST-605 fix).
    const confirm = this.page.locator('input[name="confirm_password"]');
    if ((await confirm.count()) > 0) await confirm.fill(data.password);
    await this.selectNonAdminType();
  }

  /**
   * Create a user, preferring a non-privileged user type so the run never
   * depends on role-guard behaviour. Throws honestly if only admin-like
   * types (or none) are available.
   */
  async createUser(data: NewLoginUser): Promise<void> {
    await this.openCreateForm();
    await this.page.fill('input[name="username"]', data.username);
    await this.page.fill('input[name="empcode"]', data.empcode);
    await this.page.fill('input[name="password"]', data.password);
    const confirm = this.page.locator('input[name="confirm_password"]');
    if ((await confirm.count()) > 0) await confirm.fill(data.password);

    await this.selectNonAdminType();
    await this.page.getByRole('button', { name: 'Create User' }).click();
    await this.page.waitForURL('**/account_creation?created=1');
  }

  async expectOnUserList(): Promise<void> {
    await expect(this.page).toHaveURL(/account_creation/);
  }

  /**
   * Browser must block an invalid email (input type=email): no request is
   * sent, the page stays on /create-user.
   */
  async expectBrowserBlocksInvalidEmail(email: string): Promise<void> {
    await this.openCreateForm();
    await this.page.fill('input[name="username"]', email);
    await this.page.fill('input[name="empcode"]', `E2E${Date.now().toString().slice(-6)}`);
    await this.page.fill('input[name="password"]', 'Test@12345');
    await this.page.getByRole('button', { name: 'Create User' }).click();
    await expect(this.page).toHaveURL(/create-user/);
    const msg: string | null = await this.page.evaluate(() => {
      const input = document.querySelector(
        'input[name="username"]',
      ) as HTMLInputElement | null;
      return input ? input.validationMessage : null;
    });
    expect(msg).toBeTruthy();
  }

  /** Submit expecting the server-side error box; returns its text. */
  async createUserExpectError(data: NewLoginUser): Promise<string> {
    await this.openCreateForm();
    await this.page.fill('input[name="username"]', data.username);
    await this.page.fill('input[name="empcode"]', data.empcode);
    await this.page.fill('input[name="password"]', data.password);
    await this.selectNonAdminType();
    await this.page.getByRole('button', { name: 'Create User' }).click();
    const alert = this.page.locator('.alert-error');
    await expect(alert).toBeVisible();
    return ((await alert.textContent()) || '').trim();
  }

  /** User list must show the (normalized) email row. */
  async expectUserInList(emailPattern: RegExp): Promise<void> {
    await new UserListPage(this.page).gotoViaUI();
    await expect(this.page.getByText(emailPattern).first()).toBeVisible();
  }

  /**
   * Server-side probe, bypassing the browser: GET the form (authed) for the
   * CSRF token + a usable user-type id, then POST the raw form. Returns the
   * response status + redirect target for the caller to assert.
   */
  async probeDirectPost(email: string): Promise<{ status: number; location: string }> {    const getResp = await this.page.request.get('/create-user');
    const html = await getResp.text();
    const csrf =
      html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? '';
    let typeId = '';
    for (const m of html.matchAll(
      /<option value="(\d+)"[^>]*>\s*([^<]*?)\s*</g,
    )) {
      if (/admin/i.test(m[2])) continue;
      typeId = m[1];
      break;
    }
    if (!typeId) throw new Error('No non-privileged user type in form HTML.');
    let companyId = '';
    for (const m of html.matchAll(
      /<select[^>]*id="emp_cust_id"[^>]*>([\s\S]*?)<\/select>/g,
    )) {
      const opt = m[1].match(/<option value="(\d+)"[^>]*>/);
      if (opt) companyId = opt[1];
    }
    const postResp = await this.page.request.post('/create-user', {
      form: {
        username: email,
        empcode: `E2E${Date.now().toString().slice(-6)}`,
        password: 'Test@12345',
        usertype: typeId,
        ...(companyId ? { emp_cust_id: companyId } : {}),
        csrf_token: csrf,
      },
    });
    const headers = await postResp.headersArray();
    return {
      status: postResp.status(),
      location:
        headers.find((h) => h.name.toLowerCase() === 'location')?.value ?? '',
    };
  }

  /** Deactivate a user via the list → edit flow (for deactivated-login TCs). */
  async deactivateUser(email: string): Promise<void> {
    await this.setActive(email, true);
  }

  /**
   * Deactivate the newest ACTIVE e2e dummy (quota-slot source for limit
   * tests). Returns its email, or null when none is available.
   */
  async deactivateFirstE2EUser(): Promise<string | null> {
    const list = new UserListPage(this.page);
    await list.gotoViaUI();
    await list.search('e2e.newuser');
    const row = this.page
      .locator('tr.data-row:has(span.status-online)', { hasText: 'e2e.newuser' })
      .first();
    if ((await row.count()) === 0) return null;
    const email = ((await row.locator('td').first().textContent()) || '').trim();
    if (!email) return null;
    await row.locator('a.edit-btn').click();
    await this.page.locator('input[name="is_deactivated"]').check();
    await this.page.getByRole('button', { name: 'Update User' }).click();
    await this.page.waitForURL('**/account_creation?updated=1');
    return email;
  }

  /** Reactivate a previously deactivated user. */
  async activateUser(email: string): Promise<void> {
    await this.setActive(email, false);
  }

  private async setActive(email: string, deactivate: boolean): Promise<void> {
    // Click-through only (navigation rule): list via sidebar, search via
    // toolbar, edit via row link — never a direct /edit-user/{id} URL.
    const list = new UserListPage(this.page);
    await list.gotoViaUI();
    await list.search(email);
    await list.row(email).locator('a.edit-btn').click();
    const box = this.page.locator('input[name="is_deactivated"]');
    if (deactivate) await box.check();
    else await box.uncheck();
    await this.page.getByRole('button', { name: 'Update User' }).click();
    await this.page.waitForURL('**/account_creation?updated=1');
  }

  /** Save on the edit page, expecting success. */
  async saveExpectUpdated(): Promise<void> {
    await this.page.getByRole('button', { name: 'Update User' }).click();
    await this.page.waitForURL('**/account_creation?updated=1');
  }

  /**
   * Attempt reactivation, reporting the outcome instead of asserting.
   * Click-through only (navigation rule): list via sidebar, toolbar search,
   * row edit link — never a direct URL. 'allowed' (?updated=1) means the
   * quota was bypassed; an error/limit message counts as 'blocked'.
   */
  async tryReactivate(email: string): Promise<'allowed' | 'blocked'> {
    const list = new UserListPage(this.page);
    await list.gotoViaUI();
    await list.search(email);
    // Let the client-side search re-render rows before clicking, otherwise
    // the click lands on a replaced (stale) row and nothing navigates.
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await Promise.all([
      this.page.waitForURL(/update-user|edit/, { timeout: 15000 }),
      list.row(email).locator('a.edit-btn').click(),
    ]);
    await this.page.locator('input[name="is_deactivated"]').uncheck();
    await this.page.getByRole('button', { name: 'Update User' }).click();
    try {
      await this.page.waitForURL('**/account_creation?updated=1', { timeout: 12000 });
      return 'allowed';
    } catch {
      return 'blocked';
    }
  }

  /** Fill contact person on the edit page (caller navigated there). */
  async fillEditContact(contactPerson: string): Promise<void> {
    await this.page.fill('input[name="contact_person"]', contactPerson);
  }

  /**
   * Submit expecting server rejection (.alert-error). If the user gets
   * CREATED instead, the policy is not enforced — throw honestly so the
   * test FAILS and feeds the Bug flow (never silently pass).
   */
  async submitExpectReject(serverSide = true): Promise<void> {
    if (serverSide) {
      // Skip the browser's minlength/maxlength check so the SERVER policy
      // (services/user_service.validate_password_policy) is what's verified.
      await this.page.evaluate(() => document.querySelectorAll('form').forEach((f) => { f.noValidate = true; }));
    }
    await this.page.getByRole('button', { name: 'Create User' }).click();
    const outcome = await Promise.race([
      this.page
        .waitForURL('**/account_creation?created=1', { timeout: 15000 })
        .then(() => 'created'),
      this.page
        .locator('.alert-error')
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'rejected'),
    ]);
    if (outcome === 'created') {
      throw new Error(
        'POLICY-NOT-ENFORCED: weak password was accepted (user created)',
      );
    }
  }

  private async selectNonAdminType(): Promise<void> {
    const options = this.page.locator('#usertype option');
    const count = await options.count();
    let value: string | null = null;
    for (let i = 0; i < count; i++) {
      const v = ((await options.nth(i).getAttribute('value')) || '').trim();
      const label = ((await options.nth(i).textContent()) || '').trim();
      if (!v) continue;
      if (/admin/i.test(label)) continue;
      value = v;
      break;
    }
    if (!value) {
      throw new Error(
        'No non-privileged user type available on /create-user; refusing to guess.',
      );
    }
    await this.page.selectOption('#usertype', value);
    // Customer-type users make Company required (template toggles
    // #company-group by user type). Pick the first company so the browser
    // does not block submit; throw honestly when none exists.
    if (await this.page.locator('#company-group').isVisible()) {
      const companyOptions = this.page.locator('#emp_cust_id option');
      const companyCount = await companyOptions.count();
      let companyValue: string | null = null;
      for (let i = 0; i < companyCount; i++) {
        const v = (
          (await companyOptions.nth(i).getAttribute('value')) || ''
        ).trim();
        if (v) {
          companyValue = v;
          break;
        }
      }
      if (!companyValue) {
        throw new Error(
          'Customer-type user needs a company but /create-user lists none; refusing to guess.',
        );
      }
      await this.page.selectOption('#emp_cust_id', companyValue);
    }
  }
}
