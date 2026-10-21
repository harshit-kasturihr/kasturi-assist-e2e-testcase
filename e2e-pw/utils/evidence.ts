import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
export const EVIDENCE_DIR = path.resolve(path.dirname(__filename), '..', 'evidence');

/**
 * PASS screenshot for a Test Case. Deterministic path so it can be
 * attached to the Jira sub-task before PASS is recorded.
 */
export async function saveEvidence(page: Page, tcId: string): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shot = path.join(EVIDENCE_DIR, `${tcId}-pass.png`);
  // Narrated evidence runs: capture the viewport so the on-screen step
  // caption and any error/toast are part of the screenshot.
  if (process.env.E2E_NARRATE === 'on') {
    await page.screenshot({ path: shot, animations: 'disabled' });
    return shot;
  }
  // Table-region capture first: far cheaper than a page capture, and specs
  // always narrow to the verified row via search, so it is proof enough.
  // Retries ride out transient renderer starvation; viewport is fallback.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const table = page.locator('table').first();
      await table.waitFor({ state: 'visible', timeout: 10000 });
      await table.screenshot({ path: shot, animations: 'disabled', timeout: 20000 });
      return shot;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  await page.screenshot({
    path: shot,
    animations: 'disabled',
    timeout: 30000,
  });
  return shot;
}
