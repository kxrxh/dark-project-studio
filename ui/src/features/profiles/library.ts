import type { Profile } from "../../model/types.ts";
export function profileEditor(
  profile: Pick<Profile, "firmware">,
): "firmware" | "overview" {
  return profile.firmware ? "firmware" : "overview";
}
export function extractUserProfiles(
  stored: Profile[],
  presets: Profile[],
  newId: () => string = () => crypto.randomUUID(),
): Profile[] {
  const canonical = (profile: Profile) =>
    JSON.stringify({ ...profile, macros: profile.macros ?? [] }, (_, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
          )
        : value,
    );
  const originals = new Map(
    presets.map((profile) => [profile.id, canonical(profile)]),
  );
  return stored.flatMap((profile) => {
    const original = originals.get(profile.id);
    if (!original) return [profile];
    return canonical(profile) === original
      ? []
      : [{ ...structuredClone(profile), id: newId() }];
  });
}
export type ProfileFilter = "all" | "mine" | "static" | "reactive" | "firmware";
export function isStaticProfile(
  profile: Pick<Profile, "keys" | "frames" | "firmware">,
): boolean {
  return (
    !profile.firmware &&
    profile.frames.length === 1 &&
    profile.keys.every((key) => key.effect === "static")
  );
}

export function visibleProfiles<
  T extends Pick<Profile, "id" | "name" | "keys" | "frames" | "firmware">,
>(
  profiles: T[],
  search: string,
  filter: ProfileFilter,
  presetIds?: ReadonlySet<string>,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  return profiles.filter(
    (profile) =>
      profile.name.toLocaleLowerCase().includes(query) &&
      (filter === "all" ||
        (filter === "mine"
          ? !presetIds?.has(profile.id)
          : filter === "static"
            ? isStaticProfile(profile)
            : filter === "firmware"
              ? !!profile.firmware
              : filter === "reactive"
                ? !!(
                    profile.firmware &&
                    profile.firmware.mode >= 6 &&
                    profile.firmware.mode <= 10
                  )
                : false)),
  );
}
