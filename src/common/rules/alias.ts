// alias.ts
export const ALIAS_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

export const RESERVED_ALIASES = new Set([
  'admin', 'root', 'iam', 'api', 'www', 'app', 'auth', 'support', 'help', 'routing',
  'routingwav', 'billing', 'legal', 'security', 'system', 'dashboard', 'login', 'signin',
  'signup', 'register', 'status', 'mail', 'docs',
])

export const isAliasWellFormed = (a: string) => ALIAS_REGEX.test(a) && !RESERVED_ALIASES.has(a)