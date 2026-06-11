/**
 * Imports
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CONFIG } from './config.service';
import { validateFolder, walkFiles } from './walker.service';

/**
 * Tests
 */

function makeFixture(name: string, files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `prevention-${ name }-`));
    for (const [ rel, content ] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }

    return dir;
}

// eslint-disable-next-line max-len
const MINIFIED = '!function(){"use strict";function n(n,t){return n+t}var r=n(1,2);console.log(r);for(var o=0;o<10;o++)console.log(o);var i={a:1,b:2,c:3},u=Object.keys(i).map(function(n){return i[n]+1});console.log(u);}();';

test('walkFiles finds nested .js .mjs .cjs but skips others', () => {
    const dir = makeFixture('walk', {
        'a.js': '',
        'sub/b.mjs': '',
        'sub/deep/c.cjs': '',
        'README.md': 'no'
    });
    const found = Array.from(walkFiles(dir)).map((f) => path.relative(dir, f)).sort();
    expect(found).toEqual([ 'a.js', 'sub/b.mjs', 'sub/deep/c.cjs' ].sort());
});

test('validateFolder returns no findings for clean folder', () => {
    const dir = makeFixture('clean', {
        'app.js': MINIFIED,
        'sub/lib.mjs': MINIFIED
    });
    const result = validateFolder(dir);
    expect(result.fileCount).toBe(2);
    expect(result.findings).toEqual([]);
});

test('validateFolder collects findings from dirty files', () => {
    const dir = makeFixture('dirty', {
        'good.js': MINIFIED,
        'bad.js': '!function(){"use strict";/* hi */console.log(1);}();'
    });
    const result = validateFolder(dir);
    expect(result.fileCount).toBe(2);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].label).toBe('bad.js');
    expect(result.findings[0].severity).toBe('error');
});

test('validateFolder throws when path is not a directory', () => {
    expect(() => validateFolder('/nonexistent/path/here')).toThrow();
});

test('validateFolder skips files matching ignore globs', () => {
    const dirty = '!function(){"use strict";/* hi */console.log(1);}();';
    const dir = makeFixture('ignore', {
        'app.js': MINIFIED,
        'app.spec.js': dirty,
        'sub/util.spec.js': dirty,
        'sub/util.js': MINIFIED
    });
    const result = validateFolder(dir, { ...DEFAULT_CONFIG, ignore: [ '*.spec.js' ] });
    expect(result.fileCount).toBe(2);
    expect(result.findings).toEqual([]);
});

test('validateFolder honors directory ignore patterns', () => {
    const dirty = '!function(){"use strict";/* hi */console.log(1);}();';
    const dir = makeFixture('ignore-dir', {
        'app.js': MINIFIED,
        'test/a.js': dirty,
        'test/sub/b.js': dirty
    });
    const result = validateFolder(dir, { ...DEFAULT_CONFIG, ignore: [ 'test/**' ] });
    expect(result.fileCount).toBe(1);
    expect(result.findings).toEqual([]);
});
