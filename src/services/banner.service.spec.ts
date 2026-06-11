/**
 * Imports
 */

import { VERSION, renderBanner, colorSeverity, colorKind, colorOk, colorFail } from './banner.service';

/**
 * Tests
 */

test('renderBanner contains the version string', () => {
    const banner = renderBanner();
    expect(banner).toContain(VERSION);
});

test('renderBanner produces a multi-line block', () => {
    const banner = renderBanner();
    expect(banner.split('\n').length).toBeGreaterThan(5);
});

test('colorSeverity wraps the input text with ANSI escape sequences', () => {
    const error = colorSeverity('error', '[error]');
    const warn = colorSeverity('warn', '[warn]');
    const info = colorSeverity('info', '[info]');
    expect(error).toContain('[error]');
    expect(warn).toContain('[warn]');
    expect(info).toContain('[info]');
    expect(error).toMatch(/\x1b\[/);
    expect(warn).toMatch(/\x1b\[/);
    expect(info).toMatch(/\x1b\[/);
});

test('colorOk wraps text in an ANSI sequence containing the original text', () => {
    const out = colorOk('ok');
    expect(out).toContain('ok');
    expect(out).toMatch(/\x1b\[/);
});

test('colorFail wraps text in an ANSI sequence containing the original text', () => {
    const out = colorFail('FAIL');
    expect(out).toContain('FAIL');
    expect(out).toMatch(/\x1b\[/);
});

test('colorKind wraps text in an ANSI sequence containing the original text', () => {
    const out = colorKind('[comment]');
    expect(out).toContain('[comment]');
    expect(out).toMatch(/\x1b\[/);
});
