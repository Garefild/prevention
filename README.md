# prevention

[![npm version](https://img.shields.io/npm/v/prevention.svg)](https://www.npmjs.com/package/prevention)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![CI](https://github.com/Garefild/prevention/actions/workflows/ci.yml/badge.svg)](https://github.com/Garefild/prevention/actions/workflows/ci.yml)

A pre-publish guard for JavaScript output. Walks a `dist/` folder and fails the
release when files are not minified, contain comments, or hit a configurable
string blacklist. Recurses into the body of every `eval(...)` and `new Function(...)`
literal so secrets hidden inside string-encoded code can't slip past.

## Key Features

- **Comment-free check**: any `//` or `/* */` block fails the validation, with the file path and line.
- **Minification heuristic**: combined whitespace-ratio and average-line-length test, tuned to catch pretty-printed input without false positives on legitimate one-liners.
- **String blacklist**: ban `console.log`, `debugger`, `TODO`, anything else - substring or `/regex/flags` patterns.
- **Severity levels** per check and per blacklist entry: `info`, `warn`, `error`. Only `error` fails the build.
- **Configurable**: JSON config file, auto-discovered or pointed at with `--config`. Every option overridable from CLI flags.
- **`eval` recursion**: the body of `eval("...")` and `new Function(args..., "body")` is re-parsed and re-validated against the same config.
- **TypeScript + ESM**: programmatic API for use inside other build tools.

## Installation

```bash
npm install --save-dev prevention
```

Requires Node.js 22 or later (uses the built-in `path.matchesGlob`). Runtime dependencies: `acorn`, `acorn-walk`, `yargs`, `@remotex-labs/xansi`.

## Quick start

```bash
# add a script
npm pkg set scripts.prepublishOnly="prevention ./dist"

# or run it directly
npx prevention ./dist
```

A clean `dist/` produces:

```
ok: 12 file(s) validated in /repo/dist (0 warn, 0 info)
```

A dirty one produces:

```
[error] [comment]   app.js: block comment found line 5: " hi "
[warn]  [blacklist] app.js: matched "console.log" line 12
[error] [minify]    helper.js: not minified (whitespace=21.4%, avgLineLen=20)

FAIL: 2 error, 1 warn, 0 info across 12 file(s)
```

with exit code `1`.

## Configuration

`prevention` looks for `./prevention.config.json` in the working directory.
Pass `--config <path>` to use a different file.

```json
{
    "logLevel": "info",
    "ignore": [ "*.spec.js", "test/**" ],
    "blacklist": [
        { "pattern": [ "console.log", "console.error" ], "level": "warn" },
        { "pattern": "/\\bdebugger\\b/",                  "level": "error", "message": "stray debugger" },
        { "pattern": "TODO",                              "level": "info" }
    ],
    "checks": {
        "comment": "error",
        "minify":  "error",
        "parse":   "error"
    }
}
```

| Field            | Type                                                                     | Default                  |
|------------------|--------------------------------------------------------------------------|--------------------------|
| `logLevel`       | `'info' \| 'warn' \| 'error'`                                            | `'info'`                 |
| `ignore`         | `string[]` of glob patterns                                              | `[]`                     |
| `blacklist`      | `Array<{ pattern, level, message? }>`                                    | `[]`                     |
| `evalFunctions`  | `string[]` of callee names whose string args contain JS                  | `[ 'eval', 'Function' ]` |
| `checks`         | `{ comment, minify, parse }` each `'off' \| 'info' \| 'warn' \| 'error'` | all `'error'`            |

**Severity values** are `'info'`, `'warn'`, `'error'`, or `'off'`. Setting a
check (or a blacklist entry's `level`) to `'off'` disables it entirely - no
finding is produced, nothing is printed, nothing counts toward the exit code.
Use this to ship intentionally-commented or pretty-printed code without
removing the check from the config: `"checks": { "comment": "off" }` allows
comments while leaving the minify and blacklist checks active.

**Ignore globs** are matched against the file path relative to the validated
folder. A pattern without `/` is implicitly anchored at any depth, so
`*.spec.js` skips spec files anywhere in the tree; `test/**` skips a top-level
`test/` directory; `src/*.ts` only matches at the root. Backslashes are
normalized to forward slashes so the same config works on Windows and Unix.

**Blacklist patterns** are treated as plain substrings (case-sensitive) unless
they match the form `/source/flags`, in which case they compile to a `RegExp`.
`pattern` may be a single string or an array of strings - an array entry
expands to one matcher per element, all sharing the same `level` and optional
`message`. The optional `message` field replaces the default
`matched "<pattern>"` text on findings.

**Eval-like functions** are call sites whose string arguments are themselves
JavaScript and should be validated recursively. `eval` and `Function` are
covered by default; add any others your codebase uses:

```text
"evalFunctions": [
    "eval",
    "Function",
    "vm.runInThisContext",
    "vm.compileFunction",
    "setTimeout",
    "myExecutor"
]
```

Dotted names (`vm.runInThisContext`) are matched against the static spine of
the callee, so `vm.runInThisContext(code)` matches but a runtime
`globalThis[name](code)` does not. Both `foo("code")` and `new foo("code")`
call shapes are recognized; the nested-finding label distinguishes them
(`app.js → foo@1` vs `app.js → new foo@1`). Every string-literal argument
is scanned, so `new Function('a', 'b', 'return a+b')` covers the body
without needing an index hint. The list **replaces** the default - include
`'eval'` and `'Function'` explicitly if you want them alongside your
additions.

## CLI

```
Usage: prevention [options] <folder>

Options:
  -c, --config <path>       Path to JSON config (default: ./prevention.config.json)
  -l, --log-level <level>   Min severity to print: info | warn | error
  --no-blacklist            Disable any configured blacklist patterns
  --no-banner               Suppress the startup banner
  -h, --help                Show this help
```

CLI flags override the file. Precedence (lowest to highest): defaults → JSON file → CLI args.

### Exit codes

| Code | Meaning                                                                          |
|------|----------------------------------------------------------------------------------|
| `0`  | every finding had severity below `error` (warns and infos may still print)       |
| `1`  | one or more `error`-severity findings were produced                              |
| `2`  | argv was malformed, the folder is missing, or the config file is invalid JSON    |

`--log-level` only changes what is printed. It never changes the exit code -
hidden `error` findings still fail the build.

## Programmatic API

```ts
import {
    validateFolder,
    validateSource,
    loadConfig,
    type ConfigInterface,
    type ValidationFindingInterface
} from 'prevention';

const config = loadConfig({ logLevel: 'warn' }, undefined);
const result = validateFolder('./dist', config);

const errors = result.findings.filter((f) => f.severity === 'error');
if (errors.length) process.exit(1);
```

Re-use the per-file validator on an in-memory string:

```ts
const findings = validateSource('console.log(1)', 'app.js', {
    ...DEFAULT_CONFIG,
    blacklist: [{ pattern: 'console.log', level: 'warn' }]
});
```

## Severity model

Each finding carries one of `info`, `warn`, or `error`. The severity comes from:

- `config.checks.<kind>` for built-in checks (`comment`, `minify`, `parse`)
- The `level` field on the blacklist entry for `blacklist` findings

Two independent dials control behavior:

- `logLevel` (file or `--log-level`) filters which findings are **printed**.
- The **exit code** is driven by the raw count of `error`-severity findings, regardless of `logLevel`.

This separation lets you keep `--log-level error` in CI logs while still surfacing every blocking issue in the final summary.

## Self-validation

`prevention` validates its own published `dist/` on every CI run. The build is
its own dog-food: any release that fails its own check never reaches npm.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Mozilla Public License - see [LICENSE](LICENSE).
