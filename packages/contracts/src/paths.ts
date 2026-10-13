/**
 * Paths and constants shared by server and clients. Kept in a module with NO runtime
 * dependencies so a browser client can import them without pulling in the schema library.
 */

export const API_PREFIX = '/api/v1';

export const ApiPaths = {
  guest: `${API_PREFIX}/guest`,
  me: `${API_PREFIX}/me`,
  playSessions: `${API_PREFIX}/play-sessions`,
  playSession: (sessionId: string) => `${API_PREFIX}/play-sessions/${sessionId}`,
  question: (sessionId: string) => `${API_PREFIX}/play-sessions/${sessionId}/question`,
  answers: (sessionId: string) => `${API_PREFIX}/play-sessions/${sessionId}/answers`,

  // Checkpoint E: family identity.
  guardianEmailLinks: `${API_PREFIX}/guardian/email-links`,
  guardianEmailLinkConsume: `${API_PREFIX}/guardian/email-links/consume`,
  family: `${API_PREFIX}/family`,
  familyChildren: `${API_PREFIX}/family/children`,
  familyChildrenFromGuest: `${API_PREFIX}/family/children/from-guest`,
  familyGuestClaim: `${API_PREFIX}/family/guest-claim`,
  familyChildArchive: (childId: string) => `${API_PREFIX}/family/children/${childId}/archive`,
  familyChildRestore: (childId: string) => `${API_PREFIX}/family/children/${childId}/restore`,
  familyChildPin: (childId: string) => `${API_PREFIX}/family/children/${childId}/pin`,
  device: `${API_PREFIX}/device`,
  deviceProfile: `${API_PREFIX}/device/profile`,
  devices: `${API_PREFIX}/devices`,
  deviceRevoke: (deviceId: string) => `${API_PREFIX}/devices/${deviceId}/revoke`,
  devicesRevokeAll: `${API_PREFIX}/devices/revoke-all`,
  deviceCodes: `${API_PREFIX}/device-codes`,
  deviceCodesRedeem: `${API_PREFIX}/device-codes/redeem`,
  legacyOffer: `${API_PREFIX}/legacy/offer`,
  legacyClaim: `${API_PREFIX}/legacy/claim`,
  legacyClaimCode: `${API_PREFIX}/legacy/claim-code`,
  legacyKidLink: (legacyKidId: string) => `${API_PREFIX}/legacy/kids/${legacyKidId}/link`,
} as const;

/**
 * The page that completes a sign-in. Emailed links look like
 *   <PUBLIC_BASE_URL>/account.html#t=<token>
 * The token rides in the URL FRAGMENT: browsers never send it to any server, so it cannot appear
 * in a proxy, CDN, or access log, or in a Referer header. The page reads it, strips it from the
 * address bar, and POSTs it. (A mail scanner that merely GETs the link cannot use it up.)
 */
export const ACCOUNT_PAGE_PATH = '/account.html';
export const LINK_FRAGMENT_KEY = 't';

export const GAME_ID = 'zoo-sprint';
export const MODE_MULTIPLICATION = 'multiplication';
/** Questions in one play session. The server enforces it; the client only displays it. */
export const SESSION_LENGTH = 10;

