export const IS_PROD = process.env.NODE_ENV === 'production'

/** The __Host- prefix makes browsers require Secure + Path=/ + no Domain: a host-only cookie nobody else can overwrite */
export const SESSION_COOKIE = IS_PROD ? '__Host-rw_session' : 'rw_session'