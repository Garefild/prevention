/**
 * Imports
 */

import { isIgnored, normalizeGlob } from './ignore.service';

/**
 * Tests
 */

test('normalizeGlob prefixes filename-only patterns with **/', () => {
    expect(normalizeGlob('*.spec.js')).toBe('**/*.spec.js');
    expect(normalizeGlob('test.js')).toBe('**/test.js');
});

test('normalizeGlob leaves patterns containing a slash untouched', () => {
    expect(normalizeGlob('test/**')).toBe('test/**');
    expect(normalizeGlob('src/*.ts')).toBe('src/*.ts');
    expect(normalizeGlob('**/test/**')).toBe('**/test/**');
});

test('isIgnored matches filename-only patterns at any depth', () => {
    expect(isIgnored('a.spec.js', [ '*.spec.js' ])).toBe(true);
    expect(isIgnored('sub/a.spec.js', [ '*.spec.js' ])).toBe(true);
    expect(isIgnored('sub/deep/a.spec.js', [ '*.spec.js' ])).toBe(true);
    expect(isIgnored('a.js', [ '*.spec.js' ])).toBe(false);
});

test('isIgnored anchors patterns containing a slash to the root', () => {
    expect(isIgnored('src/a.ts', [ 'src/*.ts' ])).toBe(true);
    expect(isIgnored('src/deep/a.ts', [ 'src/*.ts' ])).toBe(false);
    expect(isIgnored('lib/src/a.ts', [ 'src/*.ts' ])).toBe(false);
});

test('isIgnored matches arbitrary depth with **', () => {
    expect(isIgnored('test/a.js', [ '**/test/**' ])).toBe(true);
    expect(isIgnored('a/test/b.js', [ '**/test/**' ])).toBe(true);
    expect(isIgnored('a/b/test/c/d.js', [ '**/test/**' ])).toBe(true);
    expect(isIgnored('a/b/c.js', [ '**/test/**' ])).toBe(false);
});

test('isIgnored honors directory-rooted ** patterns', () => {
    expect(isIgnored('test/a.js', [ 'test/**' ])).toBe(true);
    expect(isIgnored('test/sub/a.js', [ 'test/**' ])).toBe(true);
    expect(isIgnored('src/a.js', [ 'test/**' ])).toBe(false);
});

test('isIgnored normalizes Windows backslash paths', () => {
    expect(isIgnored('test\\a.js', [ 'test/**' ])).toBe(true);
});

test('isIgnored returns false when no pattern matches', () => {
    expect(isIgnored('src/app.js', [ '*.spec.js' ])).toBe(false);
});

test('isIgnored returns false for an empty pattern list', () => {
    expect(isIgnored('app.js', [])).toBe(false);
});

test('isIgnored short-circuits on first match', () => {
    expect(isIgnored('app.spec.js', [ 'never.js', '*.spec.js', 'never2.js' ])).toBe(true);
});
