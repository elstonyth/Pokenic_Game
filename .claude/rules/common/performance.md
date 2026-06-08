# Performance Optimization

> **Web performance rules for this repo** — Core Web Vitals targets, JS/CSS bundle
> budgets, image/font loading, and animation guidance — live in
> [web/performance.md](../web/performance.md). Use those. This file holds only the
> cross-cutting build-troubleshooting note.
>
> (Generic model-selection / context-window / extended-thinking tips were removed:
> the operator chooses the model and harness settings, not a repo rule, and the
> advice was noise here.)

## Build Troubleshooting

If a build or typecheck fails:

1. Use the `ecc:build-error-resolver` agent (or `/ecc:build-fix`).
2. Read the error messages; fix incrementally.
3. Re-verify after each fix. The **Stop hook** (`.claude/settings.json` →
   `.claude/hooks/stop-verify.js`) re-type-checks storefront + backend at session
   end and blocks finishing on real type errors, so a red build can't slip
   through unnoticed (`medusa develop` / `next dev` are transpile-only).
