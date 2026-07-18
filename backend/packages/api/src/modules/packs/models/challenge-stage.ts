import { model } from '@medusajs/framework/utils';

// One row per Weekly-Challenge milestone stage (inert config sub-project D
// reads). stage_number is contiguous from 1 (unique). threshold_myr is the
// community-pool cumulative threshold in MYR; reward_credits is the stage
// reward in MYR credited as store credits (1 RM = 1 credit). reward_card_ids
// is an array of featured `card` ids (may be empty).
export const ChallengeStage = model
  .define('challenge_stage', {
    id: model.id().primaryKey(),
    stage_number: model.number().unique(),
    threshold_myr: model.bigNumber(),
    reward_credits: model.bigNumber(),
    reward_card_ids: model.json(),
  })
  .indexes([
    {
      name: 'IDX_challenge_stage_stage_number',
      on: ['stage_number'],
      where: 'deleted_at IS NULL',
    },
  ]);

export default ChallengeStage;
