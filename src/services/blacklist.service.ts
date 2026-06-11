/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { ValidationFindingInterface } from '@interfaces/validator.interface';
import type { SeverityType, BlacklistEntryInterface } from '@interfaces/config.interface';

/**
 * Pattern shape recognised as a regular-expression literal.
 *
 * @remarks
 * Anything matching `/source/flags` is compiled with `RegExp` and used
 * for repeated matching. Everything else is treated as a literal
 * substring search. The `g` flag is forced on at compile time so that
 * a non-global pattern still walks the entire input.
 *
 * @since 1.0.0
 */

const REGEX_LITERAL = /^\/(.+)\/([gimsuy]*)$/;

/**
 * Pre-compiled blacklist matcher ready for repeated scanning.
 *
 * @remarks
 * Compiling once up front avoids re-parsing the regex literal for
 * every file in a large folder walk. `sourcePattern` is the original
 * input string (a single element of {@link BlacklistEntryInterface.pattern})
 * and is used in the default finding message; `level` and `message`
 * come from the parent entry and are duplicated on every matcher.
 *
 * @since 1.0.0
 */

interface CompiledEntryInterface {
    level: SeverityType;
    message?: string;
    sourcePattern: string;
    matcher: string | RegExp;
}

/**
 * Compiles a blacklist into matcher form.
 *
 * @param blacklist - Entries straight from the user config
 * @returns One compiled matcher per pattern string, in input order
 *
 * @throws Error - When a `/.../` pattern is syntactically invalid
 *
 * @remarks
 * Each entry whose `pattern` is a single string produces one matcher.
 * Each entry whose `pattern` is an array of strings produces one
 * matcher per element, all inheriting the entry's `level` and
 * `message`. This lets a single config row express "ban any of these
 * tokens at this severity" without repeating the level on every line.
 *
 * Strings stay as plain substrings; regex literals are wrapped in
 * `RegExp` with the `g` flag added so {@link scanBlacklist} can step
 * through every match in a single pass.
 *
 * @example
 * ```ts
 * compileBlacklist([
 *     { pattern: 'console.log', level: 'warn' },
 *     { pattern: [ 'debugger', 'eval' ], level: 'error' }
 * ]);
 * // → 3 compiled matchers
 * ```
 *
 * @since 1.0.0
 */

export function compileBlacklist(blacklist: Array<BlacklistEntryInterface>): Array<CompiledEntryInterface> {
    const compiled: Array<CompiledEntryInterface> = [];
    for (const entry of blacklist) {
        if (entry.level === 'off') continue;
        const patterns = Array.isArray(entry.pattern) ? entry.pattern : [ entry.pattern ];
        for (const sourcePattern of patterns) {
            const m = REGEX_LITERAL.exec(sourcePattern);
            const matcher = m
                ? new RegExp(m[1], m[2].includes('g') ? m[2] : m[2] + 'g')
                : sourcePattern;
            compiled.push({
                level: entry.level,
                message: entry.message,
                sourcePattern,
                matcher
            });
        }
    }

    return compiled;
}

/**
 * Yields every match of a single compiled matcher against a source string.
 *
 * @param source - Full source text
 * @param matcher - Either a substring or a global `RegExp`
 * @yields Each match with its `index` and `match` text
 *
 * @remarks
 * For empty regex matches the lastIndex is forcibly advanced to avoid
 * infinite loops. For substrings the search advances by at least one
 * character per iteration to give the same guarantee.
 *
 * @since 1.0.0
 */

function* iterateMatches(source: string, matcher: string | RegExp): Generator<{ index: number; match: string }> {
    if (typeof matcher === 'string') {
        if (matcher.length === 0) return;
        let i = 0;
        while ((i = source.indexOf(matcher, i)) !== -1) {
            yield { index: i, match: matcher };
            i += matcher.length;
        }

        return;
    }

    let m: RegExpExecArray | null;
    while ((m = matcher.exec(source)) !== null) {
        yield { index: m.index, match: m[0] };
        if (m[0].length === 0) matcher.lastIndex++;
    }
    matcher.lastIndex = 0;
}

/**
 * Returns the 1-based line number for a given character index.
 *
 * @param source - Full source text
 * @param index - Character offset into `source`
 * @returns Line number, starting at 1
 *
 * @remarks
 * Counts `\n` characters before `index`. Cheap for the small files the
 * validator handles - no need to pre-build a line table.
 *
 * @since 1.0.0
 */

function lineAt(source: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (source.charCodeAt(i) === 10) line++;
    }

    return line;
}

/**
 * Scans one source string for every configured blacklist pattern.
 *
 * @param source - File contents to scan
 * @param label - Identifier reported on each finding (typically the file path)
 * @param compiled - Pre-compiled blacklist entries from {@link compileBlacklist}
 * @returns Zero or more findings of kind `blacklist`
 *
 * @remarks
 * Substring matches are case-sensitive. A regex pattern with the `i`
 * flag enables case-insensitivity. Matches inside string literals,
 * template literals, and comments are all reported because the scan
 * runs on raw text - this is by design so blacklist hits cannot be
 * hidden by being wrapped in quotes.
 *
 * @example
 * ```ts
 * const compiled = compileBlacklist([{ pattern: 'console.log', level: 'warn' }]);
 * scanBlacklist('console.log(1)', 'app.js', compiled);
 * // [{ label: 'app.js', kind: 'blacklist', severity: 'warn', message: '...' }]
 * ```
 *
 * @since 1.0.0
 */

export function scanBlacklist(source: string, label: string, compiled: Array<CompiledEntryInterface>): Array<ValidationFindingInterface> {
    const findings: Array<ValidationFindingInterface> = [];
    for (const c of compiled) {
        for (const m of iterateMatches(source, c.matcher)) {
            const line = lineAt(source, m.index);
            const text = c.message ?? `matched ${ JSON.stringify(c.sourcePattern) }`;
            findings.push({
                label,
                kind: 'blacklist',
                severity: c.level,
                message: `${ text } line ${ line }`
            });
        }
    }

    return findings;
}
