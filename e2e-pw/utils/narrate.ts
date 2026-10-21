import type { Page } from '@playwright/test';

// Evidence-video narration. No-ops unless E2E_NARRATE=on, so regular runs
// stay fast; bug retests run with E2E_NARRATE=on E2E_VIDEO=on to produce a
// self-explanatory video (step captions + highlighted elements + pauses).
const ON = process.env.E2E_NARRATE === 'on';

export type Tone = 'info' | 'fail' | 'pass';

/** Show a caption banner at the top of the page and pause so it is readable. */
export async function caption(page: Page, label: string, text: string, tone: Tone = 'info'): Promise<void> {
  if (!ON) return;
  const bg = tone === 'fail' ? '#b42318' : tone === 'pass' ? '#067647' : '#1d3a8a';
  // A search/redirect may still be navigating — settle first and retry, so
  // the caption isn't wiped (or the evaluate destroyed) mid-navigation.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForLoadState('domcontentloaded').catch(() => null);
    await page.waitForTimeout(300);
    try {
      await drawCaption(page, label, text, bg);
      break;
    } catch {
      if (attempt === 2) return;
    }
  }
  await page.waitForTimeout(3500);
}

async function drawCaption(page: Page, label: string, text: string, bg: string): Promise<void> {
  await page.evaluate(({ label, text, bg }) => {
    document.getElementById('qa-caption')?.remove();
    const d = document.createElement('div');
    d.id = 'qa-caption';
    d.style.cssText = `position:fixed;left:calc(50% + 135px);top:12px;transform:translateX(-50%);z-index:2147483647;max-width:880px;width:calc(100% - 320px);background:${bg};color:#fff;font:600 18px/1.4 system-ui,sans-serif;padding:14px 20px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none`;
    const l = document.createElement('div');
    l.style.cssText = 'font-size:13px;letter-spacing:.08em;opacity:.85;text-transform:uppercase';
    l.textContent = label;
    const t = document.createElement('div');
    t.textContent = text;
    d.append(l, t);
    document.body.appendChild(d);
  }, { label, text, bg });
}

/** Outline an element so the viewer sees what is being used. */
export async function highlight(page: Page, selector: string, color = '#f04438'): Promise<void> {
  if (!ON) return;
  await page.locator(selector).first().evaluate((el, color) => {
    (el as HTMLElement).style.outline = `4px solid ${color}`;
    (el as HTMLElement).style.outlineOffset = '3px';
  }, color, { timeout: 3000 }).catch(() => null); // an absent element must not stall the test
}

/**
 * Record every toast the app shows (they vanish after ~2s and the app then
 * strips the ?flag from the URL). Call once per test before navigating.
 */
export async function recordToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __toasts: string[] }).__toasts = seen;
    new MutationObserver(() => {
      document.querySelectorAll('.toast').forEach((t) => {
        const txt = (t.textContent || '').trim();
        if (txt && !seen.includes(txt)) seen.push(txt);
      });
    }).observe(document, { childList: true, subtree: true });
  });
}

/** Toasts seen on the CURRENT page since it loaded. */
export async function readToasts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __toasts?: string[] }).__toasts || []);
}
