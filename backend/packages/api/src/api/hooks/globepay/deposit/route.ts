import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../../modules/packs';
import type PacksModuleService from '../../../../modules/packs/service';
import {
  aesDecrypt,
  depositState,
  openCallback,
} from '../../../../modules/packs/globepay';
import { globepayConfigFromEnv } from '../../../../modules/packs/globepay-client';
import { topupIdempotencyReference } from '../../../../modules/packs/topup';
import { notifyFeed } from '../../../../modules/packs/notify-feed';
import { topupFeedKey } from '../../../../modules/packs/feed-events';

// POST /hooks/globepay/deposit — GlobePay365 server-to-server deposit callback
// (§1.2). This is the ONLY path that turns a real payment into site credit.
//
// Deliberately NOT under /store/*: a webhook carries neither a customer session
// nor a publishable API key, so it must sit outside the authenticate() matchers
// in src/api/middlewares.ts. Authentication here is the RSA-SHA1 signature over
// their AES payload — not a header, not the source IP.
//
// ACK CONTRACT (§1.2.1): the literal body "success" stops their retries.
//   - Verified AND durably handled (credited, marked failed, or a no-op we are
//     certain about) -> "success".
//   - Signature/decrypt failure, or a transient error on our side -> non-2xx,
//     so a genuine callback we failed to process gets retried.
// The distinction that matters: a status-7 (failed) deposit is HANDLED, not an
// error. Returning non-2xx for it would make them retry a dead deposit forever.
type DepositCallbackBody = {
  TransactionId?: string;
  MerchantTransactionId?: string;
  Data?: string;
  AdditionalInformationData?: string;
  Signature?: string;
  Version?: number;
};

type DepositCallbackData = {
  MerchantCode: string;
  CurrencyCode: string;
  MerchantTransactionId: string;
  Status: number;
  Amount: number;
  NetAmount: number;
  Remark?: string;
  PaymentMethodCode?: string;
  BankReferenceNo?: string;
  UniqueReferenceNo?: string;
};

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const body = (req.body ?? {}) as DepositCallbackBody;
  const config = globepayConfigFromEnv();

  // 1) Authenticate. Verify the signature over the DECRYPTED payload before a
  // single field is trusted — openCallback throws unless it checks out.
  let data: DepositCallbackData;
  try {
    if (!body.Data || !body.Signature) {
      throw new Error('callback missing Data or Signature');
    }
    data = openCallback<DepositCallbackData>(
      { Data: body.Data, Signature: body.Signature },
      { aesKey: config.aesKey, publicKey: config.publicKey },
    );
  } catch (error) {
    // Unverified: NOT "success". Either it is not from them (drop it) or our
    // keys are wrong (we want the retries while that gets fixed).
    req.scope
      .resolve('logger')
      .warn(
        `[globepay] rejected deposit callback: ${(error as Error).message}`,
      );
    res.status(400).send('rejected');
    return;
  }

  // Their id is the reconciliation handle AND the idempotency anchor: globally
  // unique on their side, and repeated verbatim on every retry.
  const gatewayTransactionId = body.TransactionId ?? '';
  const merchantTransactionId =
    data.MerchantTransactionId || body.MerchantTransactionId || '';
  const state = depositState(data.Status);

  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const [deposit] = await packs.listGlobePayDeposits(
    { merchant_transaction_id: merchantTransactionId },
    { take: 1 },
  );

  // 2) Unknown reference. The row is written BEFORE SubmitDeposit is called, so
  // a verified callback with no row cannot be a race — it is a deposit created
  // outside this system (or against another environment sharing the merchant
  // account). Retrying would never produce a row, so ack and log loudly.
  if (!deposit) {
    req.scope
      .resolve('logger')
      .error(
        `[globepay] verified callback for UNKNOWN deposit ${merchantTransactionId} (gateway ${gatewayTransactionId}, status ${data.Status}) — nothing credited`,
      );
    res.status(200).send('success');
    return;
  }

  // 3) Non-final states (their status 4 "VerifyFail" among them) are explicitly
  // NOT failures — the deposit can still settle. Acknowledge without touching
  // the ledger; the next callback carries the real outcome.
  if (state === 'pending') {
    res.status(200).send('success');
    return;
  }

  if (state === 'failed') {
    await packs.updateGlobePayDeposits({
      id: deposit.id,
      status: 'failed',
      gateway_status: data.Status,
      gateway_transaction_id:
        gatewayTransactionId || deposit.gateway_transaction_id,
    });
    res.status(200).send('success');
    return;
  }

  // 4) Settled. Credit the amount THEY confirmed, not the amount we requested —
  // a customer can pay a different sum than the one the top-up sheet asked for,
  // and the ledger must reflect money actually received.
  //
  // Amount vs NetAmount: `Amount` is the deposit amount, `NetAmount` is
  // documented only as "Net Amount submitted from client". We credit `Amount`
  // and record both, pending confirmation against the first genuinely settled
  // callback — see docs/payments/globepay365-setup.md.
  const creditedAmount = Number(data.Amount);
  if (!Number.isFinite(creditedAmount) || creditedAmount <= 0) {
    req.scope
      .resolve('logger')
      .error(
        `[globepay] settled callback for ${merchantTransactionId} carried a non-positive Amount (${data.Amount}) — refusing to credit`,
      );
    res.status(400).send('rejected');
    return;
  }

  try {
    // Idempotent on THEIR transaction id: a retried callback (or a lost
    // response) resolves to the same anchor and returns the original row
    // instead of crediting twice.
    const mutation = await packs.mutateCreditAtomic({
      customerId: deposit.customer_id,
      amount: creditedAmount,
      reason: 'topup',
      reference: gatewayTransactionId || merchantTransactionId,
      idempotencyReference: topupIdempotencyReference(
        deposit.customer_id,
        gatewayTransactionId || merchantTransactionId,
      ),
    });

    await packs.updateGlobePayDeposits({
      id: deposit.id,
      status: 'settled',
      gateway_status: data.Status,
      gateway_transaction_id:
        gatewayTransactionId || deposit.gateway_transaction_id,
      amount_settled: creditedAmount,
      settled_at: new Date(),
    });

    // Durable receipt, mirroring the mock top-up path. A replay credited
    // nothing, so it must not produce a second feed row. Non-fatal: the credit
    // is already committed and must not be undone by a notification failure.
    if (!mutation.replayed) {
      try {
        await notifyFeed(req.scope, {
          receiverId: deposit.customer_id,
          template: 'topup_credited',
          data: {
            amount_myr: creditedAmount,
            reference: gatewayTransactionId || merchantTransactionId,
          },
          idempotencyKey: topupFeedKey(
            gatewayTransactionId || merchantTransactionId,
          ),
        });
      } catch {
        // Never fail a committed credit over a notification.
      }
    }
  } catch (error) {
    // Transient (DB down, lock timeout): do NOT ack, so they retry and the
    // customer's money still lands.
    req.scope
      .resolve('logger')
      .error(
        `[globepay] failed to credit deposit ${merchantTransactionId}: ${(error as Error).message}`,
      );
    res.status(500).send('error');
    return;
  }

  // AdditionalInformationData is decrypted for logging only — it carries the
  // receiving bank details (§1.2.4), never anything the credit depends on.
  if (body.AdditionalInformationData) {
    try {
      req.scope
        .resolve('logger')
        .info(
          `[globepay] ${merchantTransactionId} extra: ${aesDecrypt(body.AdditionalInformationData, config.aesKey)}`,
        );
    } catch {
      // Non-fatal: the credit is committed; bad extra data must not undo it.
    }
  }

  res.status(200).send('success');
}
