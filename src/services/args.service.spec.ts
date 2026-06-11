/**
 * Imports
 */

import { parseArgs, HelpRequestedError } from './args.service';

/**
 * Tests
 */

test('parseArgs parses just the folder positional', () => {
    const result = parseArgs([ './dist' ]);
    expect(result.folder).toBe('./dist');
    expect(result.configPath).toBeUndefined();
    expect(result.overrides).toEqual({});
    expect(result.showBanner).toBe(true);
});

test('parseArgs reads --config, -c, and --config= equivalently', () => {
    expect(parseArgs([ '--config', './c.json', 'd' ]).configPath).toBe('./c.json');
    expect(parseArgs([ '-c', './c.json', 'd' ]).configPath).toBe('./c.json');
    expect(parseArgs([ '--config=./c.json', 'd' ]).configPath).toBe('./c.json');
});

test('parseArgs reads --log-level into overrides', () => {
    expect(parseArgs([ '--log-level', 'warn', './dist' ]).overrides.logLevel).toBe('warn');
    expect(parseArgs([ '-l', 'error', './dist' ]).overrides.logLevel).toBe('error');
});

test('parseArgs rejects an invalid --log-level value', () => {
    expect(() => parseArgs([ '--log-level', 'verbose', './dist' ])).toThrow();
});

test('parseArgs maps --no-blacklist to an empty blacklist override', () => {
    const result = parseArgs([ '--no-blacklist', './dist' ]);
    expect(result.overrides.blacklist).toEqual([]);
});

test('parseArgs maps --no-banner to showBanner=false', () => {
    expect(parseArgs([ '--no-banner', './dist' ]).showBanner).toBe(false);
    expect(parseArgs([ './dist' ]).showBanner).toBe(true);
});

test('parseArgs rejects unknown flags in strict mode', () => {
    expect(() => parseArgs([ '--nope', './dist' ])).toThrow();
});

test('parseArgs rejects when folder is missing', () => {
    expect(() => parseArgs([])).toThrow();
});

test('parseArgs signals --help via HelpRequestedError', () => {
    const originalWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
        expect(() => parseArgs([ '--help' ])).toThrow(HelpRequestedError);
    } finally {
        process.stdout.write = originalWrite;
    }
});
