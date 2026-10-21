import { expect, type Page } from '@playwright/test';
import { getNewServiceRequest } from '../utils/testData';
import type { NewEmployee } from '../utils/testData';
import { getNewDomain, getNewEmployee } from '../utils/testData';
import { DomainPage } from './DomainPage';
import { EmployeePage } from './EmployeePage';

export interface SRPrereqs {
  company: string;
  domain: string;
  employee: NewEmployee;
}

export class ServiceRequestPage {
  constructor(private page: Page) {}

  /** Click-through entry: Dashboard → Service Request → Service Request. */
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
    const toggle = this.page.locator('button[data-tour="panel-service_request"], button:has-text("Service Request")').first();
    await toggle.click();
    await this.page.locator('a[href="/service-request"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible({ timeout: 20000 });
  }

  /** Rows keyed by the (unique, untruncated) problem text. */
  row(problem: string) {
    return this.page.locator('tr.data-row', { hasText: problem });
  }

  async expectRowVisible(problem: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', problem);
    await expect(this.row(problem).first()).toBeVisible({ timeout: 20000 });
  }

  /**
   * Standing rule: Company (Client master) + Domain + Employee are
   * created first in the same TC. Returns names for the form.
   */
  async ensurePrerequisites(): Promise<SRPrereqs> {
    const company = `QA SR Co ${Date.now().toString().slice(-6)}`;
    // Minimal client create (company + code + address + contacts + pin pick).
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
    await this.page.locator('a[href="/client"]').click();
    await this.page.locator('#data-search').waitFor({ timeout: 15000 });
    await this.page.locator('a.btn-add[href$="/client/add"]').click();
    const code = `QASC${Date.now().toString().slice(-6)}`;
    await this.page.fill('#company_name', company);
    await this.page.fill('#custom_code', code);
    await this.page.fill('#address', 'Addr 1');
    await this.page.fill('#contact_person', 'QA');
    await this.page.fill('#contact_phone', '9000000001');
    await this.page.fill('#pin', '110');
    await this.page.waitForTimeout(2500);
    // The pin widget is flaky: only submit once city actually resolved,
    // otherwise the create fails silently (no row, no error).
    let city = '';
    for (let i = 0; i < 5 && !city; i++) {
      if ((await this.page.locator('#pincode-dropdown > *').count()) > 0) {
        await this.page.locator('#pincode-dropdown > *').first().click().catch(() => null);
        await this.page.waitForTimeout(1000);
      }
      city = await this.page.inputValue('#city_name').catch(() => '');
      if (!city) await this.page.waitForTimeout(1500);
    }
    expect(city).toBeTruthy();
    await this.page.getByRole('button', { name: 'Save' }).click();
    await this.page.waitForURL('**/client', { timeout: 30000, waitUntil: 'commit' });
    // The client create fails silently without a city pin-pick — verify
    // the row exists so downstream selects don't hang mysteriously.
    await this.page.fill('#data-search', code);
    await expect(this.page.locator('tr.data-row', { hasText: code }).first()).toBeVisible({ timeout: 20000 });
    const dom = new DomainPage(this.page);
    const domain = getNewDomain();
    await dom.addDomain(domain);
    const empPage = new EmployeePage(this.page);
    const employee = getNewEmployee();
    await empPage.addEmployee(employee);
    return { company, domain: domain.name, employee };
  }

  /** Expand all collapsed form sections. */
  async expandFormSections(): Promise<void> {
    for (const card of await this.page.locator('section.section-card').all()) {
      const cls = (await card.getAttribute('class')) || '';
      if (!cls.includes('is-open')) {
        await card.locator('button.section-toggle').click();
      }
    }
    await expect(this.page.locator('#contact_person')).toBeVisible({ timeout: 15000 });
  }

  /**
   * The SR form's company/domain/engineer lists are cached server-side for
   * 120s (service_request:options) and not invalidated on master create, so
   * freshly created prereqs can be missing. Reload until they appear.
   */
  async waitForFormOptions(pre: SRPrereqs): Promise<void> {
    const deadline = Date.now() + 150000;
    for (;;) {
      const missing = await this.page.evaluate(({ company, domain }) => {
        const has = (sel: string, label: string) => {
          const el = document.querySelector(sel) as HTMLSelectElement | null;
          return !el || Array.from(el.options).some((o) => o.text.trim() === label);
        };
        return !(has('select#company_id', company) && has('#domain_id', domain));
      }, { company: pre.company, domain: pre.domain });
      if (!missing) return;
      if (Date.now() > deadline) throw new Error(`SR form options never listed company "${pre.company}" / domain "${pre.domain}"`);
      await this.page.waitForTimeout(10000);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
    }
  }

  /** Fill the add/edit form (company + domain + problem + engineer). */
  async fillSRForm(problem: string, pre: SRPrereqs): Promise<void> {
    await this.waitForFormOptions(pre);
    await this.expandFormSections();
    const coSel = this.page.locator('select#company_id');
    if ((await coSel.count()) > 0) {
      await coSel.selectOption({ label: pre.company }, { timeout: 30000 });
    }
    await this.page.selectOption('#domain_id', { label: pre.domain }, { timeout: 30000 });
    await this.page.fill('#problem', problem);
    // Engineer assignment is permission-gated (ASSIGNMENT section shows a
    // notice instead of the select for roles without it) — skip if absent.
    const engSel = this.page.locator('select#engineer_id');
    if ((await engSel.count()) > 0) {
      await engSel.selectOption({ label: pre.employee.name });
    }
    // Contact Information section (collapsed by default, all required).
    await this.page.fill('#contact_person', 'QA Person');
    await this.page.fill('#contact_number', '9000000001');
    await this.page.fill('#contact_email', 'qa.sr@example.com');
  }

  async addServiceRequest(problem: string, pre: SRPrereqs): Promise<void> {
    // Save-time validation uses a separate 300s lookup cache (sr:lookup:*),
    // so a fresh company can be listed yet rejected with "Please select a
    // valid company." — re-submit until the cache catches up.
    const deadline = Date.now() + 330000;
    for (;;) {
      await this.gotoViaUI();
      await this.page.locator('a.btn-add[href$="/service-request/add"]').click();
      await this.fillSRForm(problem, pre);
      await this.submitForm();
      const listUrl = /\/service-request(\?.*)?$/;
      const rejected = this.page.locator('.alert-error, .form-alert-error', { hasText: /valid (company|domain|engineer)/i });
      await Promise.race([
        this.page.waitForURL(listUrl, { timeout: 30000, waitUntil: 'commit' }).catch(() => null),
        rejected.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => null),
      ]);
      if (listUrl.test(this.page.url())) break;
      if ((await rejected.count()) === 0 || Date.now() > deadline) {
        await this.page.waitForURL(listUrl, { timeout: 5000, waitUntil: 'commit' });
      }
      await this.page.waitForTimeout(20000);
    }
    await this.page.fill('#data-search', problem);
    await expect(this.row(problem).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(problem: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', problem);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(problem).first().locator('a.edit-btn').click();
  }

  async submitForm(): Promise<void> {
    const submit = this.page.locator('button[type="submit"].btn-primary');
    await submit.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await submit.click();
  }
}
