/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { SeverityType } from '@interfaces/config.interface';

/**
 * All possible categories of validation finding reported by the validator.
 *
 * @remarks
 * Each {@link ValidationFindingInterface} carries one of these tags so
 * downstream tooling can group, filter, or color-code findings without
 * inspecting the human-readable message string.
 *
 * - `parse` - source could not be tokenized as JavaScript
 * - `comment` - a `//` or `/* *\/` comment was found
 * - `minify` - the file looks pretty-printed
 * - `blacklist` - a configured blacklist pattern matched the source
 *
 * @since 1.0.0
 */

export type ValidationKindType = 'parse' | 'comment' | 'minify' | 'blacklist';

/**
 * A single finding produced while validating one source file.
 *
 * @remarks
 * The `label` identifies where the finding came from. For top-level
 * files it is the file path relative to the validated folder. For
 * findings inside an `eval(...)` or `new Function(...)` string argument
 * the label is suffixed with `→ eval@<line>` or `→ new Function@<line>`
 * so the caller can trace the nesting.
 *
 * `severity` is resolved at finding-creation time from the active
 * configuration. Only findings whose severity is `error` will cause
 * the CLI to exit non-zero.
 *
 * @example
 * ```ts
 * {
 *   label: 'app.js',
 *   kind: 'blacklist',
 *   severity: 'warn',
 *   message: 'matched "console.log" line 12'
 * }
 * ```
 *
 * @since 1.0.0
 */

export interface ValidationFindingInterface {
    label: string;
    kind: ValidationKindType;
    severity: SeverityType;
    message: string;
}

/**
 * Aggregated result of validating an entire folder tree.
 *
 * @remarks
 * `fileCount` is the number of `.js` / `.mjs` / `.cjs` files actually
 * read and parsed. `findings` is the flat list of every finding across
 * every file - it is empty when the folder passes.
 *
 * @see validateFolder
 * @since 1.0.0
 */

export interface ValidationResultInterface {
    findings: Array<ValidationFindingInterface>;
    fileCount: number;
}

/**
 * Output of the minification heuristic for one source string.
 *
 * @remarks
 * `minified` is the final yes/no answer. The other two fields expose the
 * raw measurements, so callers can report them in error messages or tune
 * the thresholds without re-running the check.
 *
 * @see checkMinified
 * @since 1.0.0
 */

export interface MinifyCheckResultInterface {
    minified: boolean;
    avgLineLength: number;
    whitespaceRatio: number;
    identifiers?: IdentifierStatsInterface;
    signals: {
        text: boolean;
        comments: boolean;
        identifiers: boolean;
    };
    comments?: {
        count: number;
        ratio: number;
    };
}

/**
 * Summary of local-declaration identifier names collected from a parsed AST.
 *
 * @remarks
 * Produced by walking the AST and capturing identifier names from every
 * `VariableDeclarator`, `FunctionDeclaration`, `FunctionExpression`,
 * `ArrowFunctionExpression` parameter, and `ClassDeclaration`. Imports,
 * destructuring patterns, and property accesses are deliberately excluded
 * because their names are constrained by external interfaces and are not
 * renamed by ministers in the same way local declarations are.
 *
 * Minified code typically has `meanLength` near 1 and `shortRatio` above
 * 0.7; handwritten code averages 4-10 chars per declaration with a
 * `shortRatio` under 0.2.
 *
 * @since 1.0.0
 */

export interface IdentifierStatsInterface {
    count: number;
    meanLength: number;
    shortRatio: number;
}
