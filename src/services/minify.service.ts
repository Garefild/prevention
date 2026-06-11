/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { MinifyCheckResultInterface, IdentifierStatsInterface } from '@interfaces/validator.interface';

/**
 * Minimum file size in bytes before the text-based minification heuristic activates.
 *
 * @remarks
 * Very small files cannot be reliably classified - a four-line config or a
 * single export statement will fail any whitespace-ratio test even when it
 * is the canonical shipped form. Below this threshold {@link checkMinified}
 * returns `minified: true` unconditionally, unless the source has an
 * internal newline (see {@link checkMinified}).
 *
 * @since 1.0.0
 */

const MIN_SIZE_FOR_MINIFY_CHECK = 256;

const MIN_COMMENT_COUNT_FOR_UNMINIFIED = 3;
const MIN_COMMENT_RATIO_FOR_UNMINIFIED = 0.05;

/**
 * Upper bound on the average line length of an "unminified" file.
 *
 * @since 1.0.0
 */

const MAX_AVG_LINE_LENGTH_UNMINIFIED = 200;

/**
 * Upper bound on the whitespace ratio of a "minified" file.
 *
 * @since 1.0.0
 */

const MAX_WHITESPACE_RATIO_MINIFIED = 0.20;

/**
 * Minimum number of local declarations needed before the identifier signal is trusted.
 *
 * @remarks
 * Files with fewer declarations than this fall back to the text heuristic.
 * A handful of names is too small a sample to read mean-length reliably,
 * and a file with zero declarations (e.g. a one-line `console.log` call)
 * has nothing to measure at all.
 *
 * @since 1.0.0
 */

const ID_CONFIDENCE_COUNT = 5;

/**
 * Maximum identifier length still considered "short" for the minified signal.
 *
 * @remarks
 * Terser, esbuild, swc, and webpack all rename locals to 1-2 character
 * names by default (`a`, `e`, `n`, `t0`, etc.). Hand-written code rarely
 * uses names this short outside of loop counters.
 *
 * @since 1.0.0
 */

export const SHORT_NAME_MAX_LENGTH = 2;

/**
 * Minimum fraction of declarations that must be "short" for a file to count as minified.
 *
 * @remarks
 * In real-world minified output 70-95% of local declarations are 1-2 chars.
 * Hand-written code typically has under 20%. Half is a comfortable middle
 * that handles mixed files (large blocks of inlined external code + a few
 * minified wrappers, or vice versa) without flip-flopping.
 *
 * @since 1.0.0
 */

const MIN_SHORT_NAME_RATIO_FOR_MINIFIED = 0.5;

function analyzeComments(source: string): { count: number; ratio: number } {
    const lineComments = source.match(/\/\/[^\n]*/g) || [];
    const blockComments = source.match(/\/\*[\s\S]*?\*\//g) || [];
    const count = lineComments.length + blockComments.length;
    const commentChars = lineComments.reduce((sum, c) => sum + c.length, 0) +
        blockComments.reduce((sum, c) => sum + c.length, 0);
    const ratio = commentChars / source.length;

    return { count, ratio };
}

/**
 * Decides whether a JavaScript source string is minified.
 *
 * @param source - Full file contents to analyze
 * @param identifiers - Optional identifier statistics extracted from the parsed AST
 * @returns The verdict together with the underlying measurements
 *
 * @remarks
 * The decision uses the strongest signal available, in this order:
 *
 * 1. **Identifier statistics** (when the AST is available and the file has
 *    at least {@link ID_CONFIDENCE_COUNT} local declarations). A file is
 *    minified iff at least {@link MIN_SHORT_NAME_RATIO_FOR_MINIFIED} of
 *    its declaration names are {@link SHORT_NAME_MAX_LENGTH} chars or
 *    shorter. This is the most reliable signal because minifiers rename
 *    locals to 1-2 chars and pretty-printed code almost never does.
 *
 * 2. **Text heuristic** (fallback). Combines whitespace ratio and average
 *    line length. A file is flagged only when **both** signals indicate
 *    pretty-printing: ratio above {@link MAX_WHITESPACE_RATIO_MINIFIED}
 *    **and** average line length below {@link MAX_AVG_LINE_LENGTH_UNMINIFIED}.
 *    Requiring both prevents false positives on minified output that
 *    wraps at column 80, on heavily-templated files, and on files with
 *    inline binary blobs.
 *
 *    A 256-byte size short-circuit applies, but only to **single-line**
 *    input. Any source with an internal newline still runs the
 *    heuristic, because a real minified file never has a literal `\n`
 *    between statements.
 *
 * @example
 * ```ts
 * checkMinified('!function(){"use strict";...}();', undefined);
 * // text path - long single line passes
 *
 * checkMinified(source, { count: 42, meanLength: 1.2, shortRatio: 0.95 });
 * // identifier path - 95% short names → minified
 *
 * checkMinified(source, { count: 42, meanLength: 7.4, shortRatio: 0.05 });
 * // identifier path - 5% short names → not minified
 * ```
 *
 * @since 1.0.0
 */

export function checkMinified(source: string, identifiers?: IdentifierStatsInterface): MinifyCheckResultInterface {
    const idSaysNotMinified =
        identifiers !== undefined &&
        identifiers.count >= ID_CONFIDENCE_COUNT &&
        identifiers.shortRatio < MIN_SHORT_NAME_RATIO_FOR_MINIFIED;

    const comment = analyzeComments(source);
    const commentSaysNotMinified = comment.count >= MIN_COMMENT_COUNT_FOR_UNMINIFIED && comment.ratio >= MIN_COMMENT_RATIO_FOR_UNMINIFIED;

    let whitespaceRatio = 0;
    let avgLineLength = 0;
    let textSaysNotMinified = false;

    const hasInternalNewline = source.trim().includes('\n');
    if (source.length >= MIN_SIZE_FOR_MINIFY_CHECK || hasInternalNewline) {
        const stripped = source.replace(/\s/g, '');
        whitespaceRatio = (source.length - stripped.length) / source.length;
        const lines = source.split('\n').filter((l) => l.trim().length > 0);
        avgLineLength = lines.length
            ? lines.reduce((a, l) => a + l.length, 0) / lines.length
            : 0;
        textSaysNotMinified =
            whitespaceRatio > MAX_WHITESPACE_RATIO_MINIFIED &&
            avgLineLength < MAX_AVG_LINE_LENGTH_UNMINIFIED;
    }

    const minified = !(commentSaysNotMinified || idSaysNotMinified || textSaysNotMinified);

    return {
        minified,
        whitespaceRatio,
        avgLineLength,
        identifiers,
        signals: {
            text: textSaysNotMinified,
            comments: commentSaysNotMinified,
            identifiers: idSaysNotMinified
        },
        comments: {
            count: comment.count,
            ratio: comment.ratio
        }
    };
}
