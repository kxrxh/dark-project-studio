import { layout } from "./keyboard.ts";
import type { Color, Effect, KeyStyle, Layer, Profile } from "./types.ts";

export function editKeys(
  profile: Profile,
  selected: number[],
  patch: Partial<KeyStyle>,
): Profile {
  const set = new Set(selected);
  return {
    ...profile,
    keys: profile.keys.map((key, index) =>
      set.has(index) ? { ...key, ...patch } : key,
    ),
  };
}
export function setBinding(
  profile: Profile,
  key: number,
  layer: Layer,
  action: number | null,
): Profile {
  if (key === 81 || key < 0 || key >= 87)
    throw new Error("Клавиша Fn защищена");
  const bindings = profile.bindings.filter(
    (b) => b.key !== key || b.layer !== layer,
  );
  return {
    ...profile,
    bindings:
      action === null ? bindings : [...bindings, { key, layer, action }],
    macros: (profile.macros ?? []).filter(
      (m) => m.key !== key || m.layer !== layer,
    ),
  };
}
export function frameAt(profile: Profile, ms: number): number {
  let rest =
    ms %
    profile.frames.reduce((total, frame) => total + frame.duration * 100, 0);
  for (let i = 0; i < profile.frames.length; i++) {
    rest -= profile.frames[i].duration * 100;
    if (rest < 0) return i;
  }
  return 0;
}
export const hex = (color: Color) =>
  "#" + color.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
export const rgb = (value: string): Color =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Color;
export const gradientDirections = {
  right: "Слева направо",
  left: "Справа налево",
  down: "Сверху вниз",
  up: "Снизу вверх",
  "diagonal-down": "По диагонали вниз",
  "diagonal-up": "По диагонали вверх",
  outward: "От центра",
  inward: "К центру",
};
export type GradientDirection = keyof typeof gradientDirections;
export function gradient(
  profile: Profile,
  selected: number[],
  from: Color,
  to: Color,
  direction: GradientDirection = "right",
): Profile {
  if (!selected.length) return profile;
  const points = selected.map((index) => layout[index]);
  const cx =
    (Math.min(...points.map((p) => p.x)) +
      Math.max(...points.map((p) => p.x))) /
    2;
  const cy =
    (Math.min(...points.map((p) => p.y)) +
      Math.max(...points.map((p) => p.y))) /
    2;
  const positions = points.map((point) => {
    switch (direction) {
      case "right":
        return point.x;
      case "left":
        return -point.x;
      case "down":
        return point.y;
      case "up":
        return -point.y;
      case "diagonal-down":
        return point.x + point.y;
      case "diagonal-up":
        return point.x - point.y;
      case "outward":
        return Math.hypot(point.x - cx, point.y - cy);
      case "inward":
        return -Math.hypot(point.x - cx, point.y - cy);
    }
  });
  const start = Math.min(...positions),
    span = Math.max(...positions) - start;
  const keys = [...profile.keys];
  selected.forEach((key, index) => {
    const t = span ? (positions[index] - start) / span : 0;
    keys[key] = {
      ...keys[key],
      color: from.map((v, i) => Math.round(v + (to[i] - v) * t)) as Color,
    };
  });
  return { ...profile, keys };
}
export const effectNames: Record<Effect, string> = {
  static: "Постоянный",
  breathing: "Дыхание",
  cycle: "Смена цветов",
  rainbow: "Радуга",
};
