import { frameAt } from "./model.ts";
import type { Color, Profile } from "./model.ts";

export function previewColors(profile: Profile, ms: number): Color[] {
  const mask = new Set(profile.frames[frameAt(profile, ms)].keys);
  return profile.keys.map((key, index) => {
    let color = key.color;
    if (key.effect === "cycle" || key.effect === "rainbow") {
      const phase = ms / (1800 * key.speed) + index / 87;
      color = [0, 2, 4].map(offset => Math.round((Math.sin(phase * Math.PI * 2 + offset) + 1) * 127.5)) as Color;
    }
    const pulse = key.effect === "breathing" ? 0.18 + 0.82 * (Math.sin(ms / (600 * key.speed)) + 1) / 2 : 1;
    const strength = (mask.has(index) ? 1 : 0.08) * profile.brightness / 100 * pulse;
    return color.map(channel => Math.round(channel * strength)) as Color;
  });
}
