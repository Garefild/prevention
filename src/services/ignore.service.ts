/**
 * Imports
 */

import * as path from 'node:path';

/**
 * Normalizes a user-supplied glob so a filename-only pattern matches at any depth.
 *
 * @param pattern - Raw glob from the user's config
 * @returns Same string with `**\/` prepended when it contains no `/`
 *
 * @remarks
 * `node:path.matchesGlob` is strict about `*` not crossing `/`, so
 * `*.spec.js` would only match files at the root. Prepending `**\/`
 * preserves the convention that filename-only patterns match at any
 * depth, the way ESLint, Prettier, and gitignore-style tooling all
 * behave. Patterns that already contain a `/` are returned untouched
 * and remain anchored to the relative-path root.
 *
 * @example
 * ```ts
 * normalizeGlob('*.spec.js');  // '**\/*.spec.js'
 * normalizeGlob('test/**');    // 'test/**'    (unchanged)
 * normalizeGlob('src/a.ts');   // 'src/a.ts'   (unchanged)
 * ```
 *
 * @since 1.0.0
 */

export function normalizeGlob(pattern: string): string {
    return pattern.includes('/') ? pattern : `**/${ pattern }`;
}

/**
 * Decides whether a relative file path matches any of the configured patterns.
 *
 * @param relativePath - File path relative to the validated folder
 * @param patterns - Glob patterns straight from the user config
 * @returns true - if the path matches at least one pattern
 *
 * @remarks
 * Delegates the actual matching to Node's built-in
 * [`path.matchesGlob`](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern),
 * which understands `*`, `**`, `?`, character classes, and brace
 * expansion. Backslashes in the input path are converted to forward
 * slashes so the same config works on Windows and Unix. Each pattern
 * is run through {@link normalizeGlob} first so filename-only entries
 * such as `*.spec.js` still match at any depth.
 *
 * @example
 * ```ts
 * isIgnored('sub/a.spec.js', [ '*.spec.js' ]);  // true
 * isIgnored('src/a.ts',      [ 'src/*.ts' ]);   // true
 * isIgnored('src/deep/a.ts', [ 'src/*.ts' ]);   // false  (no recursion under one *)
 * isIgnored('a/test/b.js',   [ '**\/test/**' ]); // true
 * ```
 *
 * @since 1.0.0
 */

export function isIgnored(relativePath: string, patterns: Array<string>): boolean {
    if (patterns.length === 0) return false;
    const normalizedPath = relativePath.replace(/\\/g, '/');
    for (const pattern of patterns) {
        if (path.matchesGlob(normalizedPath, normalizeGlob(pattern))) return true;
    }

    return false;
}
