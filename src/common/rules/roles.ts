// roles.ts
export const PROFILE_KINDS = ['talent', 'client'] as const
export type ProfileKindName = (typeof PROFILE_KINDS)[number]

export const ROLES_BY_KIND: Record<ProfileKindName, readonly string[]> = {
  talent: [
    'Music Producer', 'Music Arranger', 'Songwriter / Composer', 'Mixing Engineer',
    'Mastering Engineer', 'Studio Owner / Recording Space', 'Session Player', 'Other',
  ],
  client: ['Musician / Soloist', 'Group / Band', 'Business / Agency / Brand', 'Other'],
}

export const OTHER_ROLE = 'Other'
export const SESSION_PLAYER_ROLE = 'Session Player'

/** Bump when the legal text changes. Stored with each acceptance. */
export const TERMS_VERSION = '2026-10'