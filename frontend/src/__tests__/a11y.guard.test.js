// Accessibility guards from the CHW-159 audit, so the fixes can't quietly
// regress: every tappable is announced, and the theme's text pairs keep
// WCAG AA contrast.
const fs = require('fs');
const path = require('path');
import { ui, PET_COLOR_PAIRS } from '../theme';

const SRC = path.join(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}
const FILES = [...sourceFiles(path.join(SRC, 'screens')), ...sourceFiles(path.join(SRC, 'components'))];

// The opening tag of each <Pressable …>, skipping `>` inside {…} expressions.
function openingTags(src, tag) {
  const tags = [];
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
    tags.push({ text: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
  }
  return tags;
}

test('every Pressable tells screen readers what it is (role or label)', () => {
  const missing = [];
  FILES.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    openingTags(src, 'Pressable').forEach(({ text, line }) => {
      if (!/accessibilityRole|accessibilityLabel/.test(text)) {
        missing.push(`${path.relative(SRC, file)}:${line}`);
      }
    });
  });
  expect(missing).toEqual([]);
});

test('placeholders never use the faint color (1.9:1 on the background)', () => {
  const offenders = FILES.filter((file) => fs.readFileSync(file, 'utf8').includes('placeholderTextColor={ui.faint}'));
  expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
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

test('theme text pairs meet WCAG AA (4.5:1)', () => {
  const pairs = [
    ['ink', 'background'], ['sub', 'background'], ['subtle', 'background'], ['accent', 'background'],
    ['sub', 'track'], ['sub', 'selectedTint'], ['ink', 'track'],
    ['danger', 'surface'], ['success', 'surface'], ['warnText', 'surface'],
    ['dangerText', 'dangerTint'], ['warnText', 'warnTint'], ['success', 'successTint'], ['accent', 'accentTint'],
    ['onAccent', 'accent'], ['onAccent', 'danger'],
  ];
  const failing = pairs
    .map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(ui[fg], ui[bg]) }))
    .filter(({ ratio }) => ratio < 4.5);
  expect(failing).toEqual([]);

  const petFailing = PET_COLOR_PAIRS.filter((p) => contrast(p.fg, p.bg) < 4.5).map((p) => p.name);
  expect(petFailing).toEqual([]);
});
