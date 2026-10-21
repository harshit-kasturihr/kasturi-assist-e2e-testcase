import { test, expect } from '../../../fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { DashboardPage } from '../../../pages/DashboardPage';
import { CreateUserPage } from '../../../pages/CreateUserPage';
import { UserListPage } from '../../../pages/UserListPage';
import { getAdminUser, getNewLoginUser } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';
import { caption, highlight, recordToasts, readToasts } from '../../../utils/narrate';

// Covers KASSIST-636 sub-tasks TC-USR-001..TC-USR-007.
// TC-USR-005 is conditional: passes only when the user limit is actually
// reached (cannot be fabricated); otherwise it skips with reason.
// Evidence rule: screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-USR-001: list search filters correctly', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  await users.createUser(data);
  const list = new UserListPage(adminPage);
  await list.expectRowVisible(data.username);
  // Toolbar (client-side) filter must also narrow to the same row.
  await list.gotoViaUI();
  await list.search(data.username);
  await expect(list.row(data.username).first()).toBeVisible();
  await saveEvidence(adminPage, 'TC-USR-001');
});

test('TC-USR-002: pagination works', async ({ adminPage }) => {
  const list = new UserListPage(adminPage);
  if (!(await list.expectPageTwoDiffers())) {
    test.skip(true, 'Only one page of users — pager has no page 2.');
  }
  await saveEvidence(adminPage, 'TC-USR-002');
});

test('TC-USR-003: edit flow saves and reflects', async ({ adminPage }) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  await users.createUser(data);
  const list = new UserListPage(adminPage);
  await list.openEdit(data.username);
  const updated = `QA Edited ${Date.now().toString().slice(-5)}`;
  await users.fillEditContact(updated);
  await users.saveExpectUpdated();
  await list.expectRowVisible(updated);
  await saveEvidence(adminPage, 'TC-USR-003');
});

test('TC-USR-004: deactivate-reactivate login round-trip', async ({
  page,
  loginPage,
  adminPage,
}) => {
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  await users.createUser(data);
  await users.deactivateUser(data.username);
  await loginPage.attemptLogin(data.username, data.password);
  await loginPage.expectDeactivatedError();
  await users.activateUser(data.username);
  await loginPage.login(data.username, data.password);
  await new DashboardPage(page).expectLoaded();
  await saveEvidence(page, 'TC-USR-004');
});

test('TC-USR-005: limit-reached disables Create', async ({ adminPage }) => {
  const list = new UserListPage(adminPage);
  if (!(await list.isAddDisabled())) {
    test.skip(true, 'User limit not reached — gate cannot be fabricated.');
  }
  await expect(
    adminPage.locator('span.btn-add[style*="not-allowed"]'),
  ).toBeVisible();
  await saveEvidence(adminPage, 'TC-USR-005');
});
test('TC-USR-006: non-priv actor sees no admin roles (least privilege)', async ({
  page,
  loginPage,
  adminPage,
}) => {
  // Correction (was: submit + expect blocked message): the server filters
  // user-types by actor role, so admin options are never rendered for a
  // non-privileged user — escalation is impossible at the UI layer itself.
  // This TC locks that design decision.
  const users = new CreateUserPage(adminPage);
  const data = getNewLoginUser();
  await users.createUser(data);
  await loginPage.login(data.username, data.password);
  // Click-through as the non-priv user (navigation rule): dashboard →
  // Master → User Accounts → Add. If RBAC hides any step, that IS the
  // least-privilege guard working — record which level blocked.
  await page.goto('/home');
  const masterToggle = page.locator('button[data-tour="panel-master"]');
  if (!(await masterToggle.isVisible())) {
    await saveEvidence(page, 'TC-USR-006');
    return; // Master group hidden for this role: PASS by nav-level guard.
  }
  await masterToggle.click();
  const usersLink = page.locator('a[href$="/account_creation"]');
  if (!(await usersLink.isVisible())) {
    await saveEvidence(page, 'TC-USR-006');
    return; // List link hidden for this role: PASS by nav-level guard.
  }
  await usersLink.click();
  const addBtn = page.locator('a.btn-add[href$="/create-user"]');
  if (!(await addBtn.isVisible())) {
    await saveEvidence(page, 'TC-USR-006');
    return; // Add hidden for this role: PASS by nav-level guard.
  }
  await addBtn.click();
  // Let the navigation settle before touching the DOM — otherwise the
  // evaluate races an in-flight load ("execution context destroyed").
  await expect(page.locator('#usertype')).toBeVisible();
  const labels: string[] = await page
    .locator('#usertype option')
    .evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()).filter(Boolean),
    );
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.filter((l) => /admin/i.test(l))).toEqual([]);
  await saveEvidence(page, 'TC-USR-006');
});

test('TC-USR-007: customer-type company field is conditional', async ({
  adminPage,
}) => {
  const users = new CreateUserPage(adminPage);
  await users.openCreateForm();
  await adminPage.selectOption('#usertype', '5');
  const group = adminPage.locator('#company-group');
  await expect(group).toBeVisible();
  await expect(adminPage.locator('#emp_cust_id')).toHaveAttribute('required', '');
  await adminPage.selectOption('#usertype', await usableNonCustomerType(adminPage));
  await expect(group).toBeHidden();
  await saveEvidence(adminPage, 'TC-USR-007');
});

test('TC-USR-008: reactivation beyond limit is blocked', async ({
  adminPage,
}) => {
  test.slow();
  await recordToasts(adminPage);
  // Full quota-state chain, click-through only (navigation rule).
  // No user is CREATED here (quota is full by precondition) — the victim
  // is an existing active e2e dummy, so the test is self-contained:
  // 1. limit-full  → Add disabled (prove it)
  // 2. deactivate victim via row edit → Add enabled (slot freed)
  // 3. create newcomer via Add button → Add disabled again (slot filled)
  // 4. reactivate victim → MUST stay blocked, else quota bypass (Bug).
  const users = new CreateUserPage(adminPage);
  const list = new UserListPage(adminPage);

  // 1. limit-full → Add disabled (prove it). Single sidebar entry; the
  // helpers below land back on this list after each save, so no re-entry.
  await list.gotoViaUI();
  await expect(
    adminPage.locator('span.btn-add[style*="not-allowed"]'),
  ).toBeVisible();

  // 2. deactivate victim via row edit → lands on list → Add enabled.
  const victim = await users.deactivateFirstE2EUser();
  if (!victim) {
    test.skip(true, 'No active e2e dummy available to free a quota slot.');
  }
  await expect(
    adminPage.locator('a.btn-add[href$="/create-user"]'),
  ).toBeVisible();

  // 3. create newcomer via Add button → lands on list → Add disabled again.
  const newcomer = getNewLoginUser();
  await users.createUser(newcomer);
  await expect(
    adminPage.locator('span.btn-add[style*="not-allowed"]'),
  ).toBeVisible();

  await caption(adminPage, 'KASSIST-647 · Step 1', `Quota full. Freed a slot by deactivating ${victim}, then filled it by creating ${newcomer.username}. Add New User is disabled again.`);
  await caption(adminPage, 'KASSIST-647 · Step 2', `Edit ${victim} → untick "Is Deactivated?" → Update User (this would exceed the quota).`);
  const outcome = await users.tryReactivate(victim as string);
  await adminPage.waitForTimeout(800);
  const toasts = await readToasts(adminPage);
  const limitToast = toasts.find((t) => /user limit/i.test(t)) || '';
  await adminPage.screenshot({ path: 'evidence/TC-USR-008-toast.png' });
  await new UserListPage(adminPage).search(victim as string);
  await adminPage.waitForTimeout(1500);
  const victimRow = ((await adminPage.locator('tbody tr', { hasText: victim as string }).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  console.log(`TC-USR-008 outcome=${outcome} toasts=${JSON.stringify(toasts)} victimRow="${victimRow}"`);
  const blocked = outcome === 'blocked' && !!limitToast;
  await caption(
    adminPage,
    `KASSIST-647 · Result ${blocked ? '(BLOCKED - FIXED)' : '(BUG)'}`,
    `${limitToast ? `Message: "${limitToast}"` : 'No limit message shown.'} ${victim} row now: ${victimRow}`,
    blocked ? 'pass' : 'fail',
  );
  // Allowed = quota bypass defect; blocked = gate works.
  expect(outcome).toBe('blocked');
  expect(limitToast, 'limit message shown on reactivation').not.toBe('');
  await saveEvidence(adminPage, 'TC-USR-008');
});

test('TC-USR-009: sorting reorders list rows', async ({ adminPage }) => {
  const list = new UserListPage(adminPage);
  const asc = await list.sortAndReadFirstColumn('asc');
  const desc = await list.sortAndReadFirstColumn('desc');
  // Direction toggle must reorder (exact collation is app-defined;
  // numeric-aware vs code-unit both acceptable — consistency is the assert).
  expect(asc.length).toBeGreaterThan(1);
  expect(desc).toEqual([...asc].reverse());
  await saveEvidence(adminPage, 'TC-USR-009');
});

test('TC-USR-010: pager First/Last links navigate', async ({ adminPage }) => {
  const list = new UserListPage(adminPage);
  const lastFirst = await list.pagerGoTo('Last');
  expect(lastFirst.length).toBeGreaterThan(0);
  const firstFirst = await list.pagerGoTo('First');
  expect(firstFirst.length).toBeGreaterThan(0);
  expect(firstFirst).not.toBe(lastFirst);
  await saveEvidence(adminPage, 'TC-USR-010');
});

async function usableNonCustomerType(page: Page): Promise<string> {
  const options = page.locator('#usertype option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const v = ((await options.nth(i).getAttribute('value')) || '').trim();
    if (!v || v === '5') continue;
    const label = ((await options.nth(i).textContent()) || '').trim();
    if (/admin/i.test(label)) continue;
    return v;
  }
  throw new Error('No non-customer, non-admin user type available.');
}

test('TC-USR-011: quota full blocks direct /create-user page and POST (KASSIST-645)', async ({ adminPage }) => {
  test.setTimeout(900000);
  await recordToasts(adminPage);
  const users = new CreateUserPage(adminPage);
  const list = new UserListPage(adminPage);
  const shot = (n: string) => adminPage.screenshot({ path: `evidence/TC-USR-011-${n}.png` });

  // Step 0: fill the quota with e2e users via the normal Add button.
  let created = 0;
  for (; created < 40 && !(await list.isAddDisabled()); created++) {
    await users.createUser(getNewLoginUser());
  }
  console.log(`TC-USR-011: created ${created} e2e user(s) to reach the quota`);
  await list.gotoViaUI();
  const disabled = adminPage.locator('span.btn-add[style*="not-allowed"]');
  await expect(disabled).toBeVisible();
  const notice = (await adminPage.locator('body').innerText()).match(/Your package allows only[^.]*\.[^.]*\./)?.[0] || '';
  await highlight(adminPage, 'span.btn-add', '#1d3a8a');
  await caption(adminPage, 'KASSIST-645 · Step 1 · Precondition', `User quota is full (${created} e2e user(s) created to fill it). Add New User is disabled. ${notice}`);
  await shot('step1-quota-full');

  // Step 2: open /create-user directly by URL.
  await adminPage.goto('/create-user');
  await adminPage.waitForLoadState('domcontentloaded');
  await adminPage.waitForTimeout(800);
  const getToast = (await readToasts(adminPage)).find((t) => /user limit/i.test(t)) || '';
  const urlAfterGet = adminPage.url();
  const formShown = (await adminPage.locator('input[name="password"]').count()) > 0;
  console.log(`TC-USR-011 GET /create-user -> ${urlAfterGet} formShown=${formShown}`);
  await caption(
    adminPage,
    `KASSIST-645 · Step 2 · Direct URL /create-user ${!formShown ? '(BLOCKED - FIXED)' : '(NOT blocked - BUG)'}`,
    `Typed /create-user in the address bar. Redirected to ${urlAfterGet.replace(/^https?:\/\/[^/]+/, '')}; create form shown: ${formShown ? 'YES' : 'no'}.${getToast ? ` Message: "${getToast}"` : ''}`,
    !formShown ? 'pass' : 'fail',
  );
  await shot('step2-direct-url');

  // Step 3: submit a create straight to the server (no page), as a script would.
  const probe = getNewLoginUser();
  await list.gotoViaUI();
  const post = await adminPage.evaluate(async (u) => {
    const token = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content
      || (document.querySelector('input[name="csrf_token"]') as HTMLInputElement | null)?.value || '';
    const sel = document.createElement('select');
    const body = new URLSearchParams({ csrf_token: token, username: u.username, empcode: u.empcode, emp_cust_id: '', password: 'Qa1!Strong9x', confirm_password: 'Qa1!Strong9x', usertype: '31' });
    const r = await fetch('/create-user', { method: 'POST', body, redirect: 'follow', headers: { 'x-csrf-token': token } });
    void sel;
    return { status: r.status, url: r.url, redirected: r.redirected };
  }, probe);
  console.log(`TC-USR-011 POST /create-user -> ${JSON.stringify(post)}`);
  await list.search(probe.username).catch(() => null);
  await adminPage.waitForTimeout(1500);
  const rows = await adminPage.locator('tbody tr', { hasText: probe.username }).count();
  await caption(
    adminPage,
    `KASSIST-645 · Step 3 · Direct POST /create-user ${rows === 0 ? '(BLOCKED - FIXED)' : '(USER CREATED - BUG)'}`,
    `Sent the create request straight to the server for ${probe.username}. Response: ${post.status} -> ${post.url.replace(/^https?:\/\/[^/]+/, '')}. User in list: ${rows ? 'YES' : 'no'}.`,
    rows === 0 ? 'pass' : 'fail',
  );
  await shot('step3-direct-post');
  await saveEvidence(adminPage, 'TC-USR-011');
  expect(formShown, 'create form must not render when quota is full').toBe(false);
  expect(rows, 'direct POST must not create a user when quota is full').toBe(0);
  expect(post.url, 'POST must be refused by the quota check').toContain('limit_reached=create');
});
