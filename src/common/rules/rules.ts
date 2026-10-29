export const RULES = {
  withdrawal: { feeBps: 200, minAmount: 50_000, dailyLimit: 25_000_000, payoutHours: 24 },
  messages: { maxTextLength: 2000, maxAudioMb: 100, editWindowMinutes: 15 },
  team: { maxMembers: 50, tempPasswordTtlDays: 7 },
} as const