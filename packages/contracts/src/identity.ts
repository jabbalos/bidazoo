/**
 * Checkpoint E: family identity contracts.
 *
 * Same rules as the rest of the contract (see index.ts):
 *  - every client request is a domain action with `additionalProperties: false`;
 *  - there is NO request field for a player id, xp, coins, mastery, or timing. A child is always
 *    addressed by its profile id, and the player is resolved by the server from the cookie;
 *  - responses list every field explicitly, and contain no token, hash, PIN, or other secret.
 *
 * Identity changes only HOW a request authenticates to a player, never what that player can do.
 */
import { Type, type Static } from 'typebox';
import { Timestamp, Uuid, strict } from './common';

const Nickname = Type.String({ minLength: 1, maxLength: 32 });
const DeviceLabel = Type.String({ minLength: 1, maxLength: 40 });
const Pin = Type.String({ pattern: '^[0-9]{4}$' });
/** 43 base64url characters: 32 random bytes. */
const LinkToken = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });
/** Case-insensitive, optionally hyphenated; the server normalizes it. */
const HumanCode = Type.String({ pattern: '^[0-9A-Za-z-]{8,48}$', minLength: 8, maxLength: 48 });

// ---------------------------------------------------------------------------
// Guardian sign-in (one-time emailed links; there are no passwords)
// ---------------------------------------------------------------------------

export const EmailLinkRequestSchema = Type.Object(
  { email: Type.String({ minLength: 3, maxLength: 254 }) },
  strict,
);
export type EmailLinkRequest = Static<typeof EmailLinkRequestSchema>;

/** The same answer for every address, known or not. It says nothing about whether mail was sent. */
export const EmailLinkAcceptedSchema = Type.Object({ accepted: Type.Literal(true) }, strict);
export type EmailLinkAccepted = Static<typeof EmailLinkAcceptedSchema>;

export const ConsumeLinkRequestSchema = Type.Object(
  { token: LinkToken, deviceLabel: Type.Optional(DeviceLabel) },
  strict,
);
export type ConsumeLinkRequest = Static<typeof ConsumeLinkRequestSchema>;

// ---------------------------------------------------------------------------
// Child profiles and trusted devices
// ---------------------------------------------------------------------------

export const ChildProfileSchema = Type.Object(
  {
    id: Uuid,
    nickname: Type.String(),
    /** Whether a local profile-switch PIN is set. The PIN and its hash are never sent. */
    hasPin: Type.Boolean(),
    archived: Type.Boolean(),
  },
  strict,
);
export type ChildProfile = Static<typeof ChildProfileSchema>;

export const DeviceSummarySchema = Type.Object(
  {
    id: Uuid,
    label: Type.Union([Type.String(), Type.Null()]),
    createdAt: Timestamp,
    lastSeenAt: Timestamp,
    expiresAt: Timestamp,
    /** True for the device making this request. */
    current: Type.Boolean(),
    activeChildNickname: Type.Union([Type.String(), Type.Null()]),
  },
  strict,
);
export type DeviceSummary = Static<typeof DeviceSummarySchema>;

/** What a trusted device may see about itself: its family's profiles and its own standing. */
export const DeviceStateResponseSchema = Type.Object(
  {
    device: DeviceSummarySchema,
    /** True only inside the short window after a guardian proved their email on this device. */
    guardianAuthority: Type.Boolean(),
    authorityExpiresAt: Type.Union([Timestamp, Type.Null()]),
    /** Non-archived profiles only. */
    children: Type.Array(ChildProfileSchema),
    activeChildId: Type.Union([Uuid, Type.Null()]),
  },
  strict,
);
export type DeviceStateResponse = Static<typeof DeviceStateResponseSchema>;

export const FamilyResponseSchema = Type.Object(
  {
    /** The signed-in guardian's own address, shown back to them. */
    guardianEmail: Type.String(),
    /** Every profile, archived ones included. */
    children: Type.Array(ChildProfileSchema),
  },
  strict,
);
export type FamilyResponse = Static<typeof FamilyResponseSchema>;

export const CreateChildRequestSchema = Type.Object({ nickname: Nickname }, strict);
export type CreateChildRequest = Static<typeof CreateChildRequestSchema>;

/** Claim the guest progress of THIS browser into a new child profile. No player id is accepted. */
export const ClaimGuestRequestSchema = Type.Object({ nickname: Nickname }, strict);
export type ClaimGuestRequest = Static<typeof ClaimGuestRequestSchema>;

export const ChildResponseSchema = Type.Object({ child: ChildProfileSchema }, strict);
export type ChildResponse = Static<typeof ChildResponseSchema>;

export const ChildParamsSchema = Type.Object({ childId: Uuid }, strict);
export type ChildParams = Static<typeof ChildParamsSchema>;

export const SetPinRequestSchema = Type.Object({ pin: Pin }, strict);
export type SetPinRequest = Static<typeof SetPinRequestSchema>;

export const SwitchProfileRequestSchema = Type.Object(
  { childProfileId: Uuid, pin: Type.Optional(Pin) },
  strict,
);
export type SwitchProfileRequest = Static<typeof SwitchProfileRequestSchema>;

export const DeviceCodeRequestSchema = Type.Object({ childProfileId: Type.Optional(Uuid) }, strict);
export type DeviceCodeRequest = Static<typeof DeviceCodeRequestSchema>;

/** Shown once. Only its hash is stored. */
export const DeviceCodeResponseSchema = Type.Object({ code: Type.String(), expiresAt: Timestamp }, strict);
export type DeviceCodeResponse = Static<typeof DeviceCodeResponseSchema>;

export const RedeemDeviceCodeRequestSchema = Type.Object(
  { code: HumanCode, deviceLabel: Type.Optional(DeviceLabel) },
  strict,
);
export type RedeemDeviceCodeRequest = Static<typeof RedeemDeviceCodeRequestSchema>;

export const DevicesResponseSchema = Type.Object({ devices: Type.Array(DeviceSummarySchema) }, strict);
export type DevicesResponse = Static<typeof DevicesResponseSchema>;

export const DeviceParamsSchema = Type.Object({ deviceId: Uuid }, strict);
export type DeviceParams = Static<typeof DeviceParamsSchema>;

export const RevokeResponseSchema = Type.Object({ revoked: Type.Integer({ minimum: 0 }) }, strict);
export type RevokeResponse = Static<typeof RevokeResponseSchema>;

export const RevokeAllRequestSchema = Type.Object({ includeCurrent: Type.Optional(Type.Boolean()) }, strict);
export type RevokeAllRequest = Static<typeof RevokeAllRequestSchema>;

// ---------------------------------------------------------------------------
// Legacy (Hop Quest) claim. Labels only: no progress, credentials or names cross over.
// ---------------------------------------------------------------------------

export const LegacyKidSchema = Type.Object(
  {
    id: Uuid,
    /** The old username, as a display label only. Never a credential. */
    username: Type.Union([Type.String(), Type.Null()]),
    gradeBand: Type.Union([Type.String(), Type.Null()]),
    /** The profile it was linked to, or null while the slot is still open. */
    childProfileId: Type.Union([Uuid, Type.Null()]),
  },
  strict,
);
export type LegacyKid = Static<typeof LegacyKidSchema>;

/**
 * `offer` is null whenever there is nothing to claim, and also when legacy claiming is switched
 * off: the two cases are indistinguishable on purpose.
 */
export const LegacyOfferResponseSchema = Type.Object(
  {
    offer: Type.Union([
      Type.Object({ childCount: Type.Integer({ minimum: 0 }), kids: Type.Array(LegacyKidSchema) }, strict),
      Type.Null(),
    ]),
  },
  strict,
);
export type LegacyOfferResponse = Static<typeof LegacyOfferResponseSchema>;

export const LegacyClaimResponseSchema = Type.Object(
  { kids: Type.Array(LegacyKidSchema) },
  strict,
);
export type LegacyClaimResponse = Static<typeof LegacyClaimResponseSchema>;

export const LegacyClaimCodeRequestSchema = Type.Object({ code: HumanCode }, strict);
export type LegacyClaimCodeRequest = Static<typeof LegacyClaimCodeRequestSchema>;

export const LegacyKidParamsSchema = Type.Object({ legacyKidId: Uuid }, strict);
export type LegacyKidParams = Static<typeof LegacyKidParamsSchema>;

export const LegacyKidLinkRequestSchema = Type.Object({ nickname: Nickname }, strict);
export type LegacyKidLinkRequest = Static<typeof LegacyKidLinkRequestSchema>;
