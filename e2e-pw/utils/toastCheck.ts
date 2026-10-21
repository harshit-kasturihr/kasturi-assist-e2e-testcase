import { expect, type Page } from '@playwright/test';
import { caption, readToasts } from './narrate';
import { saveEvidence } from './evidence';

/**
 * Success-toast regression ("No success toast on create/edit" family).
 * `save` must END by clicking the form's submit button; this helper then
 * catches the toast while it is on screen (~2s), screenshots it, and returns
 * its text. The test must call recordToasts(page) before its first navigation.
 */
export async function expectSuccessToast(
  page: Page,
  opts: { save: () => Promise<void>; expect: RegExp; bugKey: string; step: string; evidenceId?: string },
): Promise<string> {
  await opts.save();
  const toast = page.locator('.toast').filter({ hasText: opts.expect }).first();
  const shown = await toast.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (shown && opts.evidenceId) await saveEvidence(page, opts.evidenceId);
  await page.waitForTimeout(500);
  const seen = (await readToasts(page)).filter((t) => opts.expect.test(t));
  const text = seen[0] || '';
  await caption(
    page,
    `${opts.bugKey} · ${opts.step} ${text ? '(TOAST SHOWN - FIXED)' : '(NO TOAST - BUG)'}`,
    text ? `Success toast: "${text}". Landed on ${page.url().replace(/^https?:\/\/[^/]+/, '')}.` : `No success toast. Landed on ${page.url().replace(/^https?:\/\/[^/]+/, '')}.`,
    text ? 'pass' : 'fail',
  );
  if (!text && opts.evidenceId) await saveEvidence(page, opts.evidenceId);
  expect(text, `${opts.step}: success toast`).not.toBe('');
  return text;
}
