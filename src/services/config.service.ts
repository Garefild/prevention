/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { SeverityType, ConfigInterface } from '@interfaces/config.interface';
import type { PartialConfigInterface, ChecksConfigInterface } from '@interfaces/config.interface';

/**
 * Imports
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Default config used when no JSON file is found and no CLI override is given.
 *
 * @remarks
 * Mirrors the behavior of the pre-config version of the tool: every
 * built-in check fires at `error` severity, no blacklist patterns are
 * active, and every finding is shown.
 *
 * @since 1.0.0
 */

export const DEFAULT_CONFIG: ConfigInterface = {
    logLevel: 'info',
    ignore: [],
    blacklist: [],
    evalFunctions: [ 'eval', 'Function' ],
    checks: {
        comment: 'error',
        minify: 'error',
        parse: 'error'
    }
};

/**
 * Filename auto-detected in the working directory when no `--config` is given.
 *
 * @since 1.0.0
 */

export const DEFAULT_CONFIG_FILENAME = 'prevention.config.json';

/**
 * Numeric rank used to compare two severities.
 *
 * @remarks
 * Higher number = more severe. Used by {@link shouldShow} to filter
 * findings against the configured `logLevel`.
 *
 * @since 1.0.0
 */

const SEVERITY_RANK: Record<SeverityType, number> = {
    info: 0,
    warn: 1,
    error: 2
};

/**
 * Decides whether a finding meets the user's minimum severity filter.
 *
 * @param severity - Severity attached to the finding
 * @param min - Minimum severity the user wants to see
 * @returns true - if the finding should be printed
 *
 * @remarks
 * The exit-code logic in cli is independent of this filter -
 * `error` findings always count toward the failure exit code even when
 * `logLevel` hides them.
 *
 * @since 1.0.0
 */

export function shouldShow(severity: SeverityType, min: SeverityType): boolean {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

/**
 * Parses a config file from disk if one exists at the given path.
 *
 * @param filePath - Path to a JSON config file
 * @returns Parsed partial config, or `null` when the file does not exist
 *
 * @throws Error - When the file exists but cannot be read or parsed as JSON
 *
 * @remarks
 * Only JSON is supported. Returning `null` lets the caller distinguish
 * "no file present" (use defaults) from "file present but invalid"
 * (fail loudly).
 *
 * @since 1.0.0
 */

export function readConfigFile(filePath: string): PartialConfigInterface | null {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
        return JSON.parse(raw) as PartialConfigInterface;
    } catch (e) {
        throw new Error(`failed to parse config ${ filePath }: ${ (<Error> e).message }`);
    }
}

/**
 * Locates the config file the CLI should read.
 *
 * @param explicitPath - Path supplied via `--config`, or `undefined` for auto-detect
 * @param cwd - Working directory used for auto-detection
 * @returns Resolved absolute path, or `null` when neither a flag nor an auto-detected file exists
 *
 * @throws Error - When `explicitPath` was supplied but the file does not exist
 *
 * @remarks
 * An explicit path is treated as a hard requirement: a missing file
 * raises an error rather than silently falling back to defaults. With
 * no flag the loader looks for {@link DEFAULT_CONFIG_FILENAME} in
 * `cwd` and silently skips loading if it is absent.
 *
 * @since 1.0.0
 */

export function resolveConfigPath(explicitPath: string | undefined, cwd: string): string | null {
    if (explicitPath) {
        const resolved = path.resolve(cwd, explicitPath);
        if (!fs.existsSync(resolved)) {
            throw new Error(`config file not found: ${ resolved }`);
        }

        return resolved;
    }

    const auto = path.join(cwd, DEFAULT_CONFIG_FILENAME);

    return fs.existsSync(auto) ? auto : null;
}

/**
 * Merges a partial config on top of a base, producing a fully-resolved config.
 *
 * @param base - Lower-precedence config
 * @param override - Higher-precedence partial overrides; `undefined` fields are ignored
 * @returns New {@link ConfigInterface} with overrides applied
 *
 * @remarks
 * `blacklist` arrays are replaced wholesale, not concatenated - this
 * matches how most linter configs handle list-valued settings and
 * means the CLI can completely disable the list with `[]`. The
 * `checks` object is shallow-merged so partial overrides like
 * `{ comment: 'warn' }` keep the other check severities intact.
 *
 * @since 1.0.0
 */

export function mergeConfig(base: ConfigInterface, override: PartialConfigInterface): ConfigInterface {
    return {
        logLevel: override.logLevel ?? base.logLevel,
        ignore: override.ignore ?? base.ignore,
        blacklist: override.blacklist ?? base.blacklist,
        evalFunctions: override.evalFunctions ?? base.evalFunctions,
        checks: {
            ...base.checks,
            ...(override.checks ?? {}) as Partial<ChecksConfigInterface>
        }
    };
}

/**
 * Builds the final config used by a single CLI invocation.
 *
 * @param cliOverrides - Partial config built from parsed argv
 * @param explicitConfigPath - Path supplied via `--config`, or `undefined`
 * @param cwd - Working directory for auto-detection (defaults to `process.cwd()`)
 * @returns Fully-resolved {@link ConfigInterface}
 *
 * @throws Error - When the explicit config path is missing or the file is invalid JSON
 *
 * @remarks
 * Precedence (lowest to highest): {@link DEFAULT_CONFIG} → JSON file →
 * CLI overrides. The function never mutates its inputs and is safe to
 * call repeatedly in the same process.
 *
 * @since 1.0.0
 */

export function loadConfig(
    cliOverrides: PartialConfigInterface,
    explicitConfigPath: string | undefined,
    cwd: string = process.cwd()
): ConfigInterface {
    const filePath = resolveConfigPath(explicitConfigPath, cwd);
    const fileConfig = filePath ? readConfigFile(filePath) : null;
    let config = DEFAULT_CONFIG;
    if (fileConfig) config = mergeConfig(config, fileConfig);

    return mergeConfig(config, cliOverrides);
}
