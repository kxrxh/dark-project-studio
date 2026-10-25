import type { Device, Profile } from "./model.ts";
export function matchStoredLighting(stored: Profile, profiles: Profile[]): Profile | undefined {
  const fingerprint = (profile: Profile) => JSON.stringify(profile.firmware ? ["firmware",profile.firmware.mode,profile.firmware.tuning ? [profile.firmware.tuning.brightness,profile.firmware.tuning.speed,profile.firmware.tuning.colors,profile.firmware.tuning.randomColors] : null] : [
    profile.keys.map(key => [key.effect,key.speed,key.pause,
      key.color.map(channel=>Math.floor((key.effect === "cycle" ? 255 : channel)*profile.brightness/100))]),
    profile.frames.map(frame=>[frame.duration,[...frame.keys].sort((a,b)=>a-b)]),
  ]);
  const expected = fingerprint(stored);
  const matches = profiles.filter(profile=>fingerprint(profile) === expected);
  return matches.length === 1 ? matches[0] : undefined;
}
export function needsProfileScan(
  identity: string | null,
  next: Device,
): boolean {
  return (
    next.connected &&
    next.supported &&
    !!next.identity &&
    identity !== next.identity
  );
}
export function targetProfile(
  destination: number | null,
  device: Device,
): number | null {
  if (!device.connected || !device.supported) return null;
  const value = destination ?? device.active;
  return value !== null && value >= 1 && value <= 4 ? value : null;
}
export function destinationAfterDetection(
  destination: number | null,
  identity: string | null,
  next: Device,
): number | null {
  return !next.connected || !next.supported || next.identity !== identity
    ? null
    : destination;
}
