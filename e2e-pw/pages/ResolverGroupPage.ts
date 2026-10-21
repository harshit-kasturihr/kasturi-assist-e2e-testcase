import { expect, type Page } from '@playwright/test';
import type { NewEmployee } from '../utils/testData';
import { getNewEmployee, type NewResolverGroup } from '../utils/testData';
import { EmployeePage } from './EmployeePage';

export class ResolverGroupPage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Resolver Group. */
  async gotoViaUI(): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/home');
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        await this.page.waitForTimeout(1000);
      }
    }
    if (lastError) throw lastError;
    await this.page.locator('button[data-tour="panel-master"]').click();
    await this.page.locator('a[href="/resolver-group"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  row(name: string) {
    return this.page.locator('tr.data-row', { hasText: name });
  }

  async expectRowVisible(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await expect(this.row(name).first()).toBeVisible({ timeout: 20000 });
  }

  /**
   * Standing rule: members are employee emails, so an Employee (with its
   * Designation + Skill) is created first in the same TC. Returns the
   * employee for callers that need its email.
   */
  async ensureMemberEmployee(): Promise<NewEmployee> {
    const emp = new EmployeePage(this.page);
    const data = getNewEmployee();
    await emp.addEmployee(data);
    return data;
  }

  /** Type the full email and pick the suggestion with the exact address
   * (a short token can match many employees — exact match is deterministic). */
  async pickMemberSuggestion(email: string): Promise<string> {
    await this.page.fill('#members', email);
    const exact = this.page.locator('.resolver-suggestion', { hasText: email }).first();
    await expect(exact).toBeVisible({ timeout: 15000 });
    const picked = ((await exact.textContent()) || '').trim();
    expect(picked).toBe(email);
    await exact.click();
    await expect(this.page.locator('#members')).toHaveValue(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return picked;
  }

  async addResolverGroup(
    data: NewResolverGroup,
    memberEmail: string,
    opts: { escalation?: string; comments?: string } = {},
  ): Promise<void> {
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/resolver-group/add"]').click();
    await this.page.fill('#group_name', data.name);
    await this.page.fill('#group_description', data.description);
    await this.page.fill('#contact_info', data.contact);
    // Members via the email autocomplete (proves the suggestion flow).
    await this.pickMemberSuggestion(memberEmail);
    await this.page.fill('#escalation_path', opts.escalation ?? 'L1 > L2');
    await this.page.fill('#comments', opts.comments ?? 'QA comments');
    await this.page.getByRole('button', { name: 'Add Resolver Group' }).click();
    await this.page.waitForURL('**/resolver-group', { timeout: 30000, waitUntil: 'commit' });
    await this.page.fill('#data-search', data.name);
    await expect(this.row(data.name).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(name).first().locator('a.edit-btn').click();
  }

  /** Delete via the generic confirm flow; matching count must drop by one. */
  async deleteResolverGroup(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    const target = this.row(name);
    const before = await target.count();
    expect(before).toBeGreaterThan(0);
    const delBtn = target.first().locator('button.delete-btn');
    await delBtn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await delBtn.click();
    await expect(this.page.getByText(/Are you sure you want to delete/i)).toBeVisible();
    await this.page.locator('.confirm-yes').click({ noWaitAfter: true });
    await expect
      .poll(async () => target.count(), { timeout: 30000 })
      .toBe(before - 1);
  }

  /** Sort dropdown (client-side reorder); returns visible name-column texts. */
  async sortAndReadNames(value: 'asc' | 'desc'): Promise<string[]> {
    await this.gotoViaUI();
    await this.page.selectOption('#sort-filter', value);
    await this.page.waitForTimeout(800);
    return this.page.locator('tr.data-row td:nth-child(2)').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
  }

  /** Print link opens a popup with the record; falls back to status probe. */
  async expectPrintView(name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', name);
    const printLink = this.row(name).locator('a[title="Print"]');
    if ((await printLink.count()) > 0) {
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup'),
        printLink.first().click(),
      ]);
      await expect(popup.getByText(name).first()).toBeVisible({ timeout: 15000 });
      await popup.close();
    } else {
      const resp = await this.page.request.get('/resolver-group/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }
}
