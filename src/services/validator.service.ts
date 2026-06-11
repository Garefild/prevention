/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { SimpleVisitors } from 'acorn-walk';
import type { Comment, Node, Program } from 'acorn';
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
 * One parse attempt against a single source string.
 *
 * @remarks
 * `ast` is `null` only when both module-mode and script-mode parse
 * attempts threw. `comments` is populated with everything tokenized
 * before the failure position, so comments inside an unparseable
 * snippet are still surfaced.
 *
 * @since 1.0.0
 */

interface ParseResultInterface {
    ast: Program | null;
    comments: Array<Comment>;
    parseError: string | null;
}

/**
 * One nested source extracted from the parent AST and queued for re-validation.
 *
 * @since 1.0.0
 */

interface NestedSourceInterface {
    source: string;
    origin: string;
    line: number;
}

/**
 * Statements whose presence in a string is strong evidence the string is JS code.
 *
 * @since 1.0.0
 */

const CODEY_STATEMENT_TYPES: ReadonlySet<string> = new Set([
    'VariableDeclaration',
    'FunctionDeclaration',
    'ClassDeclaration',
    'ImportDeclaration',
    'ExportNamedDeclaration',
    'ExportDefaultDeclaration',
    'ExportAllDeclaration',
    'IfStatement',
    'ForStatement',
    'ForInStatement',
    'ForOfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'SwitchStatement',
    'TryStatement',
    'ReturnStatement',
    'ThrowStatement',
    'BreakStatement',
    'ContinueStatement',
    'LabeledStatement'
]);

/**
 * Expression node types that, when wrapped in an ExpressionStatement, indicate code intent.
 *
 * @since 1.0.0
 */

const CODEY_EXPRESSION_TYPES: ReadonlySet<string> = new Set([
    'CallExpression',
    'NewExpression',
    'AssignmentExpression',
    'UpdateExpression',
    'AwaitExpression',
    'YieldExpression'
]);

/**
 * Minimum length a string argument must reach before auto-detection treats it as a candidate.
 *
 * @since 1.0.0
 */

const MIN_AUTO_RECURSE_LENGTH = 20;

/**
 * Parses one source string and returns the AST together with all comments.
 *
 * @param source - JavaScript source to parse
 * @returns AST (when possible), collected comments, and a parse-error message
 *
 * @remarks
 * Tries `sourceType: 'module'` first and falls back to `'script'` on
 * failure. The hashbang line is permitted. Comments are accumulated via
 * the `onComment` callback so even a fatal parse error still surfaces
 * comments seen up to the error position.
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
        return { ast: acorn.parse(source, { ...opts, sourceType: 'module' }), comments, parseError: null };
    } catch {
        try {
            return { ast: acorn.parse(source, { ...opts, sourceType: 'script' }), comments, parseError: null };
        } catch (e) {
            return { ast: null, comments, parseError: (<Error> e).message };
        }
    }
}

/**
 * Decides whether a comment should be ignored as tooling metadata.
 *
 * @param c - Comment node from acorn
 * @param source - Full source the comment came from
 * @returns true - if the comment is a shebang or source-map pragma
 *
 * @remarks
 * - A line comment at offset 0 in a file starting with `#!` is the
 *   shebang interpreter directive.
 * - A line comment whose body (after leading whitespace) starts with
 *   `# sourceMappingURL=` or `@ sourceMappingURL=` is the standard
 *   source-map pragma emitted by minifiers.
 *
 * @since 1.0.0
 */

function isIgnoredComment(c: Comment, source: string): boolean {
    if (c.start === 0 && c.type === 'Line' && source.startsWith('#!')) return true;
    if (c.type !== 'Line') return false;
    const v = c.value.trimStart();

    return v.startsWith('# sourceMappingURL=') || v.startsWith('@ sourceMappingURL=');
}

/**
 * Resolves the dotted name of a Call/New callee.
 *
 * @param node - The `callee` field of a CallExpression or NewExpression
 * @returns A dotted name like `"vm.runInThisContext"`, or `null` for non-identifier shapes
 *
 * @since 1.0.0
 */

function resolveCalleeName(node: unknown): string | null {
    const n = node as { type: string; name?: string; computed?: boolean; property?: { type: string; name?: string }; object?: unknown };
    if (n.type === 'Identifier' && n.name) return n.name;
    if (n.type === 'MemberExpression' && !n.computed && n.property) {
        if (n.property.type !== 'Identifier' || !n.property.name) return null;
        const obj = resolveCalleeName(n.object);
        if (obj === null) return null;

        return `${ obj }.${ n.property.name }`;
    }

    return null;
}

/**
 * Extracts the string value of an argument that is a string-literal-shaped expression.
 *
 * @param node - One argument from a CallExpression / NewExpression
 * @returns The string contents, or `null` for non-string-literal shapes
 *
 * @remarks
 * Two AST shapes return a value:
 * - `Literal` whose `value` is a string (covers both `'...'` and `"..."`).
 * - `TemplateLiteral` with **no** `${...}` interpolations - i.e. a
 *   single `TemplateElement` quasi and an empty `expressions` array.
 *
 * Template literals with interpolations and runtime concatenations are
 * skipped: their final value isn't known until runtime so they cannot
 * be analysed statically.
 *
 * @since 1.0.0
 */

function readStringArg(node: unknown): string | null {
    const n = node as { type: string; value?: unknown; expressions?: ReadonlyArray<unknown>; quasis?: ReadonlyArray<{ value: { cooked?: string; raw: string } }> };
    if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
    if (n.type === 'TemplateLiteral' && n.expressions?.length === 0 && n.quasis?.length === 1) {
        return n.quasis[0].value.cooked ?? n.quasis[0].value.raw;
    }

    return null;
}

/**
 * Returns true when a top-level AST statement is something a code author writes.
 *
 * @param stmt - One element of `Program.body`
 * @returns true - if the statement type suggests real code rather than data
 *
 * @remarks
 * Used by {@link isLikelyCode} to distinguish a multi-line text string
 * (whose body parses as a sequence of bare `Identifier` references) from
 * an actual JS source string (which has declarations, control flow, or
 * meaningful expression statements like calls and assignments).
 *
 * @since 1.0.0
 */

function isCodeyStatement(stmt: unknown): boolean {
    const s = stmt as { type: string; expression?: { type: string } };
    if (CODEY_STATEMENT_TYPES.has(s.type)) return true;
    if (s.type === 'ExpressionStatement' && s.expression) {
        return CODEY_EXPRESSION_TYPES.has(s.expression.type);
    }

    return false;
}

/**
 * Decides whether a string passed as a function argument is itself JavaScript source code.
 *
 * @param s - The candidate string value
 * @returns true - if `s` parses as JS and contains real code constructs
 *
 * @remarks
 * Cheap pre-filters reject strings that are too short or single-line, so
 * the parse attempt only runs on plausible candidates. The verdict comes
 * from the AST: at least one top-level statement must be "codey" - a
 * declaration, control-flow construct, or call/assignment expression.
 * Plain text like `"Line 1\nLine 2"` parses as identifier references
 * and is correctly rejected.
 *
 * @since 1.0.0
 */

function isLikelyCode(s: string): boolean {
    if (s.length < MIN_AUTO_RECURSE_LENGTH || !s.includes('\n')) return false;
    const parsed = parseSource(s);
    if (!parsed.ast) return false;

    return parsed.ast.body.some(isCodeyStatement);
}

/**
 * Walks an AST and summarises the lengths of all local-declaration identifier names.
 *
 * @param ast - Root of the parsed program
 * @returns Aggregated counts, or `null` when nothing was captured
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

/**
 * Walks an AST and extracts every string-literal arg that should be re-validated.
 *
 * @param ast - Root of the parsed program
 * @param forced - Set of dotted callee names whose string args are always extracted
 * @returns Each extracted string with an origin tag and source line
 *
 * @remarks
 * Both `CallExpression` and `NewExpression` are inspected. For every
 * string-literal-shaped argument (see {@link readStringArg}) the
 * function emits a nested source when **either**:
 *
 * - The callee's resolved name (from {@link resolveCalleeName}) is in
 *   `forced` - matches the user's `config.evalFunctions` list. This
 *   path catches short eval bodies like `eval("a+b")` that wouldn't
 *   trip auto-detection.
 * - {@link isLikelyCode} returns true - the string is long enough,
 *   multi-line, and parses as JS with at least one real statement.
 *   This path catches template-literal smuggling like a logger
 *   receiving a backtick-quoted JS source dump, without configuration.
 *
 * @since 1.0.0
 */

function extractNestedSources(ast: Node, forced: ReadonlySet<string>): Array<NestedSourceInterface> {
    const out: Array<NestedSourceInterface> = [];

    function consider(args: ReadonlyArray<unknown>, origin: string, line: number, forceAll: boolean): void {
        for (const arg of args) {
            const s = readStringArg(arg);
            if (s === null) continue;
            if (forceAll || isLikelyCode(s)) {
                out.push({ source: s, origin, line });
            }
        }
    }

    const visitors: SimpleVisitors<unknown> = {
        CallExpression(node) {
            const name = resolveCalleeName(node.callee);
            const force = name !== null && forced.has(name);
            consider(node.arguments, name ?? '<call>', node.loc?.start.line ?? 0, force);
        },
        NewExpression(node) {
            const name = resolveCalleeName(node.callee);
            const force = name !== null && forced.has(name);
            consider(node.arguments, name ? `new ${ name }` : '<new>', node.loc?.start.line ?? 0, force);
        }
    };

    walk.simple(ast, visitors);

    return out;
}

/**
 * Validates a single JavaScript source string against the active configuration.
 *
 * @param source - Source code to validate
 * @param label - Identifier reported on every finding (typically the file path)
 * @param config - Resolved configuration; defaults to {@link DEFAULT_CONFIG}
 * @returns Zero or more findings; empty means the source is clean
 *
 * @remarks
 * Four independent checks run and their findings are concatenated:
 *
 * 1. **Comments** - every `//` and `/* *\/` block from acorn, minus the
 *    shebang and source-map pragmas filtered by {@link isIgnoredComment}.
 * 2. **Minification** - {@link checkMinified} called with the AST-derived
 *    identifier stats from {@link analyzeIdentifiers}.
 * 3. **Blacklist** - configured patterns scanned against the raw source
 *    via {@link scanBlacklist}.
 * 4. **Nested sources** - {@link extractNestedSources} collects every
 *    string-literal-shaped argument to a CallExpression/NewExpression
 *    that either matches `config.evalFunctions` or auto-detects as code,
 *    and each one is recursively validated with the same config. The
 *    finding label becomes `<parent> → <callee>@<line>`.
 *
 * A parse failure produces a single `parse`-kind finding (unless that
 * check is `off`) but comments tokenized before the failure point are
 * still reported.
 *
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
            findings.push({
                label,
                kind: 'minify',
                severity: config.checks.minify,
                message: `not minified (${ parts.join('; ') })`
            });
        }
    }

    if (config.blacklist.length) {
        findings.push(...scanBlacklist(source, label, compileBlacklist(config.blacklist)));
    }

    if (parsed.ast) {
        const forced = new Set(config.evalFunctions);
        for (const nested of extractNestedSources(parsed.ast, forced)) {
            findings.push(...validateSource(nested.source, `${ label } → ${ nested.origin }@${ nested.line }`, config));
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
