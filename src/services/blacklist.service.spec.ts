/**
 * Imports
 */

import { compileBlacklist, scanBlacklist } from './blacklist.service';

/**
 * Tests
 */

test('a blacklist entry with level "off" produces no compiled matcher', () => {
    const compiled = compileBlacklist([{ pattern: 'console.log', level: 'off' }]);
    expect(compiled).toEqual([]);
    const findings = scanBlacklist('console.log(1);', 'a.js', compiled);
    expect(findings).toEqual([]);
});

test('an array-of-strings pattern expands into one matcher per element', () => {
    const compiled = compileBlacklist([{ pattern: [ 'console.log', 'console.error' ], level: 'warn' }]);
    const findings = scanBlacklist('console.log(1);console.error(2);ok();', 'a.js', compiled);
    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.severity === 'warn')).toBe(true);
    expect(findings.find((f) => f.message.includes('console.log'))).toBeDefined();
    expect(findings.find((f) => f.message.includes('console.error'))).toBeDefined();
});

test('substring patterns produce one finding per occurrence', () => {
    const compiled = compileBlacklist([{ pattern: 'console.log', level: 'warn' }]);
    const findings = scanBlacklist('console.log(1);x;console.log(2);', 'a.js', compiled);
    expect(findings.length).toBe(2);
    expect(findings[0].kind).toBe('blacklist');
    expect(findings[0].severity).toBe('warn');
});

test('regex literals are compiled and use word boundaries', () => {
    const compiled = compileBlacklist([{ pattern: '/\\bdebugger\\b/', level: 'error' }]);
    const findings = scanBlacklist('a=debuggerXX;\ndebugger;', 'a.js', compiled);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
});

test('regex flag i enables case-insensitive match', () => {
    const compiled = compileBlacklist([{ pattern: '/console/i', level: 'info' }]);
    const findings = scanBlacklist('CONSOLE.log(1);console.log(2);', 'a.js', compiled);
    expect(findings.length).toBe(2);
});

test('line numbers are 1-based and accurate', () => {
    const compiled = compileBlacklist([{ pattern: 'X', level: 'info' }]);
    const findings = scanBlacklist('a\nb\nX\nY\nX', 'a.js', compiled);
    expect(findings[0].message).toMatch(/line 3/);
    expect(findings[1].message).toMatch(/line 5/);
});

test('custom message overrides default text', () => {
    const compiled = compileBlacklist([{ pattern: 'TODO', level: 'info', message: 'leftover marker' }]);
    const findings = scanBlacklist('TODO foo', 'a.js', compiled);
    expect(findings[0].message).toMatch(/leftover marker/);
});

test('empty blacklist produces no findings', () => {
    expect(scanBlacklist('console.log(1);', 'a.js', compileBlacklist([]))).toEqual([]);
});
