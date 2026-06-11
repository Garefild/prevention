#!/usr/bin/env node
/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { ParsedArgsInterface } from '@services/args.service';

/**
 * Imports
 */

import * as path from 'node:path';
import { hideBin } from 'yargs/helpers';
import { validateFolder } from '@services/walker.service';
import { loadConfig, shouldShow } from '@services/config.service';
import { parseArgs, HelpRequestedError } from '@services/args.service';
import { renderBanner, colorSeverity, colorKind, colorOk, colorFail } from '@services/banner.service';

/**
 * Entry point for the `prevention` command.
 *
 * @remarks
 * The flow is:
 * 1. Parse argv via {@link parseArgs}
 * 2. Print the colored startup banner unless `--no-banner` was given
 * 3. Resolve and load the config (defaults ← JSON file ← CLI args)
 * 4. Walk the folder and collect findings
 * 5. Print findings that meet `config.logLevel`, colored by severity
 * 6. Exit with `1` if any finding had severity `error`, otherwise `0`
 *
 * Exit codes:
 * - `0` - no `error`-severity findings (warns and infos may still print)
 * - `1` - at least one finding had severity `error`
 * - `2` - argv was malformed, the folder is missing, or the config file is invalid
 *
 * @example
 * ```sh
 * prevention ./dist
 * prevention --config ./prevention.config.json ./dist
 * prevention --log-level warn ./dist
 * prevention --no-blacklist --no-banner ./dist
 * ```
 *
 * @see parseArgs
 * @see validateFolder
 * @see loadConfig
 * @since 1.0.0
 */

function main(): void {
    let parsed: ParsedArgsInterface;
    try {
        parsed = parseArgs(hideBin(process.argv));
    } catch (e) {
        if (e instanceof HelpRequestedError) process.exit(0);
        console.error(`error: ${ (<Error> e).message }`);
        process.exit(2);
    }

    if (parsed.showBanner) {
        process.stderr.write(renderBanner() + '\n');
    }

    let config;
    try {
        config = loadConfig(parsed.overrides, parsed.configPath);
    } catch (e) {
        console.error(`error: ${ (<Error> e).message }`);
        process.exit(2);
    }

    const folder = path.resolve(parsed.folder);
    try {
        const result = validateFolder(folder, config);
        const visible = result.findings.filter((f) => shouldShow(f.severity, config.logLevel));
        const errorCount = result.findings.filter((f) => f.severity === 'error').length;
        const warnCount = result.findings.filter((f) => f.severity === 'warn').length;
        const infoCount = result.findings.filter((f) => f.severity === 'info').length;

        for (const f of visible) {
            const line = `${ colorSeverity(f.severity, `[${ f.severity }]`) } ${ colorKind(`[${ f.kind }]`) } ${ f.label }: ${ f.message }`;
            const stream = f.severity === 'error' ? console.error : console.warn;
            stream(line);
        }

        if (errorCount > 0) {
            console.error(`\n${ colorFail(`FAIL: ${ errorCount } error, ${ warnCount } warn, ${ infoCount } info across ${ result.fileCount } file(s)`) }`);
            process.exit(1);
        }

        console.log(colorOk(`ok: ${ result.fileCount } file(s) validated in ${ folder } (${ warnCount } warn, ${ infoCount } info)`));
        process.exit(0);
    } catch (e) {
        console.error(`error: ${ (<Error> e).message }`);
        process.exit(2);
    }
}

main();
