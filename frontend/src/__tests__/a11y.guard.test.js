// Accessibility guards from the CHW-159 audit, so the fixes can't quietly
// regress: every tappable is announced (icon-only ones by name), every
// placeholder uses the AA token, and the color pairs the app actually uses
// keep WCAG AA contrast.
const fs = require('fs');
const path = require('path');
import { ui, PET_COLOR_PAIRS } from '../theme';

const SRC = path.join(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', 'node_modules'].includes(entry.name) ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}
const FILES = sourceFiles(SRC);
const rel = (file) => path.relative(SRC, file).replace(/\\/g, '/');

// Each <Tag …> element: its opening tag (skipping `>` inside {…}) and body.
function elements(src, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    const opening = src.slice(m.index, i + 1);
    const close = opening.endsWith('/>') ? -1 : src.indexOf(`</${tag}>`, i);
    out.push({
      opening,
      body: close === -1 ? '' : src.slice(i + 1, close),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

const PRESSABLES = ['Pressable', 'AnimatedPressable', 'TouchableOpacity', 'TouchableHighlight'];

test('every tappable has a role, and icon-only ones also have a label', () => {
  const problems = [];
  FILES.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    PRESSABLES.forEach((tag) => {
      elements(src, tag).forEach(({ opening, body, line }) => {
        const hasRole = /accessibilityRole/.test(opening);
        const hasLabel = /accessibilityLabel/.test(opening);
        // Visible text inside (or a label/title prop on a child component).
        const hasText = /<Text\b|\blabel=|\btitle=/.test(body);
        if (!hasRole && !hasLabel) problems.push(`${rel(file)}:${line} has no role or label`);
        else if (!hasText && !hasLabel) problems.push(`${rel(file)}:${line} is icon-only with no label`);
      });
    });
  });
  expect(problems).toEqual([]);
});

test('every placeholder uses the ui.placeholder token (AA on light backgrounds)', () => {
  const offenders = [];
  FILES.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    (src.match(/placeholderTextColor=\{[^}]*\}/g) || [])
      .filter((attr) => attr !== 'placeholderTextColor={ui.placeholder}')
      .forEach((attr) => offenders.push(`${rel(file)}: ${attr}`));
  });
  expect(offenders).toEqual([]);
});

// subtle on the track background is 3.9:1 (fails AA for small text). These
// spots were fixed to `sub`; keep `subtle` text off the track.
test('no subtle text on the track background', () => {
  const offenders = [];
  FILES.forEach((file) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (!/backgroundColor: ui\.track/.test(l)) return;
      const near = lines.slice(i, i + 9).join('\n');
      if (/color(=\{|: )ui\.subtle/.test(near)) offenders.push(`${rel(file)}:${i + 1}`);
    });
  });
  // SegmentedControl's labels sit on its track far below the style block.
  const seg = fs.readFileSync(path.join(SRC, 'components/SegmentedControl.js'), 'utf8');
  if (/ui\.subtle/.test(seg)) offenders.push('components/SegmentedControl.js');
  expect(offenders).toEqual([]);
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The text/background pairs the app actually renders (small text: 4.5:1).
const USED_TEXT_PAIRS = [
  ['ink', 'background'], ['ink', 'surface'], ['ink', 'track'],
  ['sub', 'background'], ['sub', 'surface'], ['sub', 'track'], ['sub', 'selectedTint'],
  ['subtle', 'background'], ['subtle', 'surface'], // section labels, captions
  ['placeholder', 'background'], ['placeholder', 'surface'],
  ['accent', 'background'], ['accent', 'surface'], ['accent', 'selectedTint'],
  ['danger', 'surface'], ['success', 'surface'], ['warnText', 'surface'],
  ['dangerText', 'dangerTint'], ['warnText', 'warnTint'], ['success', 'successTint'], ['accent', 'accentTint'],
  ['onAccent', 'accent'], ['onAccent', 'danger'],
];

test('the text pairs the app uses meet WCAG AA (4.5:1)', () => {
  const failing = USED_TEXT_PAIRS
    .map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: Number(contrast(ui[fg], ui[bg]).toFixed(2)) }))
    .filter(({ ratio }) => ratio < 4.5);
  expect(failing).toEqual([]);

  const petFailing = PET_COLOR_PAIRS.filter((p) => contrast(p.fg, p.bg) < 4.5).map((p) => p.name);
  expect(petFailing).toEqual([]);
});
