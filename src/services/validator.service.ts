/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { Comment, Node } from 'acorn';
import type { SimpleVisitors } from 'acorn-walk';
import type { ConfigInterface } from '@interfaces/config.interface';
import type { ValidationFindingInterface, IdentifierStatsInterface } from '@interfaces/validator.interface';

/**
 * Imports
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { DEFAULT_CONFIG } from '@services/config.service';
import { compileBlacklist, scanBlacklist } from '@services/blacklist.service';
import { checkMinified, SHORT_NAME_MAX_LENGTH } from '@services/minify.service';

/**
 * Internal result of one parse attempt against a single source string.
 *
 * @remarks
 * `ast` is `null` only when both the module-mode and script-mode parse
 * attempts threw. `comments` is always populated with whatever acorn
 * tokenized before the error position - this is what lets the validator
 * still report comments found inside an unparseable `eval(...)` string.
 *
 * @since 1.0.0
 */

interface ParseResultInterface {
    ast: Node | null;
    comments: Comment[];
    parseError: string | null;
}

/**
 * One string argument extracted from an `eval` or `Function` call site.
 *
 * @remarks
 * `source` is the literal string that will be re-parsed and re-validated.
 * `origin` and `line` are kept solely for labeling so the nested error
 * messages can be traced back to the call that introduced them.
 *
 * @since 1.0.0
 */

interface EvalStringInterface {
    source: string;
    origin: string;
    line: number;
}

/**
 * Pattern matching the standard source-map pragma emitted by ministers.
 *
 * @remarks
 * Both `# sourceMappingURL=` and the legacy `@ sourceMappingURL=` forms
 * are recognized. Acorn strips the leading slashes ('//') before
 * the comment value is exposed.
 *
 * @since 1.0.0
 */

const SOURCEMAP_PRAGMA = /^[#@]\s*sourceMappingURL=/;

/**
 * Parses one source string and returns the AST together with all comments.
 *
 * @param source - JavaScript or TypeScript-free JavaScript source to parse
 * @returns AST, collected comments, and parse-error message (if any)
 *
 * @remarks
 * Tries `sourceType: 'module'` first and falls back to `'script'` on
 * failure. Comments are accumulated via the `onComment` callback so that
 * even a final parse failure still surfaces every comment seen up to the
 * error position. The hashbang line is supported via `allowHashBang`.
 *
 * @since 1.0.0
 */

function parseSource(source: string): ParseResultInterface {
    const comments: Array<Comment> = [];
    const opts: acorn.Options = {
        ecmaVersion: 'latest',
        allowHashBang: true,
        onComment: comments,
        locations: true
    };

    try {
        const ast = acorn.parse(source, { ...opts, sourceType: 'module' });

        return { ast, comments, parseError: null };
    } catch {
        try {
            const ast = acorn.parse(source, { ...opts, sourceType: 'script' });

            return { ast, comments, parseError: null };
        } catch (e) {
            return { ast: null, comments, parseError: (<Error> e).message };
        }
    }
}

/**
 * Decides whether a comment should be ignored as tooling metadata.
 *
 * @param c - The comment node reported by acorn
 * @param source - Full source string the comment was parsed from
 * @returns true - if the comment is a shebang or source-map pragma
 *
 * @remarks
 * Two specific comment shapes are treated as non-editorial and skipped:
 * 1. A line comment at offset 0 in a file that starts with `#!` - the
 *    shebang line that node, env, deno, etc. require on executable
 *    scripts. esbuild and acorn both expose it through the comment API.
 * 2. A line comment whose value matches {@link SOURCEMAP_PRAGMA} - the
 *    `//# sourceMappingURL=...` pragma that minifiers append so a source
 *    map can be located at runtime.
 *
 * All other comments - including license banners - are reported.
 *
 * @since 1.0.0
 */

function isIgnoredComment(c: Comment, source: string): boolean {
    if (c.start === 0 && c.type === 'Line' && source.startsWith('#!')) return true;

    return c.type === 'Line' && SOURCEMAP_PRAGMA.test(c.value);
}

/**
 * Walks an AST and collects every string argument passed to `eval` or `new Function`.
 *
 * @param ast - Root of the parsed program
 * @returns Each extracted string with its origin tag and source line
 *
 * @remarks
 * Recognised call shapes:
 * - `eval("...")` - the first argument is treated as the body
 * - `new Function("a", "b", "...")` - only the **last** argument is the body,
 *   the preceding string arguments are parameter names
 *
 * Only literal string arguments are picked up; runtime-constructed
 * expressions (template literals with interpolations, identifiers,
 * concatenations) are deliberately ignored - they cannot be analysed
 * statically and are out of scope for this validator.
 *
 * @since 1.0.0
 */

/**
 * Resolves the dotted name of a call/new callee, or `null` for non-identifier shapes.
 *
 * @param node - The `callee` expression of a CallExpression or NewExpression
 * @returns A dotted name like `"eval"` or `"vm.runInThisContext"`, or `null`
 *
 * @remarks
 * Walks the spine of a `MemberExpression` chain, joining each non-computed
 * property identifier with a `.`. Computed access (`obj["foo"]`) and
 * function-call results in the spine are not resolvable and produce
 * `null`. This is the lookup key against `config.evalFunctions`.
 *
 * @since 1.0.0
 */

function resolveCalleeName(node: unknown): string | null {
    const n = node as { type: string } & Record<string, unknown>;
    if (n.type === 'Identifier') return n.name as string;
    if (n.type === 'MemberExpression' && !n.computed) {
        const prop = n.property as { type: string; name?: string };
        if (prop.type !== 'Identifier' || !prop.name) return null;
        const objName = resolveCalleeName(n.object);
        if (objName === null) return null;

        return `${ objName }.${ prop.name }`;
    }

    return null;
}

/**
 * Walks an AST and collects every string argument passed to a configured eval-like function.
 *
 * @param ast - Root of the parsed program
 * @param evalFunctionNames - Set of dotted callee names that consume JS-as-string
 * @returns Each extracted string with its origin tag and source line
 *
 * @remarks
 * Both `CallExpression` and `NewExpression` are inspected. The callee is
 * resolved via {@link resolveCalleeName}; if the resulting name is in
 * `evalFunctionNames`, every string-literal argument is yielded. Scanning
 * all string args (rather than a fixed positional index) is intentional:
 * it lets a single config entry like `'Function'` cover the body argument
 * without the user specifying `argIndex`, and parameter-name args
 * (`'a'`, `'b'`) are small enough that they pass the minify and comment
 * checks trivially.
 *
 * The origin tag prepends `new ` for `NewExpression` so the resulting
 * label distinguishes `Function("body")` from `new Function("body")` in
 * the output.
 *
 * Non-literal arguments (template literals with interpolation, runtime
 * concatenations, identifiers) are skipped - they cannot be analysed
 * statically.
 *
 * @since 1.0.0
 */

/**
 * Walks an AST and summarises the lengths of all local-declaration identifier names.
 *
 * @param ast - Root of the parsed program
 * @returns Aggregated counts and ratios, or `null` when the file has no captured declarations
 *
 * @remarks
 * Captured shapes:
 * - `VariableDeclarator.id` when the id is an `Identifier` (destructuring patterns skipped)
 * - `FunctionDeclaration.id` and its `Identifier` parameters
 * - `FunctionExpression.id` and its `Identifier` parameters
 * - `ArrowFunctionExpression` `Identifier` parameters
 * - `ClassDeclaration.id`
 *
 * Import specifiers, member expressions, and property accesses are
 * deliberately excluded: their names are dictated by external interfaces
 * (the imported module's exports, the consumed object's shape) and are
 * not renamed by minifiers in the same way local declarations are.
 *
 * @since 1.0.0
 */

function analyzeIdentifiers(ast: Node): IdentifierStatsInterface | null {
    const names: Array<string> = [];

    function pushParams(params: ReadonlyArray<unknown>): void {
        for (const p of params) {
            const param = p as { type: string; name?: string };
            if (param.type === 'Identifier' && param.name) names.push(param.name);
        }
    }

    const visitors: SimpleVisitors<unknown> = {
        VariableDeclarator(node) {
            const id = node.id as { type: string; name?: string };
            if (id.type === 'Identifier' && id.name) names.push(id.name);
        },
        FunctionDeclaration(node) {
            if (node.id?.name) names.push(node.id.name);
            pushParams(node.params);
        },
        FunctionExpression(node) {
            if (node.id?.name) names.push(node.id.name);
            pushParams(node.params);
        },
        ArrowFunctionExpression(node) {
            pushParams(node.params);
        },
        ClassDeclaration(node) {
            if (node.id?.name) names.push(node.id.name);
        }
    };

    walk.simple(ast, visitors);

    if (names.length === 0) return null;
    const sumLen = names.reduce((s, n) => s + n.length, 0);
    const shortCount = names.filter((n) => n.length <= SHORT_NAME_MAX_LENGTH).length;

    return {
        count: names.length,
        meanLength: sumLen / names.length,
        shortRatio: shortCount / names.length
    };
}

function collectEvalStrings(ast: Node, evalFunctionNames: Set<string>): EvalStringInterface[] {
    const strings: Array<EvalStringInterface> = [];

    function pushStringArgs(args: ReadonlyArray<unknown>, origin: string, line: number): void {
        for (const arg of args) {
            const a = arg as { type: string; value?: unknown };
            if (a.type === 'Literal' && typeof a.value === 'string') {
                strings.push({ source: a.value, origin, line });
            }
        }
    }

    const visitors: SimpleVisitors<unknown> = {
        CallExpression(node) {
            const name = resolveCalleeName(node.callee);
            if (name === null || !evalFunctionNames.has(name)) return;
            pushStringArgs(node.arguments, name, node.loc?.start.line ?? 0);
        },
        NewExpression(node) {
            const name = resolveCalleeName(node.callee);
            if (name === null || !evalFunctionNames.has(name)) return;
            pushStringArgs(node.arguments, `new ${ name }`, node.loc?.start.line ?? 0);
        }
    };

    walk.simple(ast, visitors);

    return strings;
}

/**
 * Validates a single JavaScript source string against the active configuration.
 *
 * @param source - Source code to validate
 * @param label - Human-readable identifier reported back on every finding (typically the file path)
 * @param config - Resolved configuration; defaults to {@link DEFAULT_CONFIG} when omitted
 * @returns Zero or more findings; an empty array means the source is clean
 *
 * @remarks
 * Four independent checks are performed and their findings concatenated:
 *
 * 1. **Comments** - every `//` and `/* *\/` block produced by acorn is
 *    reported, except those filtered by {@link isIgnoredComment}.
 *    Severity comes from `config.checks.comment`.
 * 2. **Minification** - {@link checkMinified} flags pretty-printed input.
 *    Severity comes from `config.checks.minify`.
 * 3. **Blacklist** - every configured pattern is matched against the
 *    raw source. Severity comes from the entry's own `level` field.
 * 4. **`eval` / `new Function`** - the AST is walked for literal-string
 *    arguments to these constructs, and each is recursively re-validated
 *    using the same config. Nested findings are labeled
 *    `<parent> → eval@<line>` so the source site can be located.
 *
 * If the parser fails outright, a single finding of the kind ` parse ` is added
 * (severity from `config.checks.parse`), but any comments tokenized
 * before the error position are still reported - this is what makes
 * detection inside an unparseable `eval(...)` body possible.
 *
 * @example
 * ```ts
 * validateSource('console.log(1)', 'app.js', {
 *     ...DEFAULT_CONFIG,
 *     blacklist: [{ pattern: 'console.log', level: 'warn' }]
 * });
 * // [{ label: 'app.js', kind: 'blacklist', severity: 'warn', message: '...' }]
 * ```
 *
 * @see validateFolder
 * @see checkMinified
 * @see scanBlacklist
 * @since 1.0.0
 */

export function validateSource(source: string, label: string, config: ConfigInterface = DEFAULT_CONFIG): Array<ValidationFindingInterface> {
    const findings: Array<ValidationFindingInterface> = [];
    const parsed = parseSource(source);

    if (config.checks.comment !== 'off') {
        for (const c of parsed.comments) {
            if (isIgnoredComment(c, source)) continue;
            const line = c.loc?.start.line;
            const where = line !== undefined ? ` line ${ line }` : '';
            findings.push({
                label,
                kind: 'comment',
                severity: config.checks.comment,
                message: `${ c.type === 'Block' ? 'block' : 'line' } comment found${ where }: ${ JSON.stringify(c.value.slice(0, 60)) }`
            });
        }
    }

    if (config.checks.minify !== 'off') {
        const identifiers = parsed.ast ? analyzeIdentifiers(parsed.ast) ?? undefined : undefined;
        const minify = checkMinified(source, identifiers);
        if (!minify.minified) {
            const parts: Array<string> = [];
            if (minify.signals.identifiers && minify.identifiers) {
                parts.push(`declarations meanLen=${ minify.identifiers.meanLength.toFixed(1) }, short=${ (minify.identifiers.shortRatio * 100).toFixed(0) }%`);
            }
            if (minify.signals.text) {
                parts.push(`whitespace=${ (minify.whitespaceRatio * 100).toFixed(1) }%, avgLineLen=${ minify.avgLineLength.toFixed(0) }`);
            }
            if(minify.signals.comments && minify.comments) {
                parts.push(`comments count=${ minify.comments.count }, ratio=${ (minify.comments.ratio * 100).toFixed(1) }%`);
            }
            findings.push({
                label,
                kind: 'minify',
                severity: config.checks.minify,
                message: `not minified (${ parts.join('; ') })`
            });
        }
    }

    if (config.blacklist.length) {
        const compiled = compileBlacklist(config.blacklist);
        findings.push(...scanBlacklist(source, label, compiled));
    }

    if (parsed.ast) {
        if (config.evalFunctions.length > 0) {
            const evalNames = new Set(config.evalFunctions);
            for (const inner of collectEvalStrings(parsed.ast, evalNames)) {
                const sub = validateSource(inner.source, `${ label } → ${ inner.origin }@${ inner.line }`, config);
                findings.push(...sub);
            }
        }
    } else if (parsed.parseError && config.checks.parse !== 'off') {
        findings.push({
            label,
            kind: 'parse',
            severity: config.checks.parse,
            message: parsed.parseError
        });
    }

    return findings;
}
