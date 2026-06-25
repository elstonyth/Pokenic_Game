// Global fail-closed redemption gate (spec §13). Default OFF: redemption stays
// dark until REWARDS_REDEMPTION_ENABLED is explicitly set to the string 'true'.
// Guards CLAIM + DRAW (which mint value) AND WITHDRAW: the economy is dormant
// until Phase P, so no legitimate prize can exist to ship before launch and
// withdrawal stays dark too. Each of those paths checks this at both the route
// and the service boundary (defense-in-depth).
export const rewardsRedemptionEnabled = (): boolean =>
  process.env.REWARDS_REDEMPTION_ENABLED === 'true';
