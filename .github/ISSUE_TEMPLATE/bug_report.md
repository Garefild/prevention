---
name: 🐞 Bug Report
title: 🐞 Bug Report
about: Something is broken
labels: [ "bug", "needs triage" ]
---

**Describe the bug**

A clear and concise description of what is wrong.

**Reproduction**

The minimal folder layout / config / command that triggers the problem.

```sh
# command
prevention --config ./prevention.config.json ./dist
```

```json - prevention.config.json
{
  "blacklist": [
    { "pattern": "console.log", "level": "warn" }
  ]
}
```

**Expected behavior**

What you expected to happen (exit code, output, findings).

**Actual behavior**

What actually happened. Paste the full output including the exit code.

```text
[error] ...
FAIL: ...
exit=...
```

**Environment**

|                       | |
|-----------------------|-|
| `prevention` version  | |
| Node.js version       | |
| OS                    | |

**Checklist**

- [ ] I have searched for existing issues, and this is not a duplicate.
- [ ] I am using the latest published version.
- [ ] I have included a minimal reproduction above.
