import { layout } from "../../model/keyboard.ts";
import type { Frame, Profile } from "../../model/types.ts";

export type AnimationKind = "wave" | "meet" | "sparkle";
export function generateAnimation(
  kind: AnimationKind,
  width: number,
  duration: number,
  reverse: boolean,
): Frame[] {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > 6 ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 255
  )
    throw new Error("Некорректные параметры анимации");
  const count = kind === "wave" ? 18 : kind === "meet" ? 10 : 20;
  const frames = Array.from({ length: count }, (_, frame) => ({
    duration,
    keys: layout.flatMap((key, index) => {
      const x = Math.floor(key.x);
      const on =
        kind === "wave"
          ? (x + 18 - frame) % 18 < width
          : kind === "meet"
            ? Math.abs(x - 8.5) >= 8.5 - frame &&
              Math.abs(x - 8.5) < 8.5 - frame + width
            : (index * 17 + frame * 29) % 87 < width * 6;
      return on ? [index] : [];
    }),
  }));
  return reverse ? frames.reverse() : frames;
}
export function copyFrame(profile: Profile, index: number): Profile {
  if (profile.frames.length >= 20 || !profile.frames[index]) return profile;
  const frames = [...profile.frames];
  frames.splice(index + 1, 0, structuredClone(frames[index]));
  return { ...profile, frames };
}
export function moveFrame(
  profile: Profile,
  index: number,
  direction: number,
): Profile {
  const to = index + direction;
  if (!profile.frames[index] || to < 0 || to >= profile.frames.length)
    return profile;
  const frames = [...profile.frames];
  [frames[index], frames[to]] = [frames[to], frames[index]];
  return { ...profile, frames };
}
