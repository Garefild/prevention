/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { MinifyCheckResultInterface, IdentifierStatsInterface } from '@interfaces/validator.interface';

/**
 * Minimum file size in bytes before the text-based minification heuristic activates.
 *
 * @remarks
 * Files below this size that are also single-line are auto-passed because
 * they cannot be reliably classified. A multi-line source skips this
 * short-circuit because a real minified file never has a literal `\n`
 * between statements.
 *
 * @since 1.0.0
 */

const MIN_SIZE_FOR_MINIFY_CHECK = 256;

/**
 * Whitespace-ratio ceiling above which the text signal fires.
 *
 * @since 1.0.0
 */

const MAX_WHITESPACE_RATIO_MINIFIED = 0.2;

/**
 * Average non-empty line length below which the text signal fires.
 *
 * @since 1.0.0
 */

const MAX_AVG_LINE_LENGTH_UNMINIFIED = 200;

/**
 * Minimum number of local declarations needed before the identifier signal is consulted.
 *
 * @since 1.0.0
 */

const ID_CONFIDENCE_COUNT = 5;

/**
 * Maximum identifier length still considered "short" for the minified signal.
 *
 * @since 1.0.0
 */

export const SHORT_NAME_MAX_LENGTH = 2;

/**
 * Minimum fraction of declarations that must be short before the identifier signal calls a file minified.
 *
 * @since 1.0.0
 */

const MIN_SHORT_NAME_RATIO_FOR_MINIFIED = 0.5;

/**
 * Returns true when the character code is ASCII whitespace.
 *
 * @param code - UTF-16 code unit
 * @returns true - for SP, TAB, LF, CR, FF, or VT
 *
 * @remarks
 * Hand-rolled to avoid a per-character regex match. Covers the same set
 * as the JavaScript `/\s/` character class for the ASCII range, which is
 * enough for source code: non-ASCII whitespace in JS source is
 * essentially never seen outside of string literals.
 *
 * @since 1.0.0
 */

function isWhitespaceCode(code: number): boolean {
    return code === 0x20 || code === 0x09 || code === 0x0A || code === 0x0D || code === 0x0C || code === 0x0B;
}

/**
 * Computes whitespace ratio and average non-empty line length in a single pass.
 *
 * @param source - Source text to scan
 * @returns Both metrics, ready for threshold comparison
 *
 * @since 1.0.0
 */

function scanTextMetrics(source: string): { whitespaceRatio: number; avgLineLength: number } {
    let whitespace = 0;
    let nonEmptyLineCount = 0;
    let nonEmptyLineChars = 0;
    let currentLineLength = 0;
    let currentLineHasContent = false;

    for (let i = 0; i < source.length; i++) {
        const c = source.charCodeAt(i);
        const isWs = isWhitespaceCode(c);
        if (isWs) whitespace++;

        if (c === 0x0A) {
            if (currentLineHasContent) {
                nonEmptyLineChars += currentLineLength;
                nonEmptyLineCount++;
            }
            currentLineLength = 0;
            currentLineHasContent = false;
        } else {
            currentLineLength++;
            if (!isWs) currentLineHasContent = true;
        }
    }
    if (currentLineHasContent) {
        nonEmptyLineChars += currentLineLength;
        nonEmptyLineCount++;
    }

    return {
        whitespaceRatio: source.length ? whitespace / source.length : 0,
        avgLineLength: nonEmptyLineCount ? nonEmptyLineChars / nonEmptyLineCount : 0
    };
}

/**
 * Decides whether a JavaScript source string is minified.
 *
 * @param source - Full file contents to analyze
 * @param identifiers - Optional identifier statistics extracted from the parsed AST
 * @returns The verdict together with which signals fired
 *
 * @remarks
 * Two independent signals are computed and combined with `OR` - either
 * one alone is enough to flag a file as not minified, and both must
 * agree for a file to pass.
 *
 * 1. **Identifier signal** (only when the AST yielded at least
 *    {@link ID_CONFIDENCE_COUNT} local declarations). Fires when fewer
 *    than {@link MIN_SHORT_NAME_RATIO_FOR_MINIFIED} of those names are
 *    {@link SHORT_NAME_MAX_LENGTH} chars or shorter. Catches long
 *    single-line code that the text signal alone would miss because of
 *    its low whitespace ratio.
 *
 * 2. **Text signal** (only when the source is at least
 *    {@link MIN_SIZE_FOR_MINIFY_CHECK} bytes **or** contains an internal
 *    newline). Fires when whitespace ratio is above
 *    {@link MAX_WHITESPACE_RATIO_MINIFIED} **and** the average non-empty
 *    line is below {@link MAX_AVG_LINE_LENGTH_UNMINIFIED}. Catches
 *    multi-line pretty-printed code regardless of identifier choices.
 *
 * Tiny single-line sources skip the text signal entirely (they can't be
 * reliably classified). If no identifier stats were supplied either,
 * the result is `minified: true` with both signals false.
 *
 * @since 1.0.0
 */

export function checkMinified(source: string, identifiers?: IdentifierStatsInterface): MinifyCheckResultInterface {
    const idSignal = identifiers !== undefined
        && identifiers.count >= ID_CONFIDENCE_COUNT
        && identifiers.shortRatio < MIN_SHORT_NAME_RATIO_FOR_MINIFIED;

    let whitespaceRatio = 0;
    let avgLineLength = 0;
    let textSignal = false;

    const hasInternalNewline = source.trim().includes('\n');
    if (source.length >= MIN_SIZE_FOR_MINIFY_CHECK || hasInternalNewline) {
        const metrics = scanTextMetrics(source);
        whitespaceRatio = metrics.whitespaceRatio;
        avgLineLength = metrics.avgLineLength;
        textSignal = whitespaceRatio > MAX_WHITESPACE_RATIO_MINIFIED
            && avgLineLength < MAX_AVG_LINE_LENGTH_UNMINIFIED;
    }

    return {
        minified: !(idSignal || textSignal),
        whitespaceRatio,
        avgLineLength,
        identifiers,
        signals: { text: textSignal, identifiers: idSignal }
    };
}
