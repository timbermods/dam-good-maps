#!/usr/bin/env node
// The roadmap canvas's extractor (tools/roadmap-canvas/README.md).
//
// Reads the living documents (ROADMAP.md, docs/STATUS.md, PLAN.md §20, docs/decisions-pending.md, docs/archive/roadmap.md),
// the git tags, and, when `gh` is logged in, the pull requests and the Progress log (#57); joins them with manifest.json
// (the cards and what each follows); writes data.js and data.json beside this script.
//
//   node tools/roadmap-canvas/extract.mjs            # everything
//   node tools/roadmap-canvas/extract.mjs --offline  # no GitHub calls
//
// It never touches the generator, the editor or the site: it only reads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = findRoot(here);
const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'manifest.json'), 'utf8'));
const health = [];

// ---------------------------------------------------------------- files

const docs = {
  roadmap: readDoc('ROADMAP.md'),
  archive: readDoc('docs/archive/roadmap.md'),
  status: readDoc('docs/STATUS.md'),
  plan: readDoc('PLAN.md'),
  pending: readDoc('docs/decisions-pending.md'),
  perfect: readDoc('docs/PERFECT.md'),
};
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// ---------------------------------------------------------------- git

const repo = {
  root,
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: git(['rev-parse', '--short', 'HEAD']),
  commitDate: git(['log', '-1', '--format=%cs']),
  devCommit: tryGit(['rev-parse', '--short', 'origin/dev']) || tryGit(['rev-parse', '--short', 'dev']),
  version: pkg.version,
  remote: remoteSlug(tryGit(['remote', 'get-url', 'origin']) || ''),
};

const tags = git(['for-each-ref', '--sort=creatordate', '--format=%(refname:short)|%(creatordate:short)|%(contents:subject)', 'refs/tags'])
  .split('\n').filter(Boolean).map((line) => {
    const [name, date, ...rest] = line.split('|');
    const subject = rest.join('|');
    return { name, date, subject: subject === name ? '' : subject };
  });
const doneTags = tags.filter((t) => t.name.endsWith('-done'));
const tagByName = new Map(tags.map((t) => [t.name, t]));

// ---------------------------------------------------------------- GitHub (optional)

let prs = {};
let progressLog = [];
let github = { available: false, note: offline ? 'Skipped (--offline).' : '' };
if (!offline) {
  try {
    const list = JSON.parse(gh(['pr', 'list', '--state', 'all', '--limit', '300', '--json', 'number,title,state,isDraft,headRefName,url,mergedAt,updatedAt']));
    for (const pr of list) prs[pr.number] = pr;
    github.available = true;
  } catch (e) {
    github.note = `GitHub unavailable: ${firstLine(e.message)}`;
    health.push({ kind: 'github', text: github.note });
  }
  try {
    const issue = JSON.parse(gh(['issue', 'view', '57', '--json', 'comments,title,url']));
    progressLog = issue.comments.slice(-12).reverse().map((c) => ({ createdAt: c.createdAt, body: trim(stripMd(c.body), 600) }));
    github.progressLogUrl = issue.url;
    github.progressLogCount = issue.comments.length;
  } catch (e) {
    if (!github.note) github.note = `Progress log unavailable: ${firstLine(e.message)}`;
  }
}

// ---------------------------------------------------------------- documents

const roadmapSections = splitSections(docs.roadmap).map((s) => describeSection(s, 'live'));
const archiveSections = splitSections(docs.archive).map((s) => describeSection(s, 'archive'));
const order = parseOrderOfWork(roadmapSections.find((s) => /^The order of work/i.test(s.heading)));
const status = parseStatus(docs.status);
const decisions = parseDecisions(docs.plan);
const pending = parsePending(docs.pending);
const perfect = parsePerfect(docs.perfect);

// ---------------------------------------------------------------- the cards

const byId = new Map();
const milestones = manifest.milestones.map((m) => {
  const card = { ...m, tags: [], prs: [], statusRows: [], children: [], orderRefs: [], decisions: [...(m.decisions || [])] };
  byId.set(m.id, card);
  return card;
});

const usedSections = new Set();
const usedTags = new Set();
const usedStatusRows = new Set();

for (const card of milestones) {
  // Tags and their dates.
  for (const name of card.tags === undefined ? [] : (manifestTags(card) || [])) {
    const tag = tagByName.get(name);
    card.tags.push(tag ? { ...tag, exists: true } : { name, exists: false });
    if (tag) usedTags.add(name);
  }

  // The ROADMAP section (live first, then the archive).
  if (card.roadmap) {
    const re = new RegExp(card.roadmap, 'i');
    const live = roadmapSections.find((s) => s.level >= 2 && re.test(s.heading) && !usedSections.has(s.key));
    const archived = archiveSections.find((s) => s.level >= 2 && re.test(s.heading));
    const sec = live || archived;
    if (sec) {
      usedSections.add(sec.key);
      card.section = publicSection(sec);
      card.decisions.push(...sec.decisions);
      card.mentionedPrs = sec.prs;
      if (!card.summary) card.summary = sec.summary;
    } else {
      health.push({ kind: 'card', text: `Card "${card.title}" matches no ROADMAP section (live or archive): ${card.roadmap}` });
    }
  }

  // The order of work: the items (or phases) that name this card, and the block whose items become its children.
  for (const phase of order.phases) {
    if (itemNamesCard({ title: phase.title, bolds: [], prs: [] }, card)) {
      phase.cards.push(card.id);
      card.orderRefs.push({ phase: phase.n, phaseTitle: phase.title, trail: [] });
    }
    walkItems(phase.items, (item, trail) => {
      if (itemNamesCard(item, card)) {
        item.cards.push(card.id);
        card.orderRefs.push({ phase: phase.n, phaseTitle: phase.title, trail: [...trail, item.title] });
      }
    });
  }
  if (card.orderBlock) {
    const re = new RegExp(card.orderBlock, 'i');
    let found = null;
    for (const phase of order.phases) {
      if (re.test(phase.title) && !found) found = { title: phase.title, text: phase.intro, children: phase.items };
      walkItems(phase.items, (item) => { if (!found && re.test(item.title)) found = item; });
    }
    if (found) {
      if (!card.summary && found.text.length > 60) card.summary = found.text;
      card.orderText = found.text;
      card.children.push(...found.children.map((c) => ({ title: c.title, text: c.text, decisions: c.decisions, prs: c.prs.map((n) => ({ number: n })), cards: c.cards, kind: 'order' })));
    } else {
      health.push({ kind: 'card', text: `Card "${card.title}": no order-of-work block matches ${card.orderBlock}` });
    }
  }

  // STATUS rows (the "Work" tables): by the Work cell, the branch or one of the card's own PR numbers.
  const ownPrs = manifest.milestones.find((m) => m.id === card.id).prs || [];
  for (const row of status.rows) {
    if (row.table !== 'Work') continue;
    const work = row.cells.Work || '';
    const branch = stripCode(row.cells.Branch || '');
    const rowPrs = numbersIn(row.cells.PR || '');
    const match = (card.statusMatch && new RegExp(card.statusMatch, 'i').test(stripMd(work)))
      || (card.branch && branch === card.branch)
      || rowPrs.some((n) => ownPrs.includes(n));
    if (match) {
      card.statusRows.push(row);
      usedStatusRows.add(row.key);
    }
  }
  if (card.statusTable) {
    const rows = status.rows.filter((r) => r.table === card.statusTable);
    for (const row of rows) {
      usedStatusRows.add(row.key);
      card.children.push({ title: stripMd(row.cells.Investigation || ''), text: stripMd(row.cells.State || ''), prs: numbersIn(row.cells.PR || '').map((n) => ({ number: n })), kind: 'status' });
    }
  }
  if (card.statusSection) {
    const sec = status.sections.find((s) => new RegExp(card.statusSection, 'i').test(s.heading));
    if (sec) { card.statusText = sec.paragraphs.join('\n\n'); if (card.statusText.length > 60) card.summary = card.statusText; }
  }
  if (!card.summary) card.summary = card.statusNote || '';

  // Groups with a section but nothing listed: the section's bold leads ("Later") or its bullets ("Follow-ups").
  if (card.kind === 'group' && !card.children.length && card.section && !manifest.milestones.some((m) => m.parent === card.id)) {
    const src = card.section.leads.length ? card.section.leads : card.section.bullets;
    card.children.push(...src.map((l) => ({ title: l.title, text: l.text, decisions: decisionsIn(l.text), prs: [], kind: 'section' })));
  }

  // Pull requests, with GitHub's state where known: the manifest's, then the STATUS rows'.
  for (const n of ownPrs) if (!card.prs.some((p) => p.number === n)) card.prs.push({ number: n });
  for (const row of card.statusRows) for (const n of numbersIn(row.cells.PR || '')) if (!card.prs.some((p) => p.number === n)) card.prs.push({ number: n });
  card.prs = card.prs.map((p) => decoratePr(p.number));
  card.mentionedPrs = (card.mentionedPrs || []).filter((n) => !card.prs.some((p) => p.number === n)).map(decoratePr);
  for (const child of card.children) child.prs = (child.prs || []).map((p) => decoratePr(p.number));

  card.decisions = unique(card.decisions).sort((a, b) => dnum(a) - dnum(b));
  Object.assign(card, deriveStatus(card));
}

// The parent–children of groups declared in the manifest.
for (const card of milestones) if (card.parent && byId.has(card.parent)) byId.get(card.parent).children.push({ title: card.title, cardId: card.id, kind: 'card' });

// A released step with no tag of its own takes the date of the latest step it followed.
for (const card of milestones) {
  if (card.status !== 'released' || card.releasedOn) continue;
  const dates = (card.after || []).map((id) => byId.get(id)?.releasedOn).filter(Boolean).sort();
  if (dates.length) { card.releasedOn = dates[dates.length - 1]; card.dateInferred = true; }
}

// Order: released by date, then the order of work's sequence, then the rest.
const phaseRank = (card) => {
  if (card.orderRefs.length) return Math.min(...card.orderRefs.map((r) => r.phase * 1000 + order.indexOf(r.trail)));
  if (card.parent && byId.has(card.parent)) {
    const siblings = milestones.filter((c) => c.parent === card.parent);
    return phaseRank(byId.get(card.parent)) + (siblings.indexOf(card) + 1) / (siblings.length + 1);
  }
  return Infinity;
};
milestones.forEach((card, i) => { card.manifestIndex = i; });
const sequence = [...milestones].sort((a, b) => {
  const ra = a.status === 'released' ? 0 : 1, rb = b.status === 'released' ? 0 : 1;
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a.releasedOn || '').localeCompare(b.releasedOn || '') || a.manifestIndex - b.manifestIndex;
  const pa = phaseRank(a), pb = phaseRank(b);
  if (pa !== pb) return pa - pb;
  return a.manifestIndex - b.manifestIndex;
});
sequence.forEach((card, i) => { card.sequence = i; });

// ---------------------------------------------------------------- health (drift between the cards and the documents)

for (const s of roadmapSections) {
  if (s.level < 2 || usedSections.has(s.key)) continue;
  if (/^(The order of work|How the work is judged)/i.test(s.heading)) continue;
  health.push({ kind: 'roadmap', text: `ROADMAP section without a card: "${s.heading}"` });
}
for (const t of doneTags) if (!usedTags.has(t.name)) health.push({ kind: 'tag', text: `Released tag on no card: ${t.name} (${t.date})` });
for (const row of status.rows) {
  if (usedStatusRows.has(row.key)) continue;
  const work = row.cells.Work || row.cells.Investigation;
  if (work) health.push({ kind: 'status', text: `STATUS row on no card: "${trim(stripMd(work), 80)}"` });
}
for (const card of milestones) for (const id of card.after || []) if (!byId.has(id)) health.push({ kind: 'card', text: `Card "${card.title}" follows an unknown card: ${id}` });
if (github.available) {
  for (const row of status.rows) {
    const state = (row.cells.State || '').toLowerCase();
    for (const n of numbersIn(row.cells.PR || '')) {
      const pr = prs[n];
      if (!pr) continue;
      const prCell = (row.cells.PR || '').toLowerCase();
      if (state.includes('merged') || prCell.includes('merged')) continue;
      if (pr.state === 'MERGED') health.push({ kind: 'stale', text: `STATUS lists #${n} as "${trim(stripMd(row.cells.PR), 30)}" but GitHub says it is merged (${trim(stripMd(row.cells.Work || row.cells.Investigation || ''), 60)})` });
      if (pr.state === 'CLOSED' && !state.includes('closed') && !state.includes('superseded')) health.push({ kind: 'stale', text: `STATUS lists #${n} but GitHub says it is closed, not merged (${trim(stripMd(row.cells.Work || row.cells.Investigation || ''), 60)})` });
    }
  }
}
for (const phase of order.phases) for (const item of phase.items) if (!item.cards.length && !phase.items.every((i) => !i.cards.length)) health.push({ kind: 'order', text: `Order of work, ${phase.title}: "${trim(item.title, 70)}" is tied to no card` });

// ---------------------------------------------------------------- counts

const counts = {};
for (const g of manifest.statusGroups) counts[g.id] = milestones.filter((m) => m.status === g.id).length;
const openPrs = Object.values(prs).filter((p) => p.state === 'OPEN');
const stats = {
  cards: milestones.length,
  ...counts,
  doneTags: doneTags.length,
  lastRelease: doneTags.length ? doneTags[doneTags.length - 1] : null,
  decisionsInForce: decisions.inForce,
  nextDecision: decisions.nextFree,
  pendingOpen: pending.open,
  nextPending: pending.next,
  openPrs: github.available ? openPrs.length : null,
  openDraftPrs: github.available ? openPrs.filter((p) => p.isDraft).length : null,
  version: repo.version,
};

// ---------------------------------------------------------------- write

const data = {
  generatedAt: new Date().toISOString(),
  repo, github, stats,
  lanes: manifest.lanes,
  statusGroups: manifest.statusGroups,
  process: manifest.process,
  milestones,
  order,
  status: { sections: status.sections, released: status.released, sessions: status.sessions, waiting: status.waiting, releaseGate: status.releaseGate, queued: status.queued },
  decisions,
  pending,
  perfect,
  tags: doneTags,
  prs,
  progressLog,
  roadmapSections: roadmapSections.filter((s) => s.level >= 2).map(publicSection),
  health,
};
const json = JSON.stringify(data, null, 1);
fs.writeFileSync(path.join(here, 'data.json'), json);
fs.writeFileSync(path.join(here, 'data.js'), `// Generated by extract.mjs on ${data.generatedAt} from ${repo.branch}@${repo.commit}. Do not edit; rerun the extractor.\nwindow.ROADMAP_DATA = ${json};\n`);
console.log(`roadmap canvas: ${milestones.length} cards, ${doneTags.length} released tags, ${order.phases.length} order phases, ${status.rows.length} STATUS rows, ${decisions.inForce} decisions in force; ${health.length} health notes${github.available ? `; ${Object.keys(prs).length} PRs from GitHub` : `; ${github.note}`}`);
for (const h of health) console.log(`  - [${h.kind}] ${h.text}`);
console.log(`wrote ${path.relative(root, path.join(here, 'data.js'))} and data.json`);

// ================================================================ helpers

function findRoot(dir) {
  let d = dir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'ROADMAP.md')) && fs.existsSync(path.join(d, 'package.json'))) return d;
    d = path.dirname(d);
  }
  throw new Error('ROADMAP.md not found above ' + dir);
}
function readDoc(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { health.push({ kind: 'missing', text: `${rel} is missing` }); return ''; }
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
function git(a) { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function tryGit(a) { try { return git(a); } catch { return ''; } }
function gh(a) {
  const extra = repo.remote ? ['--repo', repo.remote] : [];
  return execFileSync('gh', [...a, ...extra], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
}
function remoteSlug(url) {
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  return m ? m[1] : '';
}
function firstLine(s) { return String(s || '').split('\n')[0].slice(0, 160); }
function trim(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)).trim() + '…';
}
function unique(a) { return [...new Set(a)]; }
function dnum(d) { return parseInt(String(d).replace(/\D/g, ''), 10) || 0; }
function manifestTags(card) { return manifest.milestones.find((m) => m.id === card.id).tags; }

function stripMd(s) {
  return String(s || '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
function stripCode(s) { return String(s || '').replace(/`/g, '').trim(); }
function numbersIn(s) {
  // Pull-request numbers: "#123" or ".../pull/123", never a pending-decision number ("[#2](docs/decisions-pending.md)",
  // "decisions-pending #83") and never the Progress log issue (#57).
  const cleaned = String(s || '').replace(/\[#\d+\]\([^)]*decisions-pending[^)]*\)/g, '').replace(/pending[^.;\n]*?#\d+(?:[–-]#?\d+)?/gi, '');
  return unique([...cleaned.matchAll(/(?:#|pull\/)(\d{1,4})\b/g)].map((m) => parseInt(m[1], 10))).filter((n) => n !== 57);
}
function decisionsIn(s) { return unique([...String(s || '').matchAll(/(?<![A-Za-z0-9])D(\d{1,3})(?![0-9])/g)].map((m) => 'D' + m[1])); }
function tagsIn(s) { return unique([...String(s || '').matchAll(/`([a-z0-9-]+-done)`/g)].map((m) => m[1])); }

// Split a Markdown document into heading-led sections (level 0 is the text before the first heading).
function splitSections(md) {
  const out = [];
  let cur = { level: 0, heading: '', lines: [], start: 1 };
  md.split('\n').forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) {
      out.push(cur);
      cur = { level: m[1].length, heading: m[2].trim(), lines: [], start: i + 1 };
    } else cur.lines.push(line);
  });
  out.push(cur);
  out.forEach((s) => { s.key = `${s.heading}@${s.start}`; });
  return out;
}

// What a section says, in plain data: summary, delivers, blocking, information, effort, decisions, PRs, tags.
function describeSection(sec, source) {
  const text = sec.lines.join('\n');
  const paragraphs = splitParagraphs(sec.lines);
  const firstPara = paragraphs.find((p) => !/^\s*(?:[-*]|\d+\.)\s/.test(p) && !/^\|/.test(p) && !/^---/.test(p)) || paragraphs[0] || '';
  const items = parseList(sec.lines);
  const leads = paragraphs
    .map((p) => p.match(/^\*\*([^*]+)\*\*\s*(.*)$/))
    .filter(Boolean)
    .map((m) => ({ title: stripMd(m[1]).replace(/[:.,;]$/, ''), text: trim(stripMd(m[2]), 400) }))
    .filter((l) => !/^(Delivers|Blocking|Information|Acceptance|Effort|In-game check|Release|Status)/i.test(l.title));
  const headed = (label) => {
    // "**Delivers**" then a list; "- Blocking:" or "- **Blocking:**" then nested bullets; "**Blocking:** text".
    const re = new RegExp(`^(\\s*)(?:[-*]\\s+)?(?:\\*\\*)?${label}\\b[^:*]*(?:\\*\\*)?:?\\s*(.*)$`, 'i');
    const lines = sec.lines;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      const indent = m[1].length;
      const isListItem = /^\s*[-*]\s/.test(lines[i]);
      const inline = stripMd(m[2].replace(/^\*\*\s*/, ''));
      const rest = [];
      let sawList = false;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) continue;
        const ind = l.match(/^\s*/)[0].length;
        const isItem = /^\s*(?:[-*]|\d+\.)\s/.test(l);
        if (isItem) {
          if (isListItem && ind <= indent) break;          // the next sibling bullet ends a bulleted label
          if (!isListItem && ind < indent) break;
          sawList = true; rest.push(l); continue;
        }
        if (/^\s*\*\*[A-Z]/.test(l) && ind <= indent) break; // the next bold lead ("**Acceptance**") ends it
        if (/^\s*#/.test(l)) break;
        if (sawList && ind > 0) { rest.push(l); continue; } // a wrapped list line
        if (!sawList && !isListItem && !inline) { rest.push(l); continue; } // a plain paragraph under the label
        break;
      }
      const sub = sawList ? parseList(rest).map(flattenItem) : (rest.length ? [trim(stripMd(rest.join(' ')), 600)] : []);
      const out = inline ? [inline, ...sub] : sub;
      if (out.length) return out;
    }
    return [];
  };
  return {
    key: sec.key, heading: sec.heading, level: sec.level, start: sec.start, source,
    summary: trim(stripMd(firstPara), 460),
    delivers: headed('Delivers'),
    blocking: headed('Blocking'),
    information: headed('Information'),
    effort: stripMd((text.match(/\*\*Effort:?\*\*:?\s*([^.\n]+)/i) || [])[1] || ''),
    inGame: stripMd((text.match(/\*\*In-game check:?\*\*:?\s*(.*?)(?:\s*\*\*Effort|\n|$)/i) || [])[1] || ''),
    decisions: decisionsIn(text),
    prs: numbersIn(text),
    tags: tagsIn(text),
    leads,
    bullets: items.slice(0, 40).map((i) => ({ title: i.title, text: flattenItem(i) })),
    length: sec.lines.filter((l) => l.trim()).length,
  };
}
function publicSection(s) {
  const { key, ...rest } = s;
  return { ...rest, anchor: anchorFor(s.heading), file: s.source === 'live' ? 'ROADMAP.md' : 'docs/archive/roadmap.md' };
}
function anchorFor(heading) {
  return stripMd(heading).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}
function splitParagraphs(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) { if (cur.length) out.push(cur.join(' ')); cur = []; }
    else cur.push(l.trim());
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}
// A Markdown list (with nesting by indent) into items {text, title, children, decisions, prs}.
function parseList(lines) {
  const rootItems = [];
  const stack = []; // {indent, item}
  let inList = false;
  for (const raw of lines) {
    const m = raw.match(/^(\s*)(?:[-*]|\d+\.)\s+(.*)$/);
    if (m) {
      inList = true;
      const indent = m[1].length;
      const item = { raw: m[2], children: [] };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      (stack.length ? stack[stack.length - 1].item.children : rootItems).push(item);
      stack.push({ indent, item });
    } else if (inList && raw.trim() && /^\s+/.test(raw) && stack.length) {
      stack[stack.length - 1].item.raw += ' ' + raw.trim();
    } else if (!raw.trim()) {
      // blank lines don't end a list in these documents
    } else {
      inList = false;
      stack.length = 0;
    }
  }
  const finish = (item) => {
    const text = stripMd(item.raw);
    const bolds = [...item.raw.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => stripMd(m[1]).replace(/[:;,.]$/, ''));
    const title = bolds[0] || trim(text.split(/[:;(]/)[0], 90);
    return { title, bolds, text, decisions: decisionsIn(item.raw), prs: numbersIn(item.raw), children: item.children.map(finish), cards: [] };
  };
  return rootItems.map(finish);
}
function flattenItem(item) {
  return item.children.length ? `${item.text} (${item.children.map((c) => c.text).join('; ')})` : item.text;
}

// "The order of work": phases (**1. Title**) each with its intro and its nested items.
function parseOrderOfWork(sec) {
  const phases = [];
  if (!sec) { health.push({ kind: 'roadmap', text: 'ROADMAP has no "The order of work" section' }); return { phases: [], intro: '', indexOf: () => 0 }; }
  const raw = splitSections(docs.roadmap).find((s) => s.key === sec.key);
  let intro = [];
  let cur = null;
  for (const line of raw.lines) {
    const m = line.match(/^\*\*(\d+)\.\s+(.+?)\*\*\s*(.*)$/);
    if (m) {
      cur = { n: parseInt(m[1], 10), title: stripMd(m[2]).replace(/[.:]$/, ''), introLines: [m[3]], itemLines: [], decisions: decisionsIn(line), cards: [] };
      phases.push(cur);
      continue;
    }
    if (!cur) { intro.push(line); continue; }
    if (/^\s*(?:[-*]|\d+\.)\s/.test(line) || cur.itemLines.length) cur.itemLines.push(line);
    else cur.introLines.push(line);
  }
  const tail = [];
  for (const p of phases) {
    // Text after the list that is not indented belongs to the closing paragraph, not the list.
    p.items = parseList(p.itemLines);
    p.intro = trim(stripMd(p.introLines.join(' ')), 700);
    p.decisions = unique([...p.decisions, ...decisionsIn(p.introLines.join(' '))]);
    delete p.introLines; delete p.itemLines;
  }
  const flat = [];
  for (const p of phases) walkItems(p.items, (item, trail) => flat.push([...trail, item.title].join(' > ')));
  return {
    intro: trim(stripMd(intro.join(' ')), 900),
    phases,
    closing: trim(stripMd(tail.join(' ')), 400),
    indexOf: (trail) => Math.max(0, flat.indexOf(trail.join(' > '))),
  };
}
function walkItems(items, fn, trail = []) {
  for (const item of items) { fn(item, trail); walkItems(item.children, fn, [...trail, item.title]); }
}
// An order-of-work item names a card when one of the card's order keywords is in the item's title or its bold
// spans (never its running text, which names neighbours too), or when it cites one of the card's own PRs.
function itemNamesCard(item, card) {
  const hay = [item.title, ...(item.bolds || [])].join(' | ').toLowerCase();
  const keys = (card.order || []).map((k) => k.toLowerCase());
  return keys.some((k) => hay.includes(k));
}

// docs/STATUS.md: every section's paragraphs, lists and tables; plus the named pieces the canvas shows.
function parseStatus(md) {
  const sections = splitSections(md).map((s) => ({
    heading: s.heading, level: s.level,
    paragraphs: splitParagraphs(s.lines).filter((p) => !/^\|/.test(p) && !/^\s*(?:[-*]|\d+\.)\s/.test(p)).map((p) => stripMd(p)),
    items: parseList(s.lines).map((i) => ({ title: i.title, text: i.text, decisions: i.decisions, prs: i.prs })),
    tables: parseTables(s.lines),
  }));
  const rows = [];
  for (const s of sections) for (const t of s.tables) t.rows.forEach((cells, i) => rows.push({ section: s.heading, table: t.kind, cells, key: `${s.heading}/${t.kind}/${i}` }));
  const find = (re) => sections.find((s) => re.test(s.heading));
  const released = find(/^Released/i);
  const sessions = find(/sessions/i);
  const waiting = find(/^Waiting for Kyler/i);
  const gate = find(/release gate/i);
  const queued = find(/^Queued/i);
  return {
    sections, rows,
    released: released ? released.paragraphs.join(' ') : '',
    sessions: sessions ? { intro: sessions.paragraphs.join(' '), items: sessions.items } : null,
    waiting: waiting ? waiting.items : [],
    releaseGate: gate ? gate.paragraphs.join('\n\n') : '',
    queued: queued ? queued.items : [],
  };
}
function parseTables(lines) {
  const tables = [];
  let cur = null;
  for (const l of lines) {
    if (/^\s*\|/.test(l)) {
      const cells = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (!cur) { cur = { header: cells, rows: [] }; continue; }
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      const obj = {};
      cur.header.forEach((h, i) => { obj[h] = cells[i] || ''; });
      cur.rows.push(obj);
    } else if (cur) { tables.push(cur); cur = null; }
  }
  if (cur) tables.push(cur);
  for (const t of tables) t.kind = t.header.includes('Work') ? 'Work' : t.header.includes('Investigation') ? 'Investigation' : t.header[0];
  return tables;
}

// PLAN.md §20: decisions in force by topic, their text, and the next free number.
function parseDecisions(md) {
  const start = md.search(/^## 20\. /m);
  const body = start >= 0 ? md.slice(start) : '';
  const end = body.search(/^## (?!20\.)/m);
  const sec = end > 0 ? body.slice(0, end) : body;
  const topics = [];
  const byNumber = {};
  let topic = null;
  for (const line of sec.split('\n')) {
    const h = line.match(/^### (.+)$/);
    if (h) { topic = { name: stripMd(h[1]), numbers: [] }; topics.push(topic); continue; }
    const d = line.match(/^- \*\*(D\d+)\*\*\s*(.*)$/);
    if (d && topic) {
      topic.numbers.push(d[1]);
      byNumber[d[1]] = { topic: topic.name, text: trim(stripMd(d[2]).replace(/^[:(]\s*/, ''), 420) };
    }
  }
  const next = (sec.match(/next free number \(D(\d+)/) || sec.match(/next is \*\*D(\d+)/) || [])[1];
  return { inForce: Object.keys(byNumber).length, nextFree: next ? 'D' + next : '', topics: topics.map((t) => ({ name: t.name, count: t.numbers.length, numbers: t.numbers })), byNumber };
}

// docs/decisions-pending.md: how many defaults still wait for Kyler, and the next number.
function parsePending(md) {
  const tables = parseTables(md.split('\n'));
  const rows = tables.flatMap((t) => t.rows);
  const open = rows.filter((r) => /pending/i.test(r.Status || '')).length;
  const next = (md.match(/next pending number is #(\d+)/i) || [])[1];
  return { open, total: rows.length, next: next ? '#' + next : '', rows: rows.map((r) => ({ n: r['#'], milestone: stripMd(r.Milestone || ''), question: trim(stripMd(r.Question || ''), 220), status: trim(stripMd(r.Status || ''), 120) })) };
}

// docs/PERFECT.md: the yardstick's sections, for the canvas's "what perfect means" panel.
function parsePerfect(md) {
  return splitSections(md).filter((s) => s.level === 2).map((s) => ({ heading: s.heading, text: trim(stripMd(splitParagraphs(s.lines)[0] || ''), 320), points: parseList(s.lines).slice(0, 8).map((i) => trim(i.text, 200)) }));
}

function decoratePr(n) {
  const pr = prs[n];
  const url = repo.remote ? `https://github.com/${repo.remote}/pull/${n}` : '';
  if (!pr) return { number: n, url, state: '', isDraft: false, title: '' };
  return { number: n, url: pr.url || url, state: pr.state, isDraft: !!pr.isDraft, title: pr.title, branch: pr.headRefName, mergedAt: pr.mergedAt };
}

// A card's status: its tags, then STATUS's state, then its PRs, then its heading, then the manifest's default.
function deriveStatus(card) {
  const fixed = manifest.milestones.find((m) => m.id === card.id).status;
  const primary = card.tags[0];
  if (primary && primary.exists) return { status: 'released', releasedOn: primary.date, statusReason: `tag ${primary.name} (${primary.date})` };
  if (fixed === 'released') return { status: 'released', releasedOn: card.tags.find((t) => t.exists)?.date || releaseDateFromText(card), statusReason: card.statusNote || 'released (manifest)' };
  if (fixed && fixed !== 'in-flight') return { status: fixed, statusReason: card.statusNote || `${fixed} (manifest)` };
  const states = card.statusRows.map((r) => (r.cells.State || '').toLowerCase());
  const stateText = states.join(' ');
  if (/parked/.test(stateText)) return { status: 'parked', statusReason: 'STATUS: parked' };
  if (/superseded|redundant/.test(stateText) && states.length === 1) return { status: 'parked', statusReason: 'STATUS: superseded or redundant' };
  if (/deferred/i.test(card.section?.heading || '')) return { status: 'parked', statusReason: 'ROADMAP: deferred' };
  if (/parked/i.test(card.section?.heading || '')) return { status: 'parked', statusReason: 'ROADMAP: parked' };
  if (/\bmerged\b/.test(stateText) && !/draft/.test(stateText) && !/open/.test(stateText)) return { status: 'on-dev', statusReason: 'STATUS: merged into dev' };
  if (card.statusRows.length) return { status: 'in-flight', statusReason: 'STATUS: in flight' };
  if (fixed === 'in-flight') return { status: 'in-flight', statusReason: card.statusNote || 'in flight (manifest)' };
  const open = card.prs.filter((p) => p.state === 'OPEN');
  const merged = card.prs.filter((p) => p.state === 'MERGED');
  if (open.length) return { status: 'in-flight', statusReason: `open PR ${open.map((p) => '#' + p.number).join(', ')}` };
  if (merged.length && github.available && card.kind !== 'group') return { status: 'on-dev', statusReason: `merged ${merged.map((p) => '#' + p.number).join(', ')}` };
  return { status: 'planned', statusReason: card.orderRefs.length ? 'in the order of work' : 'planned' };
}
function releaseDateFromText(card) {
  const m = (card.statusNote || card.summary || '').match(/20\d\d-\d\d-\d\d/);
  return m ? m[0] : '';
}
