import { expect, type Page } from '@playwright/test';
import type { NewProblem } from '../utils/testData';

/**
 * Problem Management (/problem): list, add/edit form, track page and its
 * sub-forms (Investigation & RCA, Known Error, CAPA action, Resolution).
 * Navigation is click-through from the sidebar (navigation rule).
 */
export class ProblemPage {
  constructor(readonly page: Page) {}

  async gotoHome(): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/home', { timeout: 30000, waitUntil: 'domcontentloaded' });
        return;
      } catch (e) {
        lastError = e;
        await this.page.waitForTimeout(1000);
      }
    }
    throw lastError;
  }

  private async openSidebarLink(href: string): Promise<void> {
    await this.openSidebar('problem_management', href);
  }

  /** Dashboard → sidebar group (data-tour="panel-<group>") → link ending in href. */
  async openSidebar(group: string, href: string): Promise<void> {
    await this.gotoHome();
    const link = this.page.locator(`.sb-group:has(button[data-tour="panel-${group}"]) .sb-group-body a[href$="${href}"]`).first();
    // sidebar.js keeps the collapsed/expanded state in localStorage: expand the
    // sidebar (☰) first, then open the Problem Management group if closed.
    if (!(await this.page.evaluate(() => document.body.classList.contains('sb-open')))) {
      await this.page.locator('#sb-toggle').click({ timeout: 15000 });
    }
    const grp = this.page.locator('.sb-group', { has: this.page.locator(`button[data-tour="panel-${group}"]`) });
    if (!(await grp.evaluate((g) => g.classList.contains('is-open')))) {
      await grp.locator('button.sb-group-toggle').click({ timeout: 15000 });
    }
    await this.page.waitForTimeout(400);
    await link.click({ timeout: 15000 });
  }

  /** Dashboard → Problem Management → Problems. */
  async gotoListViaUI(): Promise<void> {
    await this.openSidebarLink('/problem');
    await expect(this.page.locator('#data-search')).toBeVisible({ timeout: 20000 });
  }

  /** Dashboard → Problem Management → Dashboard. */
  async gotoDashboardViaUI(): Promise<void> {
    await this.openSidebarLink('/problem/dashboard');
    await expect(this.page.locator('a.pd-card').first()).toBeVisible({ timeout: 20000 });
  }

  get addButton() {
    return this.page.locator('a.btn-add[href$="/problem/add"]');
  }

  row(text: string) {
    return this.page.locator('tr.data-row', { hasText: text });
  }

  async search(text: string): Promise<void> {
    await this.page.fill('#data-search', text);
    await this.page.waitForTimeout(1500);
  }

  async openAddForm(): Promise<void> {
    await this.gotoListViaUI();
    await this.addButton.click();
    await expect(this.page.locator('#problem-form')).toBeVisible({ timeout: 20000 });
  }

  /** Fill the add/edit form. Selects with live data take their first real option. */
  async fillForm(p: Partial<NewProblem>): Promise<void> {
    if (p.title !== undefined) await this.page.fill('#title', p.title);
    if (p.description !== undefined) await this.page.fill('#description', p.description);
    if (p.status) await this.page.selectOption('#status', p.status);
    if (p.problemType) await this.page.selectOption('#problem_type', p.problemType);
    if (p.category !== undefined) await this.page.fill('#category', p.category);
    if (p.impact) await this.page.selectOption('#impact', p.impact);
    if (p.urgency) await this.page.selectOption('#urgency', p.urgency);
    if (p.withPeople) {
      for (const sel of ['#domain_id', '#problem_manager_id', '#assigned_group_id', '#assigned_analyst_id']) {
        if ((await this.page.locator(`${sel} option`).count()) > 1) await this.page.selectOption(sel, { index: 1 });
      }
    }
    if (p.major) await this.page.check('#is_major_problem');
  }

  async save(): Promise<void> {
    const btn = this.page.locator('#problem-form button[type="submit"]');
    await btn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }), null, { timeout: 20000 });
    await btn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Create through the Add form and land on the Track page; returns the problem number. */
  async create(p: NewProblem): Promise<string> {
    await this.openAddForm();
    await this.fillForm(p);
    await this.save();
    await this.page.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
    return ((await this.page.locator('h1.sr-id').first().textContent()) || '').trim();
  }

  /** List → search → click the row → Track page. */
  async openTrack(title: string): Promise<void> {
    await this.gotoListViaUI();
    await this.search(title);
    const r = this.row(title).first();
    await expect(r).toBeVisible({ timeout: 20000 });
    await r.locator('td').nth(1).click();
    await this.page.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  }

  trackId(): string {
    return (this.page.url().match(/\/problem\/track\/(\d+)/) || [])[1] || '';
  }

  /** Track page: the card whose title matches. */
  card(title: string | RegExp) {
    return this.page.locator('.sr-card', { has: this.page.locator('h2.sr-card-title', { hasText: title }) });
  }

  async statusText(): Promise<string> {
    return ((await this.page.locator('.sr-pill').first().textContent()) || '').trim();
  }

  async clickEdit(): Promise<void> {
    await this.page.locator('a.sr-btn', { hasText: 'Edit Problem' }).click();
    await expect(this.page.locator('#problem-form')).toBeVisible({ timeout: 20000 });
  }

  /** Track → section button (Investigation / Known Error / Resolution / + Add Action). */
  async openSubForm(pathSuffix: string): Promise<void> {
    const link = this.page.locator(`a.sr-btn[href*="/problem/track/"][href$="${pathSuffix}"]`).first();
    await link.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }), null, { timeout: 20000 });
    await link.click();
    await expect(this.page.locator('form.form-grid')).toBeVisible({ timeout: 20000 });
  }

  /** Save a sub-form (form.form-grid) and return to the Track page. */
  async saveSubForm(): Promise<void> {
    const btn = this.page.locator('form.form-grid button[type="submit"].btn-primary');
    await btn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }), null, { timeout: 20000 });
    await btn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async saveInvestigation(rootCause: string, approval?: 'Pending' | 'Approved' | 'Rejected'): Promise<void> {
    await this.openSubForm('/investigation');
    await this.page.fill('#findings', 'QA findings: service restarts after memory spike.');
    await this.page.selectOption('#rca_method', 'Five Whys');
    await this.page.fill('#root_cause_summary', rootCause);
    await this.page.fill('#detailed_root_cause', `${rootCause} - detailed analysis by QA automation.`);
    if (approval) await this.page.selectOption('#rca_approval_status', approval);
    await this.saveSubForm();
    await this.page.waitForURL(/\/problem\/track\/\d+(\?|$)/, { timeout: 30000 });
  }

  async addAction(description: string, status = 'Not Started'): Promise<void> {
    await this.openSubForm('/action/add');
    await this.page.selectOption('#action_type', 'Corrective');
    await this.page.selectOption('#status', status);
    await this.page.fill('#description', description);
    if (status === 'Completed') await this.page.fill('#completion_percentage', '100');
    await this.saveSubForm();
    await this.page.waitForURL(/\/problem\/track\/\d+(\?|$)/, { timeout: 30000 });
  }

  async saveResolution(summary: string): Promise<void> {
    await this.openSubForm('/resolution');
    await this.page.fill('#resolution_summary', summary);
    await this.page.fill('#permanent_fix_details', 'QA permanent fix: memory limit raised and leak patched.');
    await this.saveSubForm();
    await this.page.waitForURL(/\/problem\/track\/\d+(\?|$)/, { timeout: 30000 });
  }

  /** Click a track-page POST button by its form action suffix. */
  async postTrackForm(actionSuffix: string): Promise<void> {
    const btn = this.page.locator(`form[action$="${actionSuffix}"] button[type="submit"]`).first();
    await btn.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }), null, { timeout: 20000 });
    await btn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Edit Problem → set status (+ optional closing remark if the field exists) → Save. */
  async setStatusViaEdit(status: string, closingRemark?: string): Promise<void> {
    await this.clickEdit();
    await this.page.selectOption('#status', status);
    if (closingRemark && (await this.page.locator('#closing_remark').count())) {
      await this.page.fill('#closing_remark', closingRemark);
    }
    await this.save();
  }

  get formError() {
    return this.page.locator('.alert-error').first();
  }

  /** True when the page rendered/showed a toast containing `text` (call recordToasts first). */
  async toastShown(text: string): Promise<boolean> {
    for (let i = 0; i < 10; i++) {
      const seen = await this.page
        .evaluate((t) => {
          const toasts = (window as unknown as { __toasts?: string[] }).__toasts || [];
          const nodes = Array.from(document.querySelectorAll('[data-toast-message], .toast')).map(
            (n) => (n.getAttribute('data-toast-message') || n.textContent || '').trim(),
          );
          return [...toasts, ...nodes].some((s) => s.includes(t));
        }, text)
        .catch(() => false);
      if (seen) return true;
      await this.page.waitForTimeout(300);
    }
    return false;
  }

  /**
   * Server-side check: POST a Track-page action the UI hides (e.g. Approve
   * Closure on a Draft) with the page's own CSRF token — what a stale tab or
   * a crafted request would send.
   */
  async forcePost(actionSuffix: string): Promise<void> {
    const id = this.trackId();
    const nav = this.page.waitForNavigation({ timeout: 30000, waitUntil: 'domcontentloaded' });
    await this.page.evaluate(({ id, actionSuffix }) => {
      const csrf = document.querySelector('form input[type="hidden"][name*="csrf" i]') as HTMLInputElement | null;
      const f = document.createElement('form');
      f.method = 'POST';
      f.action = `/problem/track/${id}${actionSuffix}`;
      if (csrf) f.appendChild(csrf.cloneNode(true));
      document.body.appendChild(f);
      f.submit();
    }, { id, actionSuffix });
    await nav;
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** All Activity entries on the Track page as plain text, newest first. */
  async activityEntries(): Promise<string[]> {
    return (await this.page.locator('.sr-activity-item').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  /** RCA → completed actions → resolution → Approve Closure → Edit: Closed. */
  async closeProblem(remark = 'QA closure: fix verified, no recurrence.'): Promise<void> {
    await this.saveInvestigation('Memory leak in mail relay service');
    await this.saveResolution('Mail relay patched and monitored for 7 days.');
    await this.postTrackForm('/approve-closure');
    await this.page.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
    await this.setStatusViaEdit('Closed', remark);
    await this.page.waitForURL(/\/problem\/track\/\d+/, { timeout: 30000 });
  }
}
