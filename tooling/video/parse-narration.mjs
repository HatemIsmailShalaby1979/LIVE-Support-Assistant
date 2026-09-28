// Parse docs/DEMO_NARRATION.md into structured segments.
// Each "## Segment N — Title" block has an "On-screen:" line and a "Spoken (N words):" line.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? process.cwd());
const src = resolve(repo, 'docs/DEMO_NARRATION.md');
const text = readFileSync(src, 'utf8');

const lines = text.split(/\r?\n/);
const segments = [];
let cur = null;
let mode = null; // 'onscreen' | 'spoken'

for (const line of lines) {
  const segMatch = line.match(/^##\s+Segment\s+(\d+)\s+—\s+(.*?)\s*$/);
  if (segMatch) {
    if (cur) segments.push(cur);
    cur = { n: Number(segMatch[1]), title: segMatch[2].trim(), onscreen: '', spoken: '' };
    mode = null;
    continue;
  }
  if (!cur) continue;
  const onMatch = line.match(/^\*\*On-screen:\*\*\s*(.*)$/);
  const spMatch = line.match(/^\*\*Spoken\s+\(\d+\s+words\):\*\*\s*(.*)$/);
  if (onMatch) { mode = 'onscreen'; cur.onscreen = onMatch[1].trim(); continue; }
  if (spMatch) { mode = 'spoken'; cur.spoken = spMatch[1].trim(); continue; }
  if (mode === 'spoken' && line.trim()) {
    cur.spoken += ' ' + line.trim();
  }
}
if (cur) segments.push(cur);

// strip markdown emphasis for TTS
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
for (const s of segments) { s.spoken = clean(s.spoken); s.onscreen = clean(s.onscreen); }

console.log(JSON.stringify(segments, null, 2));
const outPath = resolve(process.cwd(), 'segments.json');
import('node:fs').then((fs) => fs.writeFileSync(outPath, JSON.stringify(segments, null, 2)));
console.error(`wrote ${segments.length} segments to ${outPath}`);
