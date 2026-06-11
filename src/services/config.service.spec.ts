/**
 * Imports
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CONFIG, shouldShow, readConfigFile, resolveConfigPath, mergeConfig, loadConfig } from './config.service';

/**
 * Tests
 */

function tempDir(name: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), `prevention-${ name }-`));
}

test('shouldShow filters by severity rank', () => {
    expect(shouldShow('info', 'info')).toBe(true);
    expect(shouldShow('warn', 'info')).toBe(true);
    expect(shouldShow('error', 'info')).toBe(true);
    expect(shouldShow('info', 'warn')).toBe(false);
    expect(shouldShow('warn', 'warn')).toBe(true);
    expect(shouldShow('warn', 'error')).toBe(false);
    expect(shouldShow('error', 'error')).toBe(true);
});

test('readConfigFile returns null when file is missing', () => {
    expect(readConfigFile('/nonexistent/config.json')).toBeNull();
});

test('readConfigFile throws when JSON is invalid', () => {
    const dir = tempDir('badjson');
    const file = path.join(dir, 'c.json');
    fs.writeFileSync(file, '{ not json');
    expect(() => readConfigFile(file)).toThrow();
});

test('readConfigFile parses a valid config', () => {
    const dir = tempDir('okjson');
    const file = path.join(dir, 'c.json');
    fs.writeFileSync(file, JSON.stringify({ logLevel: 'warn', blacklist: [] }));
    expect(readConfigFile(file)).toEqual({ logLevel: 'warn', blacklist: [] });
});

test('resolveConfigPath throws when explicit path is missing', () => {
    expect(() => resolveConfigPath('/nope.json', '/tmp')).toThrow(/not found/);
});

test('resolveConfigPath returns null when no config exists and none requested', () => {
    const dir = tempDir('empty');
    expect(resolveConfigPath(undefined, dir)).toBeNull();
});

test('resolveConfigPath auto-detects default config in cwd', () => {
    const dir = tempDir('auto');
    const file = path.join(dir, 'prevention.config.json');
    fs.writeFileSync(file, '{}');
    expect(resolveConfigPath(undefined, dir)).toBe(file);
});

test('mergeConfig applies overrides without mutating base', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { logLevel: 'warn' });
    expect(merged.logLevel).toBe('warn');
    expect(DEFAULT_CONFIG.logLevel).toBe('info');
});

test('mergeConfig replaces blacklist wholesale', () => {
    const base = { ...DEFAULT_CONFIG, blacklist: [{ pattern: 'a', level: 'warn' as const }] };
    const merged = mergeConfig(base, { blacklist: [] });
    expect(merged.blacklist).toEqual([]);
});

test('mergeConfig shallow-merges checks', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { checks: { comment: 'warn' } });
    expect(merged.checks).toEqual({ comment: 'warn', minify: 'error', parse: 'error' });
});

test('mergeConfig replaces ignore wholesale', () => {
    const base = { ...DEFAULT_CONFIG, ignore: [ 'old.js' ] };
    expect(mergeConfig(base, { ignore: [ '*.spec.js' ] }).ignore).toEqual([ '*.spec.js' ]);
    expect(mergeConfig(base, {}).ignore).toEqual([ 'old.js' ]);
});

test('loadConfig: CLI overrides take precedence over file', () => {
    const dir = tempDir('prio');
    const file = path.join(dir, 'prevention.config.json');
    fs.writeFileSync(file, JSON.stringify({ logLevel: 'warn' }));
    const config = loadConfig({ logLevel: 'error' }, undefined, dir);
    expect(config.logLevel).toBe('error');
});

test('loadConfig: file overrides defaults when no CLI override given', () => {
    const dir = tempDir('file');
    const file = path.join(dir, 'prevention.config.json');
    fs.writeFileSync(file, JSON.stringify({ logLevel: 'warn' }));
    const config = loadConfig({}, undefined, dir);
    expect(config.logLevel).toBe('warn');
});
