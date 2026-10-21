import { test, expect } from '../../../fixtures/test-fixtures';
import { getAdminUser } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

test('should login and navigate to Kasturi Assist dashboard', async ({
  page,
  loginPage,
  dashboardPage,
}) => {
  const admin = getAdminUser();
  await loginPage.login(admin.username, admin.password);
  await dashboardPage.expectLoaded();
  await saveEvidence(page, 'TC-LOG-001');
});

test('admin session fixture should land on dashboard', async ({ adminPage }) => {
  await expect(
    adminPage.locator('//h1[contains(.,"Dashboard")]'),
  ).toBeVisible();
});
