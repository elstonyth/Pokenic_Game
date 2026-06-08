---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Hooks

> This file extends [common/hooks.md](../common/hooks.md) with TypeScript/JavaScript specific content.
>
> **This repo's hooks are already wired** in `.claude/settings.json` +
> `.claude/hooks/`: a PostToolUse incremental **typecheck** after `.ts`/`.tsx`
> edits and a **Stop** hook that type-checks storefront + backend. They invoke
> `tsc` via node with a built-in timeout (this repo uses **npm** at the root and
> **corepack yarn** in `backend/` — not `pnpm`). The patterns below are reference
> only; don't add duplicate format/typecheck hooks.

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **Prettier**: Auto-format JS/TS files after edit
- **TypeScript check**: Run `tsc` after editing `.ts`/`.tsx` files
- **console.log warning**: Warn about `console.log` in edited files

## Stop Hooks

- **console.log audit**: Check all modified files for `console.log` before session ends
