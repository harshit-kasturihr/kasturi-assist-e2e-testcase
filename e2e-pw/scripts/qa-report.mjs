#!/usr/bin/env node
// QA HTML report from allure-playwright results + tests/e2e-pw/evidence.
// No Java needed (allure-commandline alternative for this repo).
// Usage: node scripts/qa-report.mjs [--out reports/qa-report.html]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'allure-results');
const EVIDENCE = path.join(ROOT, 'evidence');

const outArg = process.argv.indexOf('--out');
const dayArg = process.argv.indexOf('--day');
// Day-wise report: --day YYYY-MM-DD (default: today, local time).
const DAY = dayArg > -1
  ? process.argv[dayArg + 1]
  : (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
    })();
const OUT = path.resolve(
  ROOT,
  outArg > -1 ? process.argv[outArg + 1] : `reports/qa-report-${DAY}.html`,
);

// TC-ID -> { subtask, story, bug } (+ epic via story). Maintained in
// test-data/jira-traceability.json so the report links Jira natively.
let JIRA = { baseUrl: '', epics: {}, stories: {}, cases: {} };
try {
  JIRA = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'test-data', 'jira-traceability.json'), 'utf-8'),
  );
} catch {
  /* no map — Jira column stays empty */
}

const jlink = (key) =>
  key
    ? `<a href="${esc(JIRA.baseUrl)}/browse/${esc(key)}" target="_blank">${esc(key)}</a>`
    : '—';

function jiraCell(id) {
  const c = JIRA.cases[id];
  if (!c) return '—';
  const story = JIRA.stories[c.story];
  const epicKey = story ? story.epic : '';
  const epicTitle = epicKey && JIRA.epics[epicKey] ? ` (${esc(JIRA.epics[epicKey])})` : '';
  const bug = c.bug
    ? `<br>🐞 ${jlink(c.bug)}`
    : '';
  return `${jlink(c.subtask)}<br><small>${jlink(c.story)} → ${jlink(epicKey)}${epicTitle}</small>${bug}`;
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function loadResults() {
  if (!fs.existsSync(RESULTS)) return [];
  return fs
    .readdirSync(RESULTS)
    .filter((f) => f.endsWith('-result.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((r) => r.stage === 'finished');
}

function tcId(name) {
  const m = String(name || '').match(/TC-[A-Z]+-\d+/);
  return m ? m[0] : '';
}

function evidenceLinks(id) {
  if (!id || !fs.existsSync(EVIDENCE)) return [];
  return fs
    .readdirSync(EVIDENCE)
    .filter((f) => f.startsWith(id + '-') && /\.(png|webm)$/.test(f))
    .sort()
    .map((f) => ({ file: f, kind: f.endsWith('.png') ? 'Screenshot' : 'Video' }));
}

// Latest result per test (historyId), optionally restricted to one day,
// so reruns don't double-count and reports stay day-wise.
const seen = new Map();
for (const r of loadResults()) {
  if (DAY) {
    const d = new Date(r.start || 0);
    const rday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    if (rday !== DAY) continue;
  }
  const key = r.historyId || r.fullName || r.uuid;
  const prev = seen.get(key);
  if (!prev || (r.stop || 0) > (prev.stop || 0)) seen.set(key, r);
}
const tests = [...seen.values()].sort((a, b) => (a.start || 0) - (b.start || 0));

const counts = { passed: 0, failed: 0, skipped: 0, broken: 0 };
for (const t of tests) {
  const s = t.status;
  if (counts[s] === undefined) counts[s] = 0;
  counts[s] += 1;
}
const total = tests.length;
const passRate = total ? Math.round((counts.passed / total) * 100) : 0;

const groups = new Map();
for (const t of tests) {
  const file = (t.fullName || '').split(' › ')[0] || 'unknown';
  if (!groups.has(file)) groups.set(file, []);
  groups.get(file).push(t);
}

const badge = (s) =>
  `<span class="badge ${esc(s)}">${esc(s).toUpperCase()}</span>`;

let sections = '';
for (const [file, list] of groups) {
  let rows = '';
  for (const t of list) {
    const id = tcId(t.name);
    const dur = t.stop && t.start ? ((t.stop - t.start) / 1000).toFixed(1) + 's' : '—';
    const err =
      t.statusDetails && (t.statusDetails.message || t.statusDetails.trace)
        ? `<details><summary>error</summary><pre>${esc(
            (t.statusDetails.message || '') + '\n' + (t.statusDetails.trace || ''),
          ).slice(0, 2000)}</pre></details>`
        : '';
    const ev = evidenceLinks(id)
      .map(
        (e) =>
          `<a href="../evidence/${esc(e.file)}" target="_blank">${esc(e.kind)}</a>`,
      )
      .join(' · ');
    rows += `<tr><td>${badge(t.status)}</td><td><b>${esc(id)}</b> ${esc(
      t.name.replace(id, '').replace(/^[:\s-]+/, ''),
    )}${err}</td><td>${dur}</td><td>${ev || '—'}</td><td>${jiraCell(id)}</td></tr>`;
  }
  sections += `<h2>${esc(file)} <small>(${list.length})</small></h2>
<table><thead><tr><th>Status</th><th>Test</th><th>Time</th><th>Evidence</th><th>Jira</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>KASSIST QA Report</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#1f2937}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:12px 18px;min-width:110px}
.card b{font-size:1.6rem;display:block}
.badge{border-radius:6px;padding:2px 8px;font-size:.75rem;font-weight:700;color:#fff;background:#6b7280}
.badge.passed{background:#16a34a}.badge.failed{background:#dc2626}
.badge.skipped{background:#d97706}.badge.broken{background:#7c3aed}
table{border-collapse:collapse;width:100%;margin-bottom:28px}
th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f9fafb}small{color:#6b7280;font-weight:400}
pre{background:#f3f4f6;padding:8px;border-radius:6px;overflow:auto;max-height:220px}
a{color:#2563eb}
</style></head><body>
<h1>KASSIST QA Report — ${esc(DAY)}</h1>
<p>Generated: ${esc(new Date().toString())} · Source: allure-results (${total} latest-per-test on ${esc(DAY)})</p>
<div class="cards">
<div class="card"><b>${total}</b>Total</div>
<div class="card"><b>${counts.passed}</b>Passed</div>
<div class="card"><b>${counts.failed}</b>Failed</div>
<div class="card"><b>${counts.skipped}</b>Skipped</div>
<div class="card"><b>${passRate}%</b>Pass rate</div>
</div>
${sections}
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`QA report: ${OUT} (${total} tests, ${passRate}% pass)`);
