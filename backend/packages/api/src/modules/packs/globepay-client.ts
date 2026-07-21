import { buildEnvelope, depositState, type SettlementState } from './globepay';

// GlobePay365 HTTP client. Thin: build envelope, POST JSON, unwrap their
// { isSuccess, errorList, data } response shape. The wire format itself lives
// in globepay.ts; this file only knows endpoints and error handling.

export type GlobePayConfig = {
  baseUrl: string;
  merchantCode: string;
  aesKey: string;
  privateKey: string;
  /** Their public key — only needed to verify callbacks, not to call out. */
  publicKey: string;
  currencyCode: string;
};

/**
 * Read config from env, failing loudly on a missing value. A half-configured
 * gateway must not start: the failure mode is silently signing with an empty
 * key and getting an opaque rejection hours later.
 */
export function globepayConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GlobePayConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`GlobePay365: missing required env var ${name}.`);
    }
    return value;
  };
  return {
    baseUrl: (env.GLOBEPAY_API_BASE ?? 'https://mapi.GlobePay365stg.com').replace(
      /\/+$/,
      '',
    ),
    merchantCode: required('GLOBEPAY_MERCHANT_CODE'),
    aesKey: required('GLOBEPAY_AES_KEY'),
    privateKey: required('GLOBEPAY_MERCHANT_PRIVATE_KEY'),
    publicKey: required('GLOBEPAY_PUBLIC_KEY'),
    currencyCode: env.GLOBEPAY_CURRENCY ?? 'MYR',
  };
}

/** Their uniform response envelope (§1.1.4). `data` is plaintext, not AES. */
type GlobePayResponse<T> = {
  isSuccess: boolean;
  successCode?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorList?: { errorCode?: string; errorDescription?: string }[] | null;
  data?: T | null;
};

/**
 * Carries their error codes through so callers can branch on them — notably
 * PMT10000 (duplicate merchant reference), which is a REPLAY, not a failure,
 * and PMT10013 (insufficient balance) on payouts.
 */
export class GlobePayError extends Error {
  readonly codes: string[];
  readonly httpStatus: number;

  constructor(message: string, codes: string[], httpStatus: number) {
    super(message);
    this.name = 'GlobePayError';
    this.codes = codes;
    this.httpStatus = httpStatus;
  }

  has(code: string): boolean {
    return this.codes.includes(code);
  }
}

/**
 * POST one envelope. Timeout is mandatory, not optional: a hung gateway call
 * inside a deposit request would pin a worker and leave the customer staring
 * at a spinner with money possibly in flight.
 */
async function post<T>(
  path: string,
  payload: Record<string, unknown>,
  config: GlobePayConfig,
  timeoutMs = 20_000,
): Promise<T> {
  const envelope = buildEnvelope(payload, config);
  // PascalCase per their samples. Verified 2026-07-21 that their binding is
  // case-insensitive (both casings return 200), so this is presentation only.
  const body = {
    MerchantCode: envelope.merchantCode,
    Data: envelope.data,
    Signature: envelope.signature,
    Version: envelope.version,
  };

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let parsed: GlobePayResponse<T>;
  try {
    parsed = JSON.parse(text) as GlobePayResponse<T>;
  } catch {
    // An HTML error page or a WAF block — surface a truncated body rather than
    // a bare "Unexpected token <", which tells nobody anything.
    throw new GlobePayError(
      `GlobePay365 ${path}: non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`,
      [],
      response.status,
    );
  }

  if (!parsed.isSuccess || !parsed.data) {
    const codes = [
      ...(parsed.errorCode ? [parsed.errorCode] : []),
      ...(parsed.errorList ?? []).flatMap((e) => (e.errorCode ? [e.errorCode] : [])),
    ];
    const detail =
      (parsed.errorList ?? [])
        .map((e) => `${e.errorCode}: ${e.errorDescription}`)
        .join('; ') ||
      parsed.errorMessage ||
      'unknown error';
    throw new GlobePayError(
      `GlobePay365 ${path} failed: ${detail}`,
      codes,
      response.status,
    );
  }

  return parsed.data;
}

export type SubmitDepositInput = {
  /** OUR reference. Must be unique — a repeat returns PMT10000. */
  merchantTransactionId: string;
  /** Our customer id, for their support/reconciliation views. */
  merchantClientId: string;
  /** MYR, 2dp. */
  amount: number;
  /** Server-to-server result callback. Must be publicly reachable. */
  notifyUrl: string;
  /** Where the customer's browser lands after the cashier. */
  returnUrl: string;
  /** The customer's IP, not ours. */
  ipAddress: string;
  /** FPX | DN | BQR | OB for MYR. */
  paymentMethodCode: string;
  /** Mandatory for BMR only; unused for our MYR methods. */
  sourceClientBankCode?: string;
};

export type SubmitDepositResult = {
  transactionId: string;
  /** Cashier page. ALWAYS redirect here — it renders their error page too. */
  url: string;
  bankCode?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  referenceNo?: string | null;
  qrCode?: string | null;
  depositActualAmount: number;
  deepLink?: string | null;
};

/**
 * §1.1 SubmitDeposit. Returns a cashier URL; NO money has moved and the
 * customer has not paid yet. Credit only on the callback (or a requery that
 * reports status 6).
 */
export function submitDeposit(
  input: SubmitDepositInput,
  config: GlobePayConfig,
): Promise<SubmitDepositResult> {
  return post<SubmitDepositResult>(
    '/api/Deposit/SubmitDeposit',
    {
      MerchantCode: config.merchantCode,
      MerchantTransactionId: input.merchantTransactionId,
      MerchantClientId: input.merchantClientId,
      CurrencyCode: config.currencyCode,
      // 2dp string: their sample sends "100.00", and a JS number would
      // serialize 100 as `100`, losing the format they show.
      Amount: input.amount.toFixed(2),
      NotifyUrl: input.notifyUrl,
      ReturnUrl: input.returnUrl,
      IPAddress: input.ipAddress,
      PaymentMethodCode: input.paymentMethodCode,
      ...(input.sourceClientBankCode
        ? { SourceClientBankCode: input.sourceClientBankCode }
        : {}),
    },
    config,
  );
}

export type DepositDetail = {
  transactionId: string;
  merchantTransactionId: string;
  statusId: number;
  status: string;
  amount: number;
  netAmount: number;
  paymentMethodCode: string;
  bankReferenceNo?: string | null;
  uniqueReferenceNo?: string | null;
};

/**
 * §1.3 Deposit Requery — the reconciliation path. A dropped callback must
 * never mean a lost deposit: this is the authoritative read.
 */
export async function getDepositDetail(
  merchantTransactionId: string,
  config: GlobePayConfig,
): Promise<DepositDetail & { state: SettlementState }> {
  const detail = await post<DepositDetail>(
    '/api/Deposit/GetDepositDetail',
    {
      MerchantCode: config.merchantCode,
      MerchantTransactionId: merchantTransactionId,
      CurrencyCode: config.currencyCode,
    },
    config,
  );
  return { ...detail, state: depositState(detail.statusId) };
}

export type MerchantBalance = {
  merchantCode: string;
  currencyCode: string;
  currentBalance: number;
  availableBalance: number;
  t1Balance: number;
};

/**
 * §1.9 CheckBalance. Read-only and side-effect free, so it doubles as the
 * connectivity/credentials smoke test after any key or whitelist change.
 */
export function checkBalance(config: GlobePayConfig): Promise<MerchantBalance> {
  return post<MerchantBalance>(
    '/api/Merchant/CheckBalance',
    { MerchantCode: config.merchantCode, CurrencyCode: config.currencyCode },
    config,
  );
}
