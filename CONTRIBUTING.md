# Contributing to prevention

Thanks for your interest in contributing.
Bug reports, fixes, features, and documentation improvements are all welcome.
This guide explains how to set up the project and get a change merged.

## Code of conduct

By participating you agree to follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be respectful and constructive in issues, pull requests, and reviews.

## Ways to contribute

- **Report a bug**: open a [bug report](https://github.com/your-org/prevention/issues/new?template=bug_report.md) with a minimal reproduction.
- **Request a feature**: open a [feature request](https://github.com/your-org/prevention/issues/new?template=feature_request.md) describing the use case.
- **Send a pull request**: fix a bug, add a feature, or improve the docs.

Search [existing issues](https://github.com/your-org/prevention/issues) first to avoid duplicates.

## Development setup

`prevention` uses [pnpm](https://pnpm.io/) and requires Node.js 22 or later.

```bash
git clone https://github.com/your-org/prevention.git
cd prevention
pnpm install
```

### Scripts

| Command                | Description                                   |
|------------------------|-----------------------------------------------|
| `pnpm build`           | Build to `dist/` with xBuild (ESM, minified). |
| `pnpm dev`             | Build in watch mode.                          |
| `pnpm build:clean`     | Remove `dist/` and rebuild from scratch.      |
| `pnpm test`            | Run the test suite (xJet).                    |
| `pnpm test:coverage`   | Run tests with coverage.                      |
| `pnpm lint`            | Run ESLint + TypeScript type check.           |
| `pnpm lint:eslint`     | Run ESLint over the workspace.                |
| `pnpm lint:typescript` | Run the TypeScript type check via xBuild.     |

Run `pnpm lint`, `pnpm test`, and `pnpm build` before opening a pull request. CI runs these as separate jobs.

## Workflow

1. Fork the repository and create a branch from `main`.

   ```bash
   git checkout -b feature/short-description
   ```

2. Make your change, with tests and TSDoc.
3. Verify everything passes:

   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```

4. Have `prevention` validate its own output:

   ```bash
   node dist/esm/cli.js --no-banner dist
   ```

5. Push your branch and open a pull request against `main`. Fill in the pull request template.

Keep pull requests small and focused; they are easier to review and merge.

## Commit messages

Follow the existing history: a lowercase area prefix, a colon, then an imperative summary.

```text
validator: Recurse into new Function() bodies
config: Allow regex blacklist patterns
cli: Color severity tags via xansi
```

- Use the imperative mood ("Add", not "Added" or "Adds").
- Keep the first line at or under 72 characters.
- Reference related issues in the body (for example, `Closes #123`).

## Coding standards

- Write **TypeScript** with explicit types; avoid `any` outside of acorn-walk shims.
- Document every exported symbol with **TSDoc**, including an `@since` tag. Keep the tag order consistent with the
  rest of the codebase: description, `@param`, `@returns`, `@throws`, `@remarks`, `@example`, `@see`, `@since`.
- Keep functions small, pure, and testable. The `services/` layer is the place for logic; `cli.ts` only orchestrates.
- Match the surrounding style: 4-space indent, single quotes, trailing-space free. `npm run lint` enforces it.

## Tests

Tests use **xJet**. Place a `*.spec.ts` file next to the code it covers.

```ts
import { validateSource } from './validator.service';

test('flags a block comment as error by default', () => {
    const src = '!function(){"use strict";/* leftover */console.log(1);}();';
    const findings = validateSource(src, 'bad.js');
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
});
```

Cover edge cases: parse failures inside `eval` strings, blacklist patterns crossing line boundaries, the shebang and source-map pragma exclusions, and config merge precedence.

## Versioning

`prevention` follows [Semantic Versioning](https://semver.org/): MAJOR for incompatible API changes, MINOR for backward-compatible features, and PATCH for backward-compatible fixes.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
