import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Load order (lowest -> highest priority):
// 1. repo root ../../.env (existing behaviour)
// 2. config/<TEST_ENV>.env (dev.env / qa.env)
// 3. process env (CI secrets win)
dotenv.config({ path: path.resolve(ROOT, '../../.env') });

const testEnv = process.env.TEST_ENV ?? 'dev';
dotenv.config({
  path: path.resolve(ROOT, 'config', `${testEnv}.env`),
});

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  // Root .env has APP_URL="http://..." with stray spaces/quotes
  return value.trim().replace(/^["']|["']$/g, '').trim() || undefined;
}

export const env = {
  testEnv,
  appUrl: clean(process.env.APP_URL) ?? 'http://localhost:5003',
  adminUsername:
    clean(process.env.ADMIN_USERNAME) ?? 'ABC@self.com',
  adminPassword: clean(process.env.ADMIN_PASSWORD) ?? '1234',
};

export default env;
