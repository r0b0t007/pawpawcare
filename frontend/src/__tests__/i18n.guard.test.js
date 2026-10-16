// i18n guards (CHW-188), so the translations can't quietly drift:
//  (a) fr and es have exactly en's keys — plural keys in each language's own
//      plural forms — and nothing extra;
//  (b) screens that have migrated to t() keep no hard-coded English: no bare
//      JSX text and no literal strings in the props people read or hear.
// Add a file to MIGRATED once its strings live in src/i18n/*.json.
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const SRC = path.join(__dirname, '..');
const read = (lng) => JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', `${lng}.json`), 'utf8'));

const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

// key -> plural forms present ([] for a plain key)
function shape(lng) {
  const out = new Map();
  flatten(read(lng)).forEach(([key]) => {
    const m = PLURAL.exec(key);
    const base = m ? key.slice(0, m.index) : key;
    if (!out.has(base)) out.set(base, []);
    if (m) out.get(base).push(m[1]);
  });
  return out;
}

const categories = (lng) => new Intl.PluralRules(lng).resolvedOptions().pluralCategories.slice().sort();

describe.each(['fr', 'es'])('%s.json', (lng) => {
  const en = shape('en');
  const other = shape(lng);

  test('has every en key, and no keys en does not have', () => {
    expect([...en.keys()].filter((k) => !other.has(k))).toEqual([]);
    expect([...other.keys()].filter((k) => !en.has(k))).toEqual([]);
  });

  test('plural keys carry exactly the plural forms of the language', () => {
    const wrong = [...en.entries()]
      .filter(([, forms]) => forms.length > 0)
      .filter(([key]) => JSON.stringify((other.get(key) || []).slice().sort()) !== JSON.stringify(categories(lng)))
      .map(([key]) => `${key}: ${(other.get(key) || []).join(',')}`);
    expect(wrong).toEqual([]);
  });

  test('every value is a non-empty string with the same {{placeholders}} as en', () => {
    const enValues = new Map(flatten(read('en')).map(([k, v]) => [k.replace(PLURAL, ''), v]));
    const vars = (v) => (String(v).match(/{{\s*\w+\s*}}/g) || []).map((x) => x.replace(/\s/g, '')).sort().join();
    const bad = flatten(read(lng))
      .filter(([k, v]) => typeof v !== 'string' || !v.trim() || vars(v) !== vars(enValues.get(k.replace(PLURAL, ''))))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

test('en plural keys carry exactly the English plural forms', () => {
  const wrong = [...shape('en').entries()]
    .filter(([, forms]) => forms.length > 0 && JSON.stringify(forms.slice().sort()) !== JSON.stringify(categories('en')))
    .map(([key]) => key);
  expect(wrong).toEqual([]);
});

// ── (b) no hard-coded strings in migrated files ─────────────────────────────

const MIGRATED = ['screens/main/ProfileScreen.js'];

// Props whose string value is shown or announced.
const VISIBLE_PROPS = new Set([
  'title', 'subtitle', 'label', 'message', 'confirmLabel', 'cancelLabel', 'value',
  'placeholder', 'accessibilityLabel', 'accessibilityHint', 'text', 'caption',
]);

function hardCodedStrings(file, src = fs.readFileSync(path.join(SRC, file), 'utf8')) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'JSXText' && /\p{L}/u.test(node.value)) {
      found.push(`${file}:${node.loc.start.line} text "${node.value.trim()}"`);
    }
    if (node.type === 'JSXAttribute' && VISIBLE_PROPS.has(node.name.name)) {
      const v = node.value;
      const literal =
        v?.type === 'StringLiteral' ? v.value
          : v?.type === 'JSXExpressionContainer' && v.expression.type === 'StringLiteral' ? v.expression.value
            : v?.type === 'JSXExpressionContainer' && v.expression.type === 'TemplateLiteral'
              ? v.expression.quasis.map((q) => q.value.cooked).join('')
              : null;
      if (literal && /\p{L}/u.test(literal)) {
        found.push(`${file}:${node.loc.start.line} ${node.name.name}="${literal}"`);
      }
    }
    Object.values(node).forEach((child) => {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && child.type) visit(child);
    });
  };
  visit(ast.program);
  return found;
}

test('migrated files have no hard-coded user-facing strings', () => {
  expect(MIGRATED.flatMap((file) => hardCodedStrings(file))).toEqual([]);
});

test('the guard catches hard-coded strings', () => {
  // Self-check, so a walker bug can't make the guard above pass silently.
  const sample = [
    'export default () => (',
    '  <Row title="Log out" label={`Hi ${n}`} value={t(`languages.${l}`)} icon="logout">',
    '    <Text>Profile</Text>',
    '    <Text>{t("profile.title")} {name}</Text>',
    '  </Row>',
    ');',
  ].join('\n');
  expect(hardCodedStrings('sample.js', sample)).toEqual([
    'sample.js:2 title="Log out"',
    'sample.js:2 label="Hi "',
    'sample.js:3 text "Profile"',
  ]);
});
