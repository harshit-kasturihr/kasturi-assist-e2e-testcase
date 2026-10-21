import { test } from '../../../fixtures/test-fixtures';
import { getValidLocation } from '../../../utils/testData';
import { LocationPage } from '../../../pages/LocationPage';

// Migrated from tests/master/my-company/add-location.spec.ts
test('should be added the company location', async ({ adminPage }) => {
  const location = getValidLocation();
  await new LocationPage(adminPage).addLocation(location);
});
