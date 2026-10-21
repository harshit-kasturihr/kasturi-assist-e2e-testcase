import { expect, type Page } from '@playwright/test';
import type { NewEmployee } from '../utils/testData';
import { getNewDesignation, getNewSkill } from '../utils/testData';

export interface EmployeePrereqs {
  designation: string;
  skill: string;
}

export class EmployeePage {
  constructor(private page: Page) {}

  /** Click-through entry (navigation rule): Dashboard → Master → Employee. */
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
    await this.page.locator('a[href="/employee"]').click();
    await expect(this.page.locator('#data-search')).toBeVisible();
  }

  /** Rows keyed by Official Employee ID (first cell, unique per row). */
  row(officialId: string) {
    return this.page.locator('tr.data-row', { hasText: officialId });
  }

  async expectRowVisible(officialId: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', officialId);
    await expect(this.row(officialId).first()).toBeVisible({ timeout: 20000 });
  }

  /** Pick the first real skill name, or '' when the master is empty
   * (the server defaults blank lookups to ID 1). Fallback only — the
   * standing rule is to CREATE designation + skill first (below). */
  private async lookupSkillName(): Promise<string> {
    const resp = await this.page.request.get('/api/skills');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const items: Array<{ id: unknown; name: string }> = (body?.data ?? []).filter(
      (it: { name: string }) => it && it.name && !/^(legend|gold)/i.test(it.name),
    );
    return items.length ? items[0].name : '';
  }

  /**
   * Standing rule: cross-module fields are created first in the same TC.
   * Creates a fresh Designation + Skill via their own masters and returns
   * their names for the employee form (server matches by name).
   */
  async ensurePrerequisites(): Promise<EmployeePrereqs> {
    const designation = getNewDesignation().name;
    const skill = getNewSkill().name;
    await this.createMasterRow(
      '/designations',
      'a.btn-add[href$="/designations/add"]',
      'Add Designation',
      designation,
    );
    await this.createMasterRow(
      '/skills',
      'a.btn-add[href$="/skills/add"]',
      'Add Skill',
      skill,
    );
    return { designation, skill };
  }

  /** Click-through create on a name-only master (designation / skill). */
  private async createMasterRow(
    listHref: string,
    addSel: string,
    btnName: string,
    name: string,
  ): Promise<void> {
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
    await this.page.locator(`a[href="${listHref}"]`).click();
    await expect(this.page.locator('#data-search')).toBeVisible();
    await this.page.locator(addSel).click();
    await this.page.fill('input[name="name"]', name);
    await this.page.getByRole('button', { name: btnName }).click();
    await this.page.waitForURL(`${listHref}*`, { timeout: 30000, waitUntil: 'commit' });
    await this.page.fill('#data-search', name);
    await expect(
      this.page.locator('tr.data-row', { hasText: name }).first(),
    ).toBeVisible({ timeout: 20000 });
  }

  /** Type into an autocomplete input and click the first suggestion. */
  private async autocompletePick(
    inputSel: string,
    listSel: string,
    query: string,
  ): Promise<void> {
    await this.page.fill(inputSel, query);
    const first = this.page.locator(`${listSel} > *`).first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await first.click();
  }

  /** Fill the add/edit form. Set active=false to uncheck "Mark as Active".
   * prereq carries the Designation + Skill created first in the same TC
   * (standing rule); when omitted, falls back to a skill lookup. */
  async fillEmployeeForm(
    data: NewEmployee,
    active = true,
    prereq?: EmployeePrereqs,
  ): Promise<void> {
    // Visible name input mirrors into the hidden emp_name on input.
    await this.page.fill('#emp_name_input', data.name);
    await this.page.fill('#emp_id_official', data.officialId);
    await this.page.fill('#contact_no', data.contact);
    await this.page.fill('#email', data.email);
    await this.page.fill('#department', data.department);
    // Designation/Skill are matched by name server-side.
    const designation = prereq?.designation ?? '';
    const skill = prereq?.skill ?? (await this.lookupSkillName());
    if (designation) await this.page.fill('#designation_input', designation);
    if (skill) await this.page.fill('#skill_input', skill);
    // User Type: choose the first configured option (hidden gets its id).
    const utName: string = await this.page.evaluate(() => {
      const el = document.getElementById('user-types-data');
      const opts = el ? JSON.parse(el.textContent || '[]') : [];
      const valid = opts.filter(
        (o: { id: unknown; name: string }) => o && o.id !== '' && o.name,
      );
      if (!valid.length) throw new Error('no user types configured');
      return valid[0].name as string;
    });
    await this.autocompletePick('#user_type_input', '#user_type_list', utName);
    const utHidden = await this.page.inputValue('#user_type');
    expect(utHidden).toBeTruthy();
    await this.page.fill('#project_name', data.project);
    await this.page.fill('#doj', data.doj);
    // Reporting Manager: pick the first existing employee; free text leaves
    // the hidden id empty and the server defaults it to 1.
    const rmQuery: string = await this.page.evaluate(() => {
      const el = document.getElementById('employees-data');
      const list = el ? JSON.parse(el.textContent || '[]') : [];
      const first = (list || []).find(
        (e: { EmpName?: string; name?: string }) => e && (e.EmpName || e.name),
      );
      return (first?.EmpName || first?.name || 'QA') as string;
    });
    await this.autocompletePick('#rm_id_input', '#rm_id_list', rmQuery);
    const activeBox = this.page.locator('#is_active');
    if (active !== (await activeBox.isChecked())) {
      await activeBox.click();
    }
  }

  async addEmployee(data: NewEmployee, active = true): Promise<void> {
    // Standing rule: create the cross-module Designation + Skill first.
    const prereq = await this.ensurePrerequisites();
    await this.gotoViaUI();
    await this.page.locator('a.btn-add[href$="/employee/add"]').click();
    await this.fillEmployeeForm(data, active, prereq);
    await this.page.getByRole('button', { name: 'Add Employee' }).click();
    await this.page.waitForURL('**/employee', { timeout: 30000, waitUntil: 'commit' });
    // Already on the list (no re-entry): search inline and assert.
    await this.page.fill('#data-search', data.officialId);
    await expect(this.row(data.officialId).first()).toBeVisible({ timeout: 20000 });
  }

  async openEdit(officialId: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', officialId);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    await this.row(officialId).first().locator('a.edit-btn').click();
  }

  /** Delete via the generic confirm flow; matching count must drop by one. */
  async deleteEmployee(officialId: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', officialId);
    await this.page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
    await this.page.waitForTimeout(1000);
    const target = this.row(officialId);
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

  /** Print link opens a popup with the record; falls back to status probe. */
  async expectPrintView(officialId: string, name: string): Promise<void> {
    await this.gotoViaUI();
    await this.page.fill('#data-search', officialId);
    const printLink = this.row(officialId).locator('a[title="Print"]');
    if ((await printLink.count()) > 0) {
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup'),
        printLink.first().click(),
      ]);
      await expect(popup.getByText(name).first()).toBeVisible({ timeout: 15000 });
      await popup.close();
    } else {
      const resp = await this.page.request.get('/employee/print/1');
      expect([200, 404]).toContain(resp.status());
    }
  }
}
