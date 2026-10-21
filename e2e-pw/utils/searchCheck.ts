import { expect, type Locator, type Page } from '@playwright/test';
import { caption, highlight } from './narrate';
import { saveEvidence } from './evidence';

/**
 * Multi-word search regression ("tag soup", KASSIST-983 family): search a
 * multi-word name ending in a short word and assert the matching row renders
 * as clean text — no literal <span>/class= fragments from the highlighter.
 * The caller has already created the record and opened its list page.
 */
export async function expectCleanMultiWordSearch(
  page: Page,
  opts: { name: string; row: (name: string) => Locator; bugKey: string; tcId: string; screen: string },
): Promise<void> {
  const { name, row, bugKey, tcId, screen } = opts;
  await page.fill('#data-search', name);
  await page.waitForURL(/search=/, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(1500);
  const target = row(name).first();
  await expect(target).toBeVisible({ timeout: 20000 });
  const text = ((await target.innerText()) || '').replace(/\s+/g, ' ').trim();
  const soup = /class=|search-highlight|<\/?span|an>|"\s*>/i.test(text);
  await highlight(page, `tbody tr:has-text("${name}")`, soup ? '#f04438' : '#12b76a');
  await caption(
    page,
    `${bugKey} · ${screen}: search "${name}" ${soup ? '(TAG SOUP - BUG)' : '(CLEAN - FIXED)'}`,
    `Multi-word search on the ${screen} list. Row shows: ${text.slice(0, 170)}`,
    soup ? 'fail' : 'pass',
  );
  await saveEvidence(page, tcId);
  expect(soup, 'no literal span/class fragments in the row').toBe(false);
  expect(text).toContain(name);
}
