# pnpm audit fix (2026-09-10)

## Result
- Before: 58 vulnerabilities (1 low | 15 moderate | 39 high | 3 critical)
- After: 0 known vulnerabilities

## Notes
- Repo uses `pnpm@9.15.4` (not npm); equivalent is `pnpm audit --fix`
- `pnpm audit --fix` added `pnpm.overrides` in root `package.json`, then `pnpm install`
- Remaining `brace-expansion@5.0.6` under `minimatch@3` fixed by consolidating overrides to:
  - `brace-expansion@<2` → `1.1.18`
  - `brace-expansion@>=2` → `5.0.9`

## Changed files
- `package.json` (pnpm.overrides)
- `pnpm-lock.yaml`
