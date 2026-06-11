/**
 * Type-only imports erased during TypeScript compilation.
 */

import type { ConfigInterface } from '@interfaces/config.interface';
import type { ValidationFindingInterface, ValidationResultInterface } from '@interfaces/validator.interface';

/**
 * Imports
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isIgnored } from '@services/ignore.service';
import { DEFAULT_CONFIG } from '@services/config.service';
import { validateSource } from '@services/validator.service';

/**
 * File-extension filter applied while traversing a folder tree.
 *
 * @remarks
 * Matches `.js`, `.mjs`, and `.cjs` files. JSON, declaration files,
 * source maps, and asset files are deliberately skipped - the validator
 * only operates on executable JavaScript.
 *
 * @since 1.0.0
 */

const JS_FILE_PATTERN = /\.(c|m)?js$/;

/**
 * Recursively yields every JavaScript file under a directory.
 *
 * @param root - Absolute or relative folder to walk
 * @returns Generator producing one file path per yield
 *
 * @remarks
 * Performs an iterative depth-first walk using an explicit stack to
 * avoid blowing the call stack on deep trees. Directories are entered
 * unconditionally; symbolic links are followed by `readdirSync` only
 * when they resolve to a directory entry (Node default).
 *
 * Only files whose names match {@link JS_FILE_PATTERN} are yielded.
 * Ignore-pattern filtering happens in {@link validateFolder}, not here,
 * so this generator stays a pure file-system walk.
 *
 * @example
 * ```ts
 * for (const file of walkFiles('./dist')) {
 *   console.log(file);
 * }
 * ```
 *
 * @see validateFolder
 * @since 1.0.0
 */

export function* walkFiles(root: string): Generator<string> {
    const stack: Array<string> = [ root ];
    while (stack.length) {
        const dir = stack.pop()!;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                stack.push(p);
            } else if (e.isFile() && JS_FILE_PATTERN.test(e.name)) {
                yield p;
            }
        }
    }
}

/**
 * Validates every JavaScript file in a folder tree.
 *
 * @param folder - Path to the directory to validate
 * @param config - Resolved configuration; defaults to {@link DEFAULT_CONFIG} when omitted
 * @returns Aggregated count of files and the flat list of all findings
 *
 * @throws Error - When `folder` does not exist or is not a directory
 *
 * @remarks
 * Walks the folder with {@link walkFiles}, applies the user-configured
 * ignore globs to skip files like `*.spec.js` or `test/**`, reads each
 * surviving file as UTF-8, and delegates per-file checking to
 * {@link validateSource}. Finding labels are made relative to `folder`
 * so the output is portable across machines. Validation continues
 * across files even when one file produces findings - the caller
 * decides what to do with the aggregate (the CLI exits non-zero only
 * when at least one finding has severity `error`).
 *
 * `fileCount` reflects the number of files actually validated, **after**
 * ignored files are filtered out.
 *
 * @example
 * ```ts
 * const result = validateFolder('./dist', config);
 * const errors = result.findings.filter((f) => f.severity === 'error');
 * if (errors.length) process.exit(1);
 * ```
 *
 * @see validateSource
 * @see walkFiles
 * @since 1.0.0
 */

export function validateFolder(folder: string, config: ConfigInterface = DEFAULT_CONFIG): ValidationResultInterface {
    const stat = fs.statSync(folder);
    if (!stat.isDirectory()) {
        throw new Error(`not a directory: ${ folder }`);
    }

    const findings: Array<ValidationFindingInterface> = [];
    let fileCount = 0;
    for (const file of walkFiles(folder)) {
        const relative = path.relative(folder, file);
        if (isIgnored(relative, config.ignore)) continue;
        fileCount++;
        const source = fs.readFileSync(file, 'utf8');
        const fileFindings = validateSource(source, relative, config);
        findings.push(...fileFindings);
    }

    return { fileCount, findings };
}
