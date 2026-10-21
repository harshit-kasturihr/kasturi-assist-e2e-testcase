import { test } from '../../../fixtures/test-fixtures';
import { DashboardPage } from '../../../pages/DashboardPage';
import { CreateUserPage } from '../../../pages/CreateUserPage';
import { getNewLoginUser } from '../../../utils/testData';
import { saveEvidence } from '../../../utils/evidence';

// TC-LOG-002 (KASSIST-551): brand-new user created with random dummy data,
// then first-time login with those credentials.
test('TC-LOG-002: new user first-time login succeeds', async ({
  page,
  loginPage,
  adminPage,
}) => {
  const user = getNewLoginUser();

  await new CreateUserPage(adminPage).createUser(user);
  await saveEvidence(adminPage, 'TC-LOG-002-create');

  await loginPage.login(user.username, user.password);
  await new DashboardPage(page).expectLoaded();
  await saveEvidence(page, 'TC-LOG-002');
});
