import { model } from '@medusajs/framework/utils';

// referral_relationship — the sponsor tree. One sponsor per recruit
// (customer_id unique), sponsor_id indexed for upline/downline walks. Acyclic +
// no-self-referral enforced in linkSponsor under a dual-id lock. Immutable once
// set (except an audited admin action, Phase 3a).
export const ReferralRelationship = model
  .define('referral_relationship', {
    id: model.id().primaryKey(),
    customer_id: model.text().unique(), // the recruit (one sponsor only)
    sponsor_id: model.text(), // the direct sponsor
  })
  .indexes([
    {
      name: 'IDX_referral_relationship_sponsor_id',
      on: ['sponsor_id'],
      where: 'deleted_at IS NULL',
    },
  ]);

export default ReferralRelationship;
