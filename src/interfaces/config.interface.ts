/**
 * Severity level attached to every finding the validator produces.
 *
 * @remarks
 * Ordered from least to most severe: `info` `warn` `error`. Only
 * findings with severity `error` cause the CLI to exit non-zero. The
 * `--log-level` flag filters which findings are printed but does not
 * change how exit codes are computed.
 *
 * @since 1.0.0
 */

export type SeverityType = 'info' | 'warn' | 'error';

/**
 * Severity assignable to a configurable check or blacklist entry.
 *
 * @remarks
 * Same shape as {@link SeverityType} plus `'off'`, which disables the
 * check (or blacklist entry) entirely. A finding with severity `off`
 * is never emitted, never printed, and never counted toward the exit
 * code. Use `off` when you want to ship comments or pretty-printed JS
 * without removing the check from your config.
 *
 * Findings themselves always carry {@link SeverityType} - they cannot
 * have severity `off` by construction, because the validator skips
 * disabled checks before producing any finding.
 *
 * @since 1.0.0
 */

export type CheckSeverityType = SeverityType | 'off';

/**
 * One entry in the user-configurable string blacklist.
 *
 * @remarks
 * `pattern` may be a single string or an array of strings. Each string
 * is compiled independently: if it matches the shape `/source/flags` it
 * becomes a regular expression, otherwise it is treated as a plain
 * substring (case-sensitive). Every compiled matcher inherits the same
 * `level` and `message`, so an array entry is a compact way to express
 * "ban any of these tokens at this severity".
 *
 * `message` is an optional human-readable replacement for the default
 * `"matched <pattern>"` text.
 *
 * @example
 * ```json
 * { "pattern": "console.log",                           "level": "warn" }
 * { "pattern": [ "console.log", "console.error" ],     "level": "warn" }
 * { "pattern": "/\\bdebugger\\b/",                      "level": "error" }
 * { "pattern": "TODO",                                  "level": "info", "message": "leftover marker" }
 * ```
 *
 * @since 1.0.0
 */

export interface BlacklistEntryInterface {
    level: CheckSeverityType;
    pattern: string | Array<string>;
    message?: string;
}

/**
 * Severity assigned to each built-in validator check.
 *
 * @remarks
 * Every kind defaults to `error`. Set a kind to `warn` or `info` to
 * downgrade it so it no longer fails the build but is still reported.
 * Set it to `off` to disable the check entirely - useful when you
 * intentionally ship unminified code or want to allow comments without
 * turning off the rest of the validator.
 *
 * @since 1.0.0
 */

export interface ChecksConfigInterface {
    parse: CheckSeverityType;
    minify: CheckSeverityType;
    comment: CheckSeverityType;
}

/**
 * Fully resolved validator configuration after merging defaults, file, and CLI args.
 *
 * @remarks
 * Constructed by {@link loadConfig}. CLI consumers should never
 * instantiate this directly - go through the loader so that defaults
 * and override precedence are applied consistently.
 *
 * @since 1.0.0
 */

export interface ConfigInterface {
    checks: ChecksConfigInterface;
    ignore: Array<string>;
    logLevel: SeverityType;
    blacklist: Array<BlacklistEntryInterface>;
    evalFunctions: Array<string>;
}

/**
 * Partial override applied on top of the defaults or the loaded file.
 *
 * @remarks
 * Used internally as the shape both the JSON config file and the CLI
 * argument parser produce. `undefined` fields are ignored during merge.
 *
 * @since 1.0.0
 */

export interface PartialConfigInterface {
    checks?: Partial<ChecksConfigInterface>;
    ignore?: Array<string>;
    logLevel?: SeverityType;
    blacklist?: Array<BlacklistEntryInterface>;
    evalFunctions?: Array<string>;
}
