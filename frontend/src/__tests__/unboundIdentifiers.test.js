// Every identifier the app references must be bound: imported, declared in
// scope, or a known global. In a release build an unbound name is a
// ReferenceError at the moment that code runs — #71 shipped PetProfileScreen
// calling useRefetchOnFocus without importing it, so opening any pet profile
// crashed the app. Babel's own scope analysis (not regexes), so aliased
// imports, nested scopes, destructuring, JSX components and strings that
// look like comments are all handled.
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '../..');

// Runtime globals of React Native / Hermes that Babel's built-in list
// (ECMAScript builtins) doesn't know about.
const RUNTIME_GLOBALS = new Set([
  '__DEV__', 'process', 'require', 'module', 'exports', 'global', 'globalThis',
  'console', 'fetch', 'FormData', 'File', 'Blob', 'Headers', 'Request', 'Response',
  'AbortController', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'alert',
  'atob', 'btoa', 'navigator', 'window', 'document', 'performance', 'structuredClone',
]);

function sourceFiles() {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === '__mocks__' ? [] : walk(full);
      return /\.(js|jsx)$/.test(e.name) ? [full] : [];
    });
  return [path.join(ROOT, 'App.js'), path.join(ROOT, 'index.js'), ...walk(path.join(ROOT, 'src'))].filter((f) =>
    fs.existsSync(f),
  );
}

/** Names referenced in `code` that resolve to no binding and no known global. */
function unbound(code) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const found = new Set();
  traverse(ast, {
    ReferencedIdentifier(p) {
      const { name } = p.node;
      // <view>/<div> are intrinsic tags, not variables.
      if (p.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      if (p.scope.hasBinding(name) || RUNTIME_GLOBALS.has(name)) return;
      found.add(name);
    },
  });
  return [...found].sort();
}

describe('the checker itself', () => {
  test('flags unimported hooks, functions and JSX components', () => {
    const code = `
      import { useState } from 'react';
      import { usePetsQuery as usePets } from './hooks';
      export default function Screen() {
        const [a] = useState(0);
        usePetsQuery();              // only the alias is bound
        useRefetchOnFocus(() => {}); // never imported (the #71 bug)
        track('x');
        return <MilestoneRow value={a} />;
      }`;
    expect(unbound(code)).toEqual(['MilestoneRow', 'track', 'usePetsQuery', 'useRefetchOnFocus']);
  });

  test('accepts bound names, scoped locals, destructuring, globals and comment-like strings', () => {
    const code = `
      import React, { useMemo } from 'react';
      const { useThing } = require('./x');
      const type = 'image/*'; // not a comment opener
      function A() { const useLocal = () => 1; return useLocal() + useMemo(() => 2, []); }
      export default function B() {
        useThing();
        if (__DEV__) console.log(type, fetch, new FormData());
        return <View><A /></View>;
      }`;
    // View is deliberately unbound here: proves JSX components are checked.
    expect(unbound(code)).toEqual(['View']);
  });

  test('does not leak a local from one component into another', () => {
    expect(unbound('function A(){ const useLocal = () => 1; } function B(){ useLocal(); }')).toEqual(['useLocal']);
  });
});

const files = sourceFiles();

test('scans App.js, index.js and src/', () => {
  expect(files.length).toBeGreaterThan(60);
});

test.each(files.map((f) => [path.relative(ROOT, f), f]))('%s has no unbound identifiers', (_, file) => {
  expect(unbound(fs.readFileSync(file, 'utf8'))).toEqual([]);
});
