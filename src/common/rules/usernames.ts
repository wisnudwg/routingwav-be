export const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,31}$/

/** "owner" is also the internal key for the account owner, so a member must never be called that */
export const RESERVED_USERNAMES = new Set(['owner', 'root', 'admin', 'system'])