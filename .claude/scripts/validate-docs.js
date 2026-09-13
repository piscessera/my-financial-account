#!/usr/bin/env node
// validate-docs — mechanical checks for docs/ so audits don't spend model tokens on them.
// Usage: node .claude/scripts/validate-docs.js [--strict]   (exit 1 on any error; warnings
// become errors with --strict). Run in dev-review audit mode, at phase gates, and pre-commit.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const TYPES = ['REQ', 'ANA', 'TC', 'PROTO', 'PLAN', 'GAP', 'REV', 'IMPL'];
const STATUSES = new Set(['draft', 'active', 'implemented', 'superseded', 'archived', 'parked', 'final', 'closed']);
const strict = process.argv.includes('--strict');
const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => (strict ? errors : warns).push(m);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  if (fm.links) fm.links = (fm.links.match(/[A-Z]+-\d{4}/g) || []);
  return fm;
}

// ---- 1. collect docs ------------------------------------------------------------------
const files = walk(DOCS).filter((f) => f.endsWith('.md') && !/90-daily-logs|INDEX\.md|PARKING-LOT\.md|MANIFEST\.md/.test(f));
const ids = new Map(); // id -> {file, fm}
for (const f of files) {
  const r = rel(f);
  const base = path.basename(f);
  const folder = path.basename(path.dirname(f));
  const idMatch = base.match(/^([A-Z]+)-(\d{4})/) || folder.match(/^([A-Z]+)-(\d{4})/);
  const isImplTask = /70-implementation\/IMPL-\d{4}[^/]*\/AT-/.test(r);
  if (isImplTask) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).length;
    if (lines > 40) warn(`${r}: IMPL task note has ${lines} lines (limit 40)`);
    if (/```/.test(fs.readFileSync(f, 'utf8'))) err(`${r}: IMPL task note contains a code fence — cite the commit instead`);
    continue;
  }
  if (!idMatch) { if (base !== 'CHANGELOG.md' && base !== 'README.md') warn(`${r}: no TYPE-NNNN in name`); if (base !== 'README.md') continue; }
  const text = fs.readFileSync(f, 'utf8');
  const fm = frontMatter(text);
  if (!fm) { err(`${r}: missing front-matter`); continue; }
  const id = fm.id;
  if (!id || !/^[A-Z]+-\d{4}$/.test(id)) { err(`${r}: front-matter id missing/invalid`); continue; }
  if (idMatch && id !== `${idMatch[1]}-${idMatch[2]}`) err(`${r}: front-matter id ${id} ≠ file name`);
  if (!TYPES.includes(id.split('-')[0])) err(`${r}: unknown type ${id}`);
  if (!STATUSES.has(fm.status)) err(`${r}: status "${fm.status}" not in vocabulary`);
  if (!fm.updated) warn(`${r}: no "updated" date`);
  if (ids.has(id)) err(`${r}: duplicate id ${id} (also ${rel(ids.get(id).file)})`);
  ids.set(id, { file: f, fm });
}

// ---- 2. links resolve -------------------------------------------------------------------
for (const [id, { file, fm }] of ids) {
  for (const l of fm.links || []) if (!ids.has(l)) err(`${rel(file)}: link ${l} does not exist`);
}

// ---- 3. INDEX consistency ---------------------------------------------------------------
const indexPath = path.join(DOCS, 'INDEX.md');
if (fs.existsSync(indexPath)) {
  const idx = fs.readFileSync(indexPath, 'utf8');
  const indexed = new Set((idx.match(/^\|\s*([A-Z]+-\d{4})\s*\|/gm) || []).map((s) => s.match(/[A-Z]+-\d{4}/)[0]));
  for (const id of ids.keys()) if (!indexed.has(id)) err(`INDEX.md: ${id} exists on disk but has no row`);
  for (const id of indexed) if (!ids.has(id) && !/archived/.test((idx.split(id)[1] || '').split('\n')[0])) warn(`INDEX.md: row ${id} but no file (not tombstoned)`);
  // counters ≥ max id per type
  const ctr = idx.match(/\|\s*REQ\s*\|\s*ANA[^\n]*\n\|[-| ]+\n\|([^\n]+)/);
  if (ctr) {
    const vals = ctr[1].split('|').map((s) => s.trim()).filter(Boolean).map(Number);
    TYPES.forEach((t, i) => {
      const max = Math.max(0, ...[...ids.keys()].filter((k) => k.startsWith(t + '-')).map((k) => Number(k.split('-')[1])));
      if (!(vals[i] > max)) err(`INDEX.md: counter ${t}=${vals[i]} but max id on disk is ${max} (next must be ${max + 1})`);
    });
  } else warn('INDEX.md: counters table not found');
} else err('docs/INDEX.md missing');

// ---- 4. parking lot: every open row has an owner ---------------------------------------
const pl = path.join(DOCS, 'PARKING-LOT.md');
if (fs.existsSync(pl)) {
  const rows = fs.readFileSync(pl, 'utf8').split(/\r?\n/).filter((l) => /^\|\s*PL-\d+/.test(l));
  for (const row of rows) {
    const cells = row.split('|').map((s) => s.trim());
    // | PL-id | Source | Item | Owner | Status | Target |
    const [, plId, , , owner, status] = cells;
    if (/^open$/i.test(status) && (!owner || owner === '—' || owner === '')) err(`PARKING-LOT: ${plId} is open without an owner`);
  }
}

// ---- 4b. ANA invariants ↔ TC coverage -------------------------------------------------
for (const [id, { file, fm }] of ids) {
  if (!id.startsWith('ANA-')) continue;
  const t = fs.readFileSync(file, 'utf8');
  if (!/## Invariants/.test(t)) { warn(`${rel(file)}: no "Invariants" section`); continue; }
  const invs = [...new Set(t.match(/\bINV-\d+\b/g) || [])];
  const tcs = [...ids.values()].filter((d) => d.fm.id.startsWith('TC-') && (d.fm.links || []).includes(id));
  const covered = new Set();
  for (const tc of tcs) for (const m of fs.readFileSync(tc.file, 'utf8').matchAll(/\bINV-\d+\b/g)) covered.add(m[0]);
  for (const inv of invs) if (!covered.has(inv)) err(`${rel(file)}: ${inv} has no TC case (Maps to: ${inv})`);
}

// ---- 5. PLAN sanity ---------------------------------------------------------------------
for (const [id, { file }] of ids) {
  if (!id.startsWith('PLAN-')) continue;
  const t = fs.readFileSync(file, 'utf8');
  if (!/## Hot files/.test(t)) warn(`${rel(file)}: no "Hot files" section`);
  const rows = t.split(/\r?\n/).filter((l) => /^\|\s*AT-\d+\.\d+/.test(l));
  for (const row of rows) {
    const c = row.split('|').map((s) => s.trim());
    if (c.length < 9) { warn(`${rel(file)}: malformed task row ${c[1]}`); continue; }
    if (!c[4]) err(`${rel(file)}: ${c[1]} has empty Depends (use — if none)`);
    if (!c[6] || c[6] === '#') err(`${rel(file)}: ${c[1]} has no TC link`);
  }
}

// ---- report -----------------------------------------------------------------------------
for (const w of warns) console.log('WARN  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(`validate-docs: ${ids.size} docs, ${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
