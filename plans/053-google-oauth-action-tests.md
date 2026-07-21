# Plan 053: Unit-test the Google OAuth server actions (googleLoginStart / googleCallback)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- src/lib/actions/auth.ts src/lib/actions/__tests__/auth.test.ts src/app/auth/google/callback`
> On any change, compare the excerpts below; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (test-only)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

The Google OAuth flow (#174) is the one security-sensitive auth surface added this round and has zero automated coverage. `googleCallback` contains the trickiest auth logic in the storefront: decode the backend JWT, branch on empty `actor_id` (first login → create customer → refresh token), normalize the email (mixed-case Google emails must collide with existing accounts, not duplicate them), and log only payload KEY NAMES on the missing-email path (never values). A regression in any branch ships silently. This is pure test-writing: the mock harness (`auth.test.ts` mocks `sdk.client.fetch` / `sdk.store.customer` wholesale) already covers everything the new tests need.

## Current state

- `src/lib/actions/auth.ts`:
  - `:~200-210` `decodeJwtPayload(token)` — base64url-decodes the JWT payload (read-not-verify; documented).
  - `:~212-244` `googleLoginStart()` — reads `x-forwarded-host`/`host` via `next/headers`, validates against `ALLOWED_CALLBACK_HOSTS` (returns `{ ok:false, error:'Could not determine site origin.' }` on unknown host), builds `callback_url`, POSTs `/auth/customer/google`, returns `{ ok:true, location }` or friendly errors.
  - `:~246-300` `googleCallback(query)`:
    - missing `code`/`state` → `{ ok:false, error:'Google sign-in was cancelled or failed.' }`
    - GETs `/auth/customer/google/callback` with `{ code, state }` → `{ token }`
    - `decodeJwtPayload(token)`; empty `actor_id` ⇒ first login:
      - email = `payload.user_metadata?.email?.trim().toLowerCase()`; if absent → `logger.error('[auth] google token missing user_metadata.email', { payloadKeys, userMetadataKeys })` (keys only) and `{ ok:false, error:'Google did not share a verified email.' }`
      - `sdk.store.customer.create({ email, first_name, last_name }, {}, { Authorization: Bearer token })`
      - refresh: POST `/auth/token/refresh` with the register token → `sessionToken = refreshed.token`
    - `setAuthToken(sessionToken)`; then `sdk.store.customer.retrieve` + `fetchProfileHandle` (read the rest of the function for the post-login shape and its failure handling — the emailpass `login()` has the analogous flow).
- `src/lib/actions/__tests__/auth.test.ts` — the harness to reuse verbatim (top ~45 lines): `vi.hoisted` mocks for `setAuthToken`/`clearAuthToken`/`fetchProfileHandle`/`clientFetch`/`customerRetrieve`/`customerCreate`; `vi.mock` for `@/lib/data/customer`, `@/lib/data/profiles`, `@/lib/logger`, `@/lib/medusa`. Currently imports only `{ login, signup, resetPassword }`.
- `googleLoginStart` additionally needs `next/headers` mocked (`headers()` returning a Map-like with `get()`) — check whether the existing file already mocks `next/headers` for other actions; if not, add a `vi.mock('next/headers', ...)` in the same style.
- `src/app/auth/google/callback/route.ts` — the Route Handler consuming `googleCallback` (redirects / error param handling). One or two handler-level tests are optional stretch; the action tests are the core deliverable.
- `ALLOWED_CALLBACK_HOSTS` — read its definition in `auth.ts` for the exact allowed values to use in tests (do not copy real prod hostnames into assertions beyond what the source defines).

## Commands you will need

| Purpose   | Command (repo root)                                     | Expected |
| --------- | ------------------------------------------------------- | -------- |
| Tests     | `npm run test`                                          | all pass |
| Targeted  | `npx vitest run src/lib/actions/__tests__/auth.test.ts` | all pass |
| Typecheck | `npm run typecheck`                                     | exit 0   |

## Scope

**In scope**:

- `src/lib/actions/__tests__/auth.test.ts` (extend — same file, same harness)

**Out of scope**:

- `src/lib/actions/auth.ts` — NO production-code changes. If a test reveals a real bug, STOP and report it (that becomes its own fix plan).
- `src/app/auth/google/callback/route.ts` — stretch only; skip if the handler needs Next request mocking the suite doesn't already have.

## Git workflow

- Branch: `advisor/053-oauth-action-tests`
- Commit: `test(auth): cover googleLoginStart/googleCallback branches`
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Fabricate token fixtures

Helper in the test file: `const makeToken = (payload: object) => 'h.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.s';` — matches `decodeJwtPayload`'s split('.')[1] + base64url expectations.

**Verify**: a smoke case decoding via the real action path passes (e.g. the returning-user case below).

### Step 2: googleCallback cases

Import `googleCallback` (and `googleLoginStart`) into the existing import line. Cases, each following the file's arrange/act/assert style:

1. **Missing code/state** → `{ ok:false }` with the cancelled message; `clientFetch` never called.
2. **Returning user** (`actor_id: 'cus_1'`): callback fetch resolves `{ token: makeToken({ actor_id:'cus_1' }) }`; retrieve+handle mocks resolve → `ok:true`; `setAuthToken` called with the ORIGINAL token; `customerCreate` NOT called; no refresh call.
3. **First login happy path** (`actor_id: ''`, `user_metadata: { email:'MiXeD@Example.COM', given_name:'A', family_name:'B' }`): assert `customerCreate` called with email `'mixed@example.com'` (normalization!), Authorization header carries the first token; `/auth/token/refresh` fetched; `setAuthToken` called with the REFRESHED token.
4. **Missing email** (`actor_id:''`, `user_metadata: {}` and also `user_metadata` absent): → `ok:false` "Google did not share a verified email."; `logger.error` called; assert the logged meta object contains ONLY key arrays (`payloadKeys`, `userMetadataKeys`) and stringifying the call args contains no email-like value (`expect(JSON.stringify(errorCall)).not.toMatch(/@/)`).
   5a. **Callback fetch rejects** (`auth.ts:254` throws): → `ok:false` friendly error; NEITHER `setAuthToken` NOR `clearAuthToken` is called (execution jumps straight to the outer catch at `:306` — verified against the source at plan-review time; these are two different failure branches, don't conflate them).
   5b. **Retrieve fails after setAuthToken** (callback + decode succeed, `customerRetrieve` rejects): the inner catch at `:302` calls `await clearAuthToken()` (`:303`) then rethrows to the outer catch → `ok:false`; assert `setAuthToken` was called first AND `clearAuthToken` was called (this is the branch that must never leave a broken cookie behind).
5. **Refresh failure after create** (create resolves, `/auth/token/refresh` rejects): the throw at `:291` happens BEFORE `setAuthToken` (`:294`) — verified: the unrefreshed token is never stored, the property HOLDS in live code. Assert → `ok:false` and `setAuthToken` never called. (This is a fact, not a hedge — if this test fails, the code regressed.)

### Step 3: googleLoginStart cases

Mock `next/headers` (not currently mocked in this file — add a `vi.mock('next/headers', ...)` whose `headers()` returns a Map-like with `get()`). Proto note: under vitest `NODE_ENV === 'test'`, so the fallback proto is `http`; to assert an `https` callback_url the mocked headers MUST include `x-forwarded-proto: 'https'` (`auth.ts:225-227`). Allowed hosts are exactly the three in `ALLOWED_CALLBACK_HOSTS` (`auth.ts:28`) — use `polycards.gg`. Cases: (a) allowed host + `x-forwarded-proto: 'https'` → `ok:true` with the backend-provided `location`, POST body's `callback_url` === `https://polycards.gg/auth/google/callback`; (b) disallowed/absent host → `ok:false` origin error, no fetch; (c) backend returns no `location` → `ok:false` "currently unavailable".

**Verify**: `npx vitest run src/lib/actions/__tests__/auth.test.ts` → all pass (existing + ≥9 new).

## Test plan

The plan IS the test plan (Steps 2-3). Structural pattern: the file's existing `login`/`signup` cases.

## Done criteria

- [ ] `npm run test` green; ≥10 new google cases in `auth.test.ts` (cases 1, 2, 3, 4×2, 5a, 5b, 6, plus 3 loginStart cases)
- [ ] Normalization case asserts the lowercased email reached `customerCreate`
- [ ] Missing-email case asserts keys-only logging (no `@` in logged args)
- [ ] `npm run typecheck` exits 0
- [ ] Zero production-code changes (`git diff --name-only` shows only the test file)
- [ ] `plans/README.md` updated

## STOP conditions

- A case reveals actual wrong behavior (e.g. the unrefreshed token IS stored on refresh failure, or email is not normalized) — STOP, report the bug with the failing test as evidence; do not change `auth.ts` and do not soften the test to pass.
- The harness can't reach a branch without mocking beyond the file's established style (e.g. module-level constants) — report which branch is untestable and why.

## Maintenance notes

- When the Google OAuth app leaves Testing mode (operator step), these tests are the regression net for the first real-user traffic.
- Reviewer: the keys-only logging assertion is the security-relevant one — don't let it be dropped as flaky.
- Deferred: Route Handler (`callback/route.ts`) tests — only if the suite later gains a Next request harness.
