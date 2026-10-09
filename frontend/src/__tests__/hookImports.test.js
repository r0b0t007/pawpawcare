// Guards against calling a hook that was never imported. In a release build
// that is a ReferenceError at render time, which closes the app — exactly what
// shipped in #71 (PetProfileScreen called useRefetchOnFocus without importing
// it, so opening any pet profile crashed). Static and cheap: every `useX(` in
// screens/components must be imported, defined in the file, or a React.useX.
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const DIRS = ['screens', 'components', 'navigation', 'context', 'hooks'];

function jsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : jsFiles(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

const files = DIRS.flatMap((d) => jsFiles(path.join(SRC, d)));

test('finds the source files', () => {
  expect(files.length).toBeGreaterThan(20);
});

test.each(files.map((f) => [path.relative(SRC, f), f]))('%s only calls hooks it imports or defines', (_, file) => {
  const code = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const imported = new Set();
  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const id of m[1].match(/\b[A-Za-z_$][\w$]*\b/g) ?? []) imported.add(id);
  }
  const defined = new Set(
    [...code.matchAll(/(?:function|const|let|var)\s+(use[A-Z]\w*)/g)].map((m) => m[1]),
  );

  const called = [...code.matchAll(/(?<![.\w$])(use[A-Z]\w*)\s*\(/g)].map((m) => m[1]);
  const missing = [...new Set(called)].filter((h) => !imported.has(h) && !defined.has(h));
  expect(missing).toEqual([]);
});
