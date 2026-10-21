import { test, expect } from '@playwright/test';
import { CompanyApi } from '../../api/CompanyApi';
import { env } from '../../config/env';

test('company page should be reachable', async ({ request }) => {
  const api = new CompanyApi(request, env.appUrl);
  const res = await api.listLocations();
  expect([200, 302, 307]).toContain(res.status());
});
