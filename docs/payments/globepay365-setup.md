# GlobePay365 payment gateway — setup notes

Status: **Phase 1 (onboarding) in progress.** No code written yet — MerchantCode
is not issued until GlobePay365 finishes back-office setup.

Source: <https://api.globepay365.com/api/globepay365_api_doc.html> (Merchant
Integration Guide v1.0.0).

## Environments

|                                            | Production                     | Staging                                  |
| ------------------------------------------ | ------------------------------ | ---------------------------------------- |
| API host                                   | `https://mapi.GlobePay365.com` | `https://mapi.GlobePay365stg.com`        |
| Back office                                | —                              | <https://backoffice.globepay365stg.com/> |
| Their outbound IP (our callback allowlist) | `13.159.14.239`                | `160.250.92.219`                         |

## Crypto scheme (verified against Node in a scratch script)

- **AES** (payload `Data` field): key = `PBKDF2-HMAC-SHA1(password=aesKey,
salt=aesKey, 1000 iters, 32 bytes)`, `AES-256-CBC` + PKCS7, random 16-byte IV
  **prepended** to the ciphertext, whole thing base64.
- **Signature**: `RSA-SHA1` (PKCS#1 v1.5) over the **plaintext JSON** of the
  `Data` object — sign outbound with the _merchant private key_, verify inbound
  callbacks with the _GlobePay365 public key_.
- Keys are 1024-bit. Legacy/weak by modern standards; it is their protocol, do
  not "upgrade" to 2048 or SHA-256.

## Secrets (env, never committed)

| Var                             | What                                            |
| ------------------------------- | ----------------------------------------------- |
| `GLOBEPAY_MERCHANT_CODE`        | `Testpolycard` on staging                       |
| `GLOBEPAY_MERCHANT_PRIVATE_KEY` | our RSA 1024 private key (PEM)                  |
| `GLOBEPAY_PUBLIC_KEY`           | their RSA public key (base64 SPKI)              |
| `GLOBEPAY_AES_KEY`              | their AES key                                   |
| `GLOBEPAY_API_BASE`             | `https://mapi.GlobePay365stg.com` on staging    |

Merchant keypair was generated **locally with openssl**, not on devglan.com or
any other web tool — that private key signs withdrawal/payout requests, so a key
that ever touched a third-party site is a drain-the-balance risk.

```sh
openssl genrsa -out merchant_private.pem 1024
openssl rsa -in merchant_private.pem -pubout -out merchant_public.pem
# base64 body to hand over:
grep -v '^-----' merchant_public.pem | tr -d '\n'
```

## Account facts (read from the staging back office, 2026-07-21)

- **MerchantCode: `Testpolycard`** (capital T — same string as the BO login).
- Currency `MYR`. Cashier timeout 10 min. Payout Verification inactive.
- `IP Whitelist Check: Active` — so the API whitelist is enforced, not advisory.
- Merchant Public Key in their back office is byte-identical to ours. Confirmed.
- Active MYR methods: `FPX`, `DN` (DuitNow), `BQR` (QR & bank transfer), `OB`
  (Online Banking), `WD` (payout).
- **Two separate whitelists**, both need our IP:
  `Setting → Whitelist Setting → BackOffice Whitelist Setting` (login) and
  `→ API Whitelist Setting` (API calls). Getting only the first one done is the
  default failure — logins work, every API call is rejected.
- **Merchant Cashier URL is blank** (`Merchant Management → Action → URL`).
  Doc error `PMT10007 Merchant Cashier URL not available` is this field. Unset
  as of writing; ask Bryan what it expects before filling it.

### Live smoke test — PASSED 2026-07-21

`POST /api/Merchant/CheckBalance` returned `isSuccess: true`, balance `0.00`.
Read-only, creates no transaction, and exercises the entire chain: IP whitelist,
MerchantCode, AES payload they could decrypt, RSA-SHA1 signature verified
against our uploaded public key. Use it as the first call after any key or
whitelist change.

**Envelope casing is a non-issue.** Both `{MerchantCode, Data, Signature,
Version}` (as in §1.9.2) and `{merchantCode, data, …}` (as in §1.1.2) return
200 — their model binding is case-insensitive.

## Phase 1 checklist (blocks everything else)

- [x] Generate merchant RSA 1024 keypair locally.
- [ ] Send **merchant public key** to GlobePay365 tech team.
- [ ] Give them our **server outgoing IP** for their whitelist. **Open problem:**
      `polycards-backend` runs on DO App Platform with `egress: null` — no static
      outbound IP. Needs `spec.egress.type: DEDICATED_IP` (paid DO feature) or a
      proxy with a fixed IP.
- [ ] Receive `MerchantCode` back.

## Phase 2 — integration

**Built:** `backend/packages/api/src/modules/packs/globepay.ts` — AES/RSA wire
format, envelope builder, callback opener, status mapping. Pure functions, no
container. Tests in `__tests__/globepay.unit.spec.ts`.

**Not built yet** (blocked on `MerchantCode`): the HTTP client, the pending
top-up row, and the callback route.

**Verification status:** logic checked by a standalone Node harness (AES
roundtrip, random IV, RSA sign/verify, tamper + forged-amount rejection,
status mapping) — all passing. The in-repo jest spec has **not** been run:
this workspace has no `node_modules`. CI runs it.

The doc's §1.13 AES known-answer sample is **unusable** — its published
ciphertext decodes to 244 bytes after the IV, not a multiple of the 16-byte
block, i.e. the base64 in the HTML is OCR-corrupted. No cross-implementation
vector exists; interop risk is in framing, not the math.

**Watch out — request/callback field casing differs in the doc.** The
SubmitDeposit request sample (§1.1.2) is lowercase (`merchantCode`, `data`,
`signature`, `version`); the callback (§1.2.2) is capitalized (`TransactionId`,
`Data`, `Signature`). Code follows the doc on both sides, but confirm the
request casing on the first live call — a mismatch fails silently with a
useless error.

### Flow

The real flow is **async redirect + callback**, not a synchronous swap for
`mockCharge` in `backend/packages/api/src/modules/packs/topup.ts`:

1. `POST /api/Deposit/SubmitDeposit` → returns `data.url` (cashier page).
2. Redirect the customer there; record a **pending** top-up first.
3. GlobePay365 POSTs to our `NotifyUrl` → verify signature, decrypt `Data`,
   credit the ledger.
4. Reply with the literal body `success` to stop their callback retries.

Rules to bank now:

- Verify the RSA-SHA1 signature with **their** public key before trusting any
  callback field; also allowlist the source IP (table above).
- Credit **idempotently keyed on their `TransactionId`** — reuse
  `mutateCreditAtomic` + `topupIdempotencyReference`.
- Deposit status: `6` = success, `7` = fail, `4` = verify-fail (**not final**),
  anything else = processing.
- Withdrawal status: `4` = success, `5` = fail, else processing.
- Currency for us is `MYR`. Deposit methods available for MYR: `OB`, `FPX`,
  `DN`, `BQR`. Withdrawal method is always `WD`.
- Requery endpoints exist (`/api/Deposit/GetDepositDetail`,
  `/api/Withdrawal/...`) — use them for reconciliation, never trust a lost
  callback.
- `ALLOW_MOCK_TOPUP=unsafe-demo` must come **off** the prod spec when this ships.
