/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { SeverityType } from '@interfaces/config.interface';

/**
 * Imports
 */

import { xterm } from '@remotex-labs/xansi';

/**
 * Package version embedded in the banner.
 *
 * @remarks
 * Hard-coded to avoid pulling `package.json` at runtime, which would
 * require either `assert { type: 'json' }` (ESM) or a `require()` (CJS)
 * and complicates the single-file bundled CLI. Bumped manually on each
 * release.
 *
 * @since 1.0.0
 */

export const VERSION = '1.0.0';

/**
 * Brand color used for the banner ASCII art.
 *
 * @remarks
 * A warm orange close to the tone used by xBuild and xJet so the three
 * tools feel like a family when chained in the same terminal session.
 *
 * @since 1.0.0
 */

const BANNER_HEX = '#FF8800';

/**
 * Multi-line ASCII art rendered as the startup banner.
 *
 * @remarks
 * Hand-crafted at a width that fits an 80-column terminal. Six rows
 * including the descender of the lowercase `p`. The trailing blank
 * inside each row is intentional - it keeps the right edge of the
 * applied color block flush.
 *
 * @since 1.0.0
 */

const BANNER_ART = [
    '                            _   _             ',
    ' _ __  _ __ _____   _____ _ __ | |_(_) ___  _ __  ',
    '| \'_ \\| \'__/ _ \\ \\ / / _ \\ \'_ \\| __| |/ _ \\| \'_ \\ ',
    '| |_) | | |  __/\\ V /  __/ | | | |_| | (_) | | | |',
    '| .__/|_|  \\___| \\_/ \\___|_| |_|\\__|_|\\___/|_| |_|',
    '|_|                                               '
];

/**
 * Builds the colored startup banner as a single string.
 *
 * @returns Multi-line banner ready to print
 *
 * @remarks
 * The brand-colored ASCII art is followed by a dim version line. The
 * caller decides where to send the result - the CLI writes it to
 * stderr so stdout stays clean for piping.
 *
 * @example
 * ```ts
 * process.stderr.write(renderBanner() + '\n');
 * ```
 *
 * @since 1.0.0
 */

export function renderBanner(): string {
    const colored = BANNER_ART.map((row) => xterm.hex(BANNER_HEX)(row)).join('\n');
    const version = xterm.gray(`Version: ${ VERSION }`);

    return `\n${ colored }\n${ version }\n`;
}

/**
 * Applies the per-severity color to a label.
 *
 * @param severity - The finding severity
 * @param text - Text to wrap
 * @returns Same text wrapped in the appropriate ANSI sequence
 *
 * @remarks
 * Color mapping:
 * - `error` - bold red
 * - `warn` - yellow
 * - `info` - cyan
 *
 * Used by the CLI to color the `[severity]` tag on each finding line.
 *
 * @since 1.0.0
 */

export function colorSeverity(severity: SeverityType, text: string): string {
    if (severity === 'error') return xterm.bold.red(text);
    if (severity === 'warn') return xterm.yellow(text);

    return xterm.cyan(text);
}

/**
 * Applies a muted style to the `[kind]` tag printed alongside each finding.
 *
 * @param text - Text to wrap
 * @returns Dim-gray text
 *
 * @since 1.0.0
 */

export function colorKind(text: string): string {
    return xterm.gray(text);
}

/**
 * Wraps the success summary in green.
 *
 * @param text - Text to wrap
 * @returns Green text
 *
 * @since 1.0.0
 */

export function colorOk(text: string): string {
    return xterm.green(text);
}

/**
 * Wraps the failure summary in bold red.
 *
 * @param text - Text to wrap
 * @returns Bold red text
 *
 * @since 1.0.0
 */

export function colorFail(text: string): string {
    return xterm.bold.red(text);
}
