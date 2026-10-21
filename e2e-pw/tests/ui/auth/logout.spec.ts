import { test, expect } from '../../../fixtures/test-fixtures';
import { DashboardPage } from '../../../pages/DashboardPage';
import { LogoutPage } from '../../../pages/LogoutPage';
import { saveEvidence } from '../../../utils/evidence';

// Covers KASSIST-548 sub-tasks TC-LO-001..TC-LO-006.
// Evidence rule: PASS screenshot per TC into evidence/ (video via E2E_VIDEO=on).

test('TC-LO-001: sidebar logout lands on the login page', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  await logout.logoutViaSidebar();
  await saveEvidence(adminPage, 'TC-LO-001');
});

test('TC-LO-002: old session is dead server-side after logout', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  const oldSession = await logout.getSessionId();
  await logout.logoutViaSidebar();
  await logout.injectSessionAndGotoHome(oldSession);
  await logout.expectLoginPage();
  await saveEvidence(adminPage, 'TC-LO-002');
});

test('TC-LO-003: back button after logout shows no dashboard', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  await logout.logoutViaSidebar();
  await adminPage.goBack();
  await logout.expectDashboardGone();
  await saveEvidence(adminPage, 'TC-LO-003');
});

test('TC-LO-004: direct /home access after logout is blocked', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  await logout.logoutViaSidebar();
  await logout.gotoHome();
  await logout.expectLoginPage();
  await saveEvidence(adminPage, 'TC-LO-004');
});

test('TC-LO-005: cancelling logout keeps the session', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  await logout.cancelLogout();
  await new DashboardPage(adminPage).expectLoaded();
  await logout.dismissSidebarModal();
  await saveEvidence(adminPage, 'TC-LO-005');
});

test('TC-LO-006: logout on expired session stays graceful', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  await adminPage.context().clearCookies();
  const resp = await adminPage.request.post('/logout', { maxRedirects: 0 });
  expect([303, 302, 200]).toContain(resp.status());
  await logout.gotoHome();
  await logout.expectLoginPage();
  await saveEvidence(adminPage, 'TC-LO-006');
});

test('TC-LO-007: settings-form logout works', async ({ adminPage }) => {
  const logout = new LogoutPage(adminPage);
  await logout.settingsLogout();
  await saveEvidence(adminPage, 'TC-LO-007');
});

test('TC-LO-008: double logout-click stays graceful', async ({
  adminPage,
}) => {
  const logout = new LogoutPage(adminPage);
  await logout.doubleConfirmLogout();
  await saveEvidence(adminPage, 'TC-LO-008');
});
