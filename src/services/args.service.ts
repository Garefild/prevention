/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { SeverityType, PartialConfigInterface } from '@interfaces/config.interface';

/**
 * Imports
 */

import yargs from 'yargs';

/**
 * Output of CLI argument parsing before merging into the config.
 *
 * @remarks
 * `folder` is the single positional argument. `configPath` carries the
 * value of `--config` (if any). `overrides` holds the partial config
 * built from the remaining flags and is later merged on top of any
 * loaded JSON file. `showBanner` is the resolved value of the
 * `--no-banner` toggle.
 *
 * @since 1.0.0
 */

export interface ParsedArgsInterface {
    folder: string;
    configPath?: string;
    overrides: PartialConfigInterface;
    showBanner: boolean;
}

/**
 * Sentinel error thrown by {@link parseArgs} when the user passed `--help` / `-h`.
 *
 * @remarks
 * yargs in `exitProcess(false)` mode prints help and returns without
 * either populating the positional or invoking `.fail()`. Distinguishing
 * "help shown" from "invalid argv" in the caller lets the CLI exit
 * with `0` for the former and `2` for the latter.
 *
 * @since 1.0.0
 */

export class HelpRequestedError extends Error {
    constructor() {
        super('help requested');
        this.name = 'HelpRequestedError';
    }
}

/**
 * Allowed severity values used to validate flag arguments.
 *
 * @since 1.0.0
 */

const ALLOWED_LEVELS = [ 'info', 'warn', 'error' ] as const;

/**
 * Trailing text rendered below the auto-generated yargs help.
 *
 * @remarks
 * yargs covers the flag table and positional arguments on its own; the
 * epilog adds documentation for the three exit-code states the CLI
 * commits to, which yargs has no built-in way to express.
 *
 * @since 1.0.0
 */

const HELP_EPILOG = `Exit codes:
  0  every finding had severity below 'error'
  1  one or more 'error'-severity findings were produced
  2  bad arguments or filesystem error`;

/**
 * Parses an argv list into a {@link ParsedArgsInterface}.
 *
 * @param argv - Argument list (typically `hideBin(process.argv)`)
 * @returns Parsed positional and option values
 *
 * @throws Error - When a flag is unknown, the folder is omitted, or an enum value is invalid
 *
 * @remarks
 * Wraps yargs in synchronous, no-process-exit mode so the caller can
 * decide what exit code to use. yargs handles `--help` itself - it
 * prints help text to stdout and exits with code `0` before this
 * function returns. Negated booleans (`--no-blacklist`, `--no-banner`)
 * are mapped to `overrides.blacklist = []` and `showBanner = false`
 * respectively.
 *
 * @example
 * ```ts
 * parseArgs([ '--config', './c.json', '--log-level', 'warn', './dist' ]);
 * // {
 * // folder: './dist',
 * // configPath: './c.json',
 * // overrides: { logLevel: 'warn' },
 * // showBanner: true
 * // }
 * ```
 *
 * @since 1.0.0
 */

export function parseArgs(argv: Array<string>): ParsedArgsInterface {
    const parsed = yargs(argv)
        .locale('en')
        .scriptName('prevention')
        .usage('Usage: $0 [options] <folder>')
        .command('$0 <folder>', 'Validate every JS file under <folder>', (y) =>
            y.positional('folder', {
                type: 'string',
                describe: 'Folder to validate'
            })
        )
        .option('config', {
            alias: 'c',
            type: 'string',
            describe: 'Path to JSON config (default: ./prevention.config.json)'
        })
        .option('log-level', {
            alias: 'l',
            choices: ALLOWED_LEVELS,
            describe: 'Min severity to print: info | warn | error'
        })
        .option('blacklist', {
            type: 'boolean',
            default: true,
            describe: 'Pass --no-blacklist to disable configured patterns'
        })
        .option('banner', {
            type: 'boolean',
            default: true,
            describe: 'Pass --no-banner to suppress the startup banner'
        })
        .strict()
        .help('help')
        .alias('help', 'h')
        .version(false)
        .epilog(HELP_EPILOG)
        .exitProcess(false)
        .fail((msg, err) => {
            throw err ?? new Error(msg);
        })
        .parseSync();

    if (typeof parsed.folder !== 'string') {
        throw new HelpRequestedError();
    }

    const overrides: PartialConfigInterface = {};
    if (parsed.logLevel) overrides.logLevel = parsed.logLevel as SeverityType;
    if (!parsed.blacklist) overrides.blacklist = [];

    return {
        folder: parsed.folder,
        configPath: parsed.config,
        overrides,
        showBanner: parsed.banner
    };
}
