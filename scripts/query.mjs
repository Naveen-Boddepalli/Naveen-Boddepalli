#!/usr/bin/env node
// "Query my profile": runs a visitor's SQL (from an issue titled `sql: ...`) on
// the QueryLens engine against live profile data, writes the result image to
// the `query` branch worktree, and replies on the issue.
//
//   node scripts/query.mjs --dir q                    in CI (see .github/workflows/query.yml)
//   node scripts/query.mjs --dir /tmp/q --sample --sql "SELECT ..." [--author someone]
//
// Untrusted input (the issue title) only ever arrives through the TITLE env
// var and is treated as data: it is vetted by guard.mjs, run in a worker with a
// time limit, and escaped wherever it is written.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { fetchProfile, normalize } from './data.mjs';
import { sampleResponse } from './sample.mjs';
import { check, SCHEMA } from './query/guard.mjs';
import { loadTheme } from './themes/index.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };

const cfg = JSON.parse(await readFile(new URL('./profile.config.json', import.meta.url), 'utf8'));
const login = process.env.PROFILE_LOGIN || cfg.login;
cfg.login = login;
const svg = await loadTheme(opt('theme', cfg.theme));
const dir = opt('dir', 'q');
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || `${login}/${login}`;
const issue = process.env.ISSUE_NUMBER ? Number(process.env.ISSUE_NUMBER) : null;
const now = new Date();

const PER_USER_SECONDS = 120;
const PER_HOUR_TOTAL = 40;
const TIMEOUT_MS = 3000;

// ── what to run, and for whom ───────────────────────────────────────────────
const title = opt('sql', null) !== null ? `sql: ${opt('sql')}` : process.env.TITLE;
const author = opt('author', process.env.AUTHOR || '') || null;
const fromVisitor = Boolean(title);
const rawSql = fromVisitor ? title.replace(/^\s*sql:\s*/i, '') : cfg.queries[0].sql;

// ── data and history ────────────────────────────────────────────────────────
const resp = flag('sample') ? sampleResponse(now) : await fetchProfile(login, token, now);
const data = normalize(resp, cfg, now);
await mkdir(dir, { recursive: true });
const logPath = join(dir, 'log.json');
let log = [];
try { log = JSON.parse(await readFile(logPath, 'utf8')); } catch { /* first run */ }

function rateLimited() {
  if (!fromVisitor || !author || author.toLowerCase() === login.toLowerCase()) return null;
  const recent = log.filter((e) => now - new Date(e.at) < 3600_000);
  if (recent.length >= PER_HOUR_TOTAL) return 'Lots of people are querying right now. Try again in an hour.';
  const mine = recent.find((e) => e.author === author && now - new Date(e.at) < PER_USER_SECONDS * 1000);
  return mine ? `One query every ${PER_USER_SECONDS / 60} minutes per person, please. Try again shortly.` : null;
}

function runInWorker(sql) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./query/worker.mjs', import.meta.url), { workerData: { sql, tables: data.tables } });
    const timer = setTimeout(() => {
      w.terminate();
      resolve({ rows: [], error: { message: `The query ran longer than ${TIMEOUT_MS / 1000} s and was stopped.`, hint: 'Try a narrower query, or one without a join.' }, stages: [], ms: TIMEOUT_MS });
    }, TIMEOUT_MS);
    w.once('message', (m) => { clearTimeout(timer); resolve(m); w.terminate(); });
    w.once('error', (e) => { clearTimeout(timer); resolve({ rows: [], error: { message: `The engine crashed: ${e.message}`, hint: null }, stages: [], ms: 0 }); });
  });
}

// ── run ─────────────────────────────────────────────────────────────────────
let outcome; // { kind: 'rejected', reason } | { kind: 'ran', q }
const limited = rateLimited();
const verdict = limited ? { ok: false, reason: limited } : check(rawSql, data.tables);
if (!verdict.ok) {
  outcome = { kind: 'rejected', reason: verdict.reason };
} else {
  const r = await runInWorker(verdict.sql);
  const error = r.wrote ? { message: 'Only SELECT and EXPLAIN queries run here.', hint: null } : r.error;
  const columns = r.rows.length ? Object.keys(r.rows[0]) : [];
  outcome = {
    kind: 'ran',
    q: { sql: verdict.sql, author: fromVisitor ? author : null, at: now.toISOString(), rows: error ? [] : r.rows, columns, error, stages: r.stages, ms: r.ms },
  };
}

// ── write the result image and the log ──────────────────────────────────────
if (outcome.kind === 'ran') {
  // a theme may adjust its tokens to the data (wizarding: house colours), as in build.mjs
  const tokens = svg.prepare?.(data, cfg, now) ?? svg.THEMES;
  for (const theme of ['dark', 'light']) {
    await writeFile(join(dir, `query-result-${theme}.svg`), svg.queryResult(outcome.q, tokens[theme]));
  }
  await writeFile(join(dir, 'last-query.json'), JSON.stringify(outcome.q, null, 2) + '\n');
}
if (fromVisitor) {
  // Rejected SQL is never stored: only accepted queries are vetted to be safe to show.
  log.push({ at: now.toISOString(), author, sql: outcome.kind === 'ran' ? outcome.q.sql : null, ok: outcome.kind === 'ran' && !outcome.q.error });
  log = log.slice(-200);
  await writeFile(logPath, JSON.stringify(log, null, 2) + '\n');
}

// ── reply on the issue ──────────────────────────────────────────────────────
const mdCell = (v) => (v === null || v === undefined ? '*NULL*' : String(v).replace(/[|\\`*_<>[\]]/g, (c) => `\\${c}`).replace(/\s+/g, ' '));

function replyBody() {
  const tables = Object.entries(SCHEMA).map(([t, cols]) => `- \`${t}\` (${cols.join(', ')})`).join('\n');
  if (outcome.kind === 'rejected') {
    return `This query didn't run: ${outcome.reason}\n\nYou can query these tables:\n${tables}\n\nQueries may only use SQL keywords, these table and column names, numbers, and values that appear in the data. Open a new issue with a title starting with \`sql:\` to try again.`;
  }
  const q = outcome.q;
  let out = `\`\`\`sql\nnaveen=# ${q.sql}\n\`\`\`\n`;
  if (q.error) {
    out += `**ERROR:** ${mdCell(q.error.message)}\n${q.error.hint ? `\n**HINT:** ${mdCell(q.error.hint)}\n` : ''}`;
  } else if (q.rows.length) {
    const shown = q.rows.slice(0, 25);
    out += `| ${q.columns.map(mdCell).join(' | ')} |\n| ${q.columns.map(() => '---').join(' | ')} |\n`;
    out += shown.map((r) => `| ${q.columns.map((c) => mdCell(r[c])).join(' | ')} |`).join('\n') + '\n';
    out += `\n(${q.rows.length} row${q.rows.length === 1 ? '' : 's'}${q.rows.length > shown.length ? `, first ${shown.length} shown` : ''})\n`;
  } else {
    out += '(0 rows)\n';
  }
  out += `\nRan on [QueryLens](https://github.com/${login}/query-lens): ${q.stages.join(' → ')} in ${q.ms.toFixed(1)} ms. `;
  out += `The result will show on [the profile](https://github.com/${login}) within a minute. Thanks for querying!`;
  return out;
}

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { Authorization: `bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'profile-query', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`GitHub API ${method} ${path} failed: HTTP ${res.status}`);
}

const body = replyBody();
if (issue && token && !flag('sample')) {
  await gh('POST', `/issues/${issue}/comments`, { body });
  await gh('PATCH', `/issues/${issue}`, { state: 'closed', state_reason: outcome.kind === 'ran' ? 'completed' : 'not_planned' });
} else if (flag('print-reply')) {
  console.log('\n--- reply ---\n' + body + '\n-------------');
}

console.log(outcome.kind === 'ran'
  ? `Ran: ${outcome.q.sql} -> ${outcome.q.error ? 'ERROR ' + outcome.q.error.message : outcome.q.rows.length + ' rows'} in ${outcome.q.ms.toFixed(1)} ms`
  : `Rejected: ${outcome.reason}`);
