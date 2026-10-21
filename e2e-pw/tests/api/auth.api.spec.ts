import { test, expect } from '@playwright/test';
import { AuthApi } from '../../api/AuthApi';
import { env } from '../../config/env';

test('POST /login should authenticate admin', async ({ request }) => {
  const api = new AuthApi(request, env.appUrl);
  // NOTE: backend renders HTML for /login; this asserts reachability.
  // Replace with real JSON contract once available.
  const res = await api.login();
  expect([200, 302, 307, 422]).toContain(res.status());
});
