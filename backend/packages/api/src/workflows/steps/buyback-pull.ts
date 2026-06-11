import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";
import { findCardInventoryTarget } from "../../modules/packs/card-stock";
import {
  resolveBuybackRate,
  type BuybackRateType,
} from "../../modules/packs/buyback-rate";

export type BuybackPullInput = {
  pull_id: string;
  customer_id: string; // from the authenticated token — NEVER the request body
};

export type BuybackResult = {
  pull_id: string;
  /** USD credited (decimal, never cents). */
  amount: number;
  /** The buyback percent actually applied. */
  percent: number;
  /** Which rate applied: instant (within the post-pull window) or vault. */
  rate_type: BuybackRateType;
  /** The customer's new credit balance (Σ ledger). */
  balance: number;
};

type CompensateData =
  | {
      pullId: string;
      creditTransactionId: string;
      stockTarget: { inventoryItemId: string; locationId: string } | null;
    }
  | undefined;

const round2 = (n: number): number => Math.round(n * 100) / 100;

// buyback-pull — the customer sells a vaulted pull back to the house: the pull
// flips to bought_back, the credit ledger gains current-FMV × pack-% , and the
// physical unit returns to stock (best-effort, mirror of the pull's earmark).
//
// Order matters: the credit row is written FIRST because its UNIQUE pull_id is
// the race guard — a concurrent duplicate buyback dies on the constraint before
// anything else mutates. The later mutations are manually undone on failure so
// the step stays atomic; compensation covers later-step failures.
export const buybackPullStep = createStep(
  "buyback-pull",
  async (input: BuybackPullInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const [pull] = await packs.listPulls({ id: input.pull_id }, { take: 1 });
    // Unknown id and someone else's pull are the SAME 404 — don't leak which
    // pull ids exist to other customers.
    if (!pull || pull.customer_id !== input.customer_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pull '${input.pull_id}' not found.`
      );
    }
    if (pull.status !== "vaulted") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This card was already sold back."
      );
    }

    const [card] = await packs.listCards({ handle: pull.card_id }, { take: 1 });
    if (!card) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This card is no longer in the catalog and cannot be valued."
      );
    }

    // Instant rate inside the post-pull window (the reveal's "sell on the
    // spot"), vault rate after — decided HERE from rolled_at, never by the
    // caller, so the better rate can't be claimed late via the raw API.
    const [pack] = await packs.listPacks({ slug: pull.pack_id }, { take: 1 });
    const { percent, rate_type } = resolveBuybackRate(pack, pull.rolled_at);

    const amount = round2((Number(card.market_value) * percent) / 100);

    // 1. Credit row first — the unique pull_id kills concurrent duplicates here.
    let creditTransactionId: string;
    try {
      const [txn] = await packs.createCreditTransactions([
        {
          customer_id: input.customer_id,
          amount,
          reason: "buyback" as const,
          pull_id: pull.id,
        },
      ]);
      creditTransactionId = txn.id;
    } catch (error) {
      const [existing] = await packs.listCreditTransactions(
        { pull_id: pull.id },
        { take: 1 }
      );
      if (existing) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "This card was already sold back."
        );
      }
      throw error;
    }

    // 2. Flip the pull. If this fails, remove the credit row so nothing is
    //    half-applied (compensation only covers later-step failures).
    try {
      await packs.updatePulls([
        {
          id: pull.id,
          status: "bought_back" as const,
          buyback_amount: amount,
          buyback_at: new Date(),
        },
      ]);
    } catch (error) {
      await packs.deleteCreditTransactions([creditTransactionId]);
      throw error;
    }

    // 3. Return the physical unit to stock — best-effort, exactly mirroring the
    //    pull-time earmark (untracked products skip; errors only warn).
    let stockTarget: { inventoryItemId: string; locationId: string } | null =
      null;
    try {
      const target = await findCardInventoryTarget(container, pull.card_id);
      if (target) {
        const inventoryModule = container.resolve(Modules.INVENTORY);
        await inventoryModule.adjustInventory(
          target.inventoryItemId,
          target.locationId,
          1
        );
        stockTarget = {
          inventoryItemId: target.inventoryItemId,
          locationId: target.locationId,
        };
      }
    } catch (error) {
      logger.warn(
        `buyback-pull: could not restore stock for '${pull.card_id}' — buyback continues. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // New balance = Σ ledger (append-only; no mutable balance column to drift).
    const transactions = await packs.listCreditTransactions(
      { customer_id: input.customer_id },
      { take: 10000 }
    );
    const balance = round2(
      transactions.reduce((sum, t) => sum + Number(t.amount), 0)
    );

    const result: BuybackResult = {
      pull_id: pull.id,
      amount,
      percent,
      rate_type,
      balance,
    };
    return new StepResponse(result, {
      pullId: pull.id,
      creditTransactionId,
      stockTarget,
    } satisfies CompensateData);
  },
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.deleteCreditTransactions([data.creditTransactionId]);
    await packs.updatePulls([
      {
        id: data.pullId,
        status: "vaulted" as const,
        buyback_amount: null,
        buyback_at: null,
      },
    ]);
    if (data.stockTarget) {
      const inventoryModule = container.resolve(Modules.INVENTORY);
      await inventoryModule.adjustInventory(
        data.stockTarget.inventoryItemId,
        data.stockTarget.locationId,
        -1
      );
    }
  }
);

export default buybackPullStep;
