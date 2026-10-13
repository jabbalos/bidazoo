import { ApiPaths } from '@bidazoo/contracts/paths';
import type {
  ChildProfile, ChildResponse, DeviceCodeResponse, DeviceStateResponse, DeviceSummary, FamilyResponse, GuestClaimAvailabilityResponse,
  LegacyClaimResponse, LegacyOfferResponse, RevokeResponse,
} from '@bidazoo/contracts';

/**
 * The account page's view of the API. Identity is cookie-based (HttpOnly cookies the browser
 * attaches by itself), so there is nothing here that reads, stores or sends a token header.
 * Calls never throw: the status (0 = network failure) and the API's error code are returned, and
 * the screens decide what to say. Request bodies exist only as arguments to these functions and
 * are never logged or kept.
 */
export interface Reply<T> {
  status: number;
  ok: boolean;
  body: T | undefined;
  code: string | undefined;
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Reply<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    const code = (parsed as { error?: { code?: string } } | undefined)?.error?.code;
    return { status: response.status, ok: response.ok, body: response.ok ? (parsed as T) : undefined, code };
  } catch {
    return { status: 0, ok: false, body: undefined, code: 'network' };
  }
}

export const api = {
  device: () => call<DeviceStateResponse>('GET', ApiPaths.device),
  family: () => call<FamilyResponse>('GET', ApiPaths.family),
  guestClaimAvailable: () => call<GuestClaimAvailabilityResponse>('GET', ApiPaths.familyGuestClaim),
  requestLink: (email: string) => call<{ accepted: true }>('POST', ApiPaths.guardianEmailLinks, { email }),
  consumeLink: (token: string) => call<DeviceStateResponse>('POST', ApiPaths.guardianEmailLinkConsume, { token }),
  redeemDeviceCode: (code: string) => call<DeviceStateResponse>('POST', ApiPaths.deviceCodesRedeem, { code }),
  createChild: (nickname: string) => call<ChildResponse>('POST', ApiPaths.familyChildren, { nickname }),
  claimGuest: (nickname: string) => call<ChildResponse>('POST', ApiPaths.familyChildrenFromGuest, { nickname }),
  archive: (id: string) => call<ChildResponse>('POST', ApiPaths.familyChildArchive(id), {}),
  restore: (id: string) => call<ChildResponse>('POST', ApiPaths.familyChildRestore(id), {}),
  setPin: (id: string, pin: string) => call<ChildResponse>('POST', ApiPaths.familyChildPin(id), { pin }),
  clearPin: (id: string) => call<ChildResponse>('DELETE', ApiPaths.familyChildPin(id)),
  switchProfile: (childProfileId: string, pin?: string) =>
    call<DeviceStateResponse>('POST', ApiPaths.deviceProfile, pin === undefined ? { childProfileId } : { childProfileId, pin }),
  devices: () => call<{ devices: DeviceSummary[] }>('GET', ApiPaths.devices),
  revokeDevice: (id: string) => call<RevokeResponse>('POST', ApiPaths.deviceRevoke(id), {}),
  revokeAll: (includeCurrent: boolean) => call<RevokeResponse>('POST', ApiPaths.devicesRevokeAll, { includeCurrent }),
  issueDeviceCode: () => call<DeviceCodeResponse>('POST', ApiPaths.deviceCodes, {}),
  legacyOffer: () => call<LegacyOfferResponse>('GET', ApiPaths.legacyOffer),
  legacyClaim: () => call<LegacyClaimResponse>('POST', ApiPaths.legacyClaim, {}),
  legacyClaimCode: (code: string) => call<LegacyClaimResponse>('POST', ApiPaths.legacyClaimCode, { code }),
  legacyLink: (legacyKidId: string, nickname: string) => call<ChildResponse>('POST', ApiPaths.legacyKidLink(legacyKidId), { nickname }),
};

export type { ChildProfile };
