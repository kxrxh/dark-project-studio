export type Color = [number, number, number];
export type Effect = "static" | "breathing" | "cycle" | "rainbow";
export type Layer = "base" | "fn";
export interface KeyStyle {
  color: Color;
  effect: Effect;
  speed: number;
  pause: number;
}
export interface Frame {
  keys: number[];
  duration: number;
}
export interface MacroEvent {
  code: number;
  down: boolean;
  delayMs: number;
}
export interface MacroBinding {
  key: number;
  layer: Layer;
  name: string;
  repeat: number;
  events: MacroEvent[];
}
export interface Binding {
  key: number;
  layer: Layer;
  action: number;
}
export interface FirmwareTuning {
  brightness: number;
  speed: number;
  colors: [Color, Color];
  randomColors: boolean;
}
export interface Profile {
  version: 1;
  id: string;
  name: string;
  description: string;
  brightness: number;
  keys: KeyStyle[];
  frames: Frame[];
  bindings: Binding[];
  macros?: MacroBinding[];
  firmware?: { mode: number; tuning?: FirmwareTuning };
}
export interface Device {
  inputMonitoringRequired?: boolean;
  identity?: string | null;
  connected: boolean;
  supported: boolean;
  revision: string | null;
  active: number | null;
  message: string;
}
export interface Hardware {
  base: number[];
  function: number[];
  config: Profile | null;
  notice: string | null;
}
export interface Key {
  name: string;
  label: string;
  x: number;
  y: number;
  width: number;
  code: number;
}

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
  right: "Слева направо", left: "Справа налево", down: "Сверху вниз", up: "Снизу вверх",
  "diagonal-down": "По диагонали вниз", "diagonal-up": "По диагонали вверх",
  outward: "От центра", inward: "К центру",
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
  const points = selected.map(index=>layout[index]);
  const cx=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2;
  const cy=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;
  const positions=points.map(point=>{
    switch(direction) {
      case "right": return point.x;
      case "left": return -point.x;
      case "down": return point.y;
      case "up": return -point.y;
      case "diagonal-down": return point.x+point.y;
      case "diagonal-up": return point.x-point.y;
      case "outward": return Math.hypot(point.x-cx,point.y-cy);
      case "inward": return -Math.hypot(point.x-cx,point.y-cy);
    }
  });
  const start=Math.min(...positions), span=Math.max(...positions)-start;
  const keys = [...profile.keys];
  selected.forEach((key, index) => {
    const t = span ? (positions[index]-start)/span : 0;
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
export const groups: Record<string, string[]> = {
  WASD: ["w", "a", "s", "d"],
  Стрелки: ["up", "left", "down", "right"],
  Буквы: "abcdefghijklmnopqrstuvwxyz".split(""),
  Модификаторы: [
    "left-ctrl",
    "left-shift",
    "left-alt",
    "left-win",
    "right-ctrl",
    "right-shift",
    "right-alt",
    "fn",
  ],
};
export const actionNames: Record<number, string> = {
  0: "Отключить",
  0xa5: "Предыдущий трек",
  0xa6: "Воспроизведение / пауза",
  0xa7: "Следующий трек",
  0xa8: "Стоп",
  0xa9: "Без звука",
  0xaa: "Тише",
  0xab: "Громче",
  0xad: "Слот 1",
  0xae: "Слот 2",
  0xaf: "Слот 3",
  0xb0: "Слот 4",
  0xe0: "Левый Ctrl",
  0xe1: "Левый Shift",
  0xe2: "Левый Alt",
  0xe3: "Левый Win / Cmd",
  0xe4: "Правый Ctrl",
  0xe5: "Правый Shift",
  0xe6: "Правый Alt",
  0xe7: "Правый Win / Cmd",
  0xac: "Fn",
  0xb2: "Макрос",
};
export const actionLabel = (code: number | undefined) =>
  code === undefined
    ? "Не прочитано"
    : (actionNames[code] ??
      layout.find((key) => key.code === code)?.label ??
      `Системное действие 0x${code.toString(16)}`);

export const layout: Key[] = [
  {
    name: "esc",
    label: "Esc",
    x: 0,
    y: 0,
    width: 1,
    code: 41,
  },
  {
    name: "f1",
    label: "F1",
    x: 2,
    y: 0,
    width: 1,
    code: 58,
  },
  {
    name: "f2",
    label: "F2",
    x: 3,
    y: 0,
    width: 1,
    code: 59,
  },
  {
    name: "f3",
    label: "F3",
    x: 4,
    y: 0,
    width: 1,
    code: 60,
  },
  {
    name: "f4",
    label: "F4",
    x: 5,
    y: 0,
    width: 1,
    code: 61,
  },
  {
    name: "f5",
    label: "F5",
    x: 6.5,
    y: 0,
    width: 1,
    code: 62,
  },
  {
    name: "f6",
    label: "F6",
    x: 7.5,
    y: 0,
    width: 1,
    code: 63,
  },
  {
    name: "f7",
    label: "F7",
    x: 8.5,
    y: 0,
    width: 1,
    code: 64,
  },
  {
    name: "f8",
    label: "F8",
    x: 9.5,
    y: 0,
    width: 1,
    code: 65,
  },
  {
    name: "f9",
    label: "F9",
    x: 11,
    y: 0,
    width: 1,
    code: 66,
  },
  {
    name: "f10",
    label: "F10",
    x: 12,
    y: 0,
    width: 1,
    code: 67,
  },
  {
    name: "f11",
    label: "F11",
    x: 13,
    y: 0,
    width: 1,
    code: 68,
  },
  {
    name: "f12",
    label: "F12",
    x: 14,
    y: 0,
    width: 1,
    code: 69,
  },
  {
    name: "print-screen",
    label: "PrtSc",
    x: 15.5,
    y: 0,
    width: 1,
    code: 70,
  },
  {
    name: "scroll-lock",
    label: "ScrLk",
    x: 16.5,
    y: 0,
    width: 1,
    code: 71,
  },
  {
    name: "pause",
    label: "Pause",
    x: 17.5,
    y: 0,
    width: 1,
    code: 72,
  },
  {
    name: "grave",
    label: "`",
    x: 0,
    y: 1.4,
    width: 1,
    code: 53,
  },
  {
    name: "1",
    label: "1",
    x: 1,
    y: 1.4,
    width: 1,
    code: 30,
  },
  {
    name: "2",
    label: "2",
    x: 2,
    y: 1.4,
    width: 1,
    code: 31,
  },
  {
    name: "3",
    label: "3",
    x: 3,
    y: 1.4,
    width: 1,
    code: 32,
  },
  {
    name: "4",
    label: "4",
    x: 4,
    y: 1.4,
    width: 1,
    code: 33,
  },
  {
    name: "5",
    label: "5",
    x: 5,
    y: 1.4,
    width: 1,
    code: 34,
  },
  {
    name: "6",
    label: "6",
    x: 6,
    y: 1.4,
    width: 1,
    code: 35,
  },
  {
    name: "7",
    label: "7",
    x: 7,
    y: 1.4,
    width: 1,
    code: 36,
  },
  {
    name: "8",
    label: "8",
    x: 8,
    y: 1.4,
    width: 1,
    code: 37,
  },
  {
    name: "9",
    label: "9",
    x: 9,
    y: 1.4,
    width: 1,
    code: 38,
  },
  {
    name: "0",
    label: "0",
    x: 10,
    y: 1.4,
    width: 1,
    code: 39,
  },
  {
    name: "minus",
    label: "−",
    x: 11,
    y: 1.4,
    width: 1,
    code: 45,
  },
  {
    name: "equal",
    label: "=",
    x: 12,
    y: 1.4,
    width: 1,
    code: 46,
  },
  {
    name: "backspace",
    label: "Backspace",
    x: 13,
    y: 1.4,
    width: 2,
    code: 42,
  },
  {
    name: "insert",
    label: "Ins",
    x: 15.5,
    y: 1.4,
    width: 1,
    code: 73,
  },
  {
    name: "home",
    label: "Home",
    x: 16.5,
    y: 1.4,
    width: 1,
    code: 74,
  },
  {
    name: "page-up",
    label: "PgUp",
    x: 17.5,
    y: 1.4,
    width: 1,
    code: 75,
  },
  {
    name: "tab",
    label: "Tab",
    x: 0,
    y: 2.4,
    width: 1.5,
    code: 43,
  },
  {
    name: "q",
    label: "Q",
    x: 1.5,
    y: 2.4,
    width: 1,
    code: 20,
  },
  {
    name: "w",
    label: "W",
    x: 2.5,
    y: 2.4,
    width: 1,
    code: 26,
  },
  {
    name: "e",
    label: "E",
    x: 3.5,
    y: 2.4,
    width: 1,
    code: 8,
  },
  {
    name: "r",
    label: "R",
    x: 4.5,
    y: 2.4,
    width: 1,
    code: 21,
  },
  {
    name: "t",
    label: "T",
    x: 5.5,
    y: 2.4,
    width: 1,
    code: 23,
  },
  {
    name: "y",
    label: "Y",
    x: 6.5,
    y: 2.4,
    width: 1,
    code: 28,
  },
  {
    name: "u",
    label: "U",
    x: 7.5,
    y: 2.4,
    width: 1,
    code: 24,
  },
  {
    name: "i",
    label: "I",
    x: 8.5,
    y: 2.4,
    width: 1,
    code: 12,
  },
  {
    name: "o",
    label: "O",
    x: 9.5,
    y: 2.4,
    width: 1,
    code: 18,
  },
  {
    name: "p",
    label: "P",
    x: 10.5,
    y: 2.4,
    width: 1,
    code: 19,
  },
  {
    name: "left-bracket",
    label: "[",
    x: 11.5,
    y: 2.4,
    width: 1,
    code: 47,
  },
  {
    name: "right-bracket",
    label: "]",
    x: 12.5,
    y: 2.4,
    width: 1,
    code: 48,
  },
  {
    name: "backslash",
    label: "\\",
    x: 13.5,
    y: 2.4,
    width: 1.5,
    code: 49,
  },
  {
    name: "delete",
    label: "Del",
    x: 15.5,
    y: 2.4,
    width: 1,
    code: 76,
  },
  {
    name: "end",
    label: "End",
    x: 16.5,
    y: 2.4,
    width: 1,
    code: 77,
  },
  {
    name: "page-down",
    label: "PgDn",
    x: 17.5,
    y: 2.4,
    width: 1,
    code: 78,
  },
  {
    name: "caps-lock",
    label: "Caps",
    x: 0,
    y: 3.4,
    width: 1.75,
    code: 57,
  },
  {
    name: "a",
    label: "A",
    x: 1.75,
    y: 3.4,
    width: 1,
    code: 4,
  },
  {
    name: "s",
    label: "S",
    x: 2.75,
    y: 3.4,
    width: 1,
    code: 22,
  },
  {
    name: "d",
    label: "D",
    x: 3.75,
    y: 3.4,
    width: 1,
    code: 7,
  },
  {
    name: "f",
    label: "F",
    x: 4.75,
    y: 3.4,
    width: 1,
    code: 9,
  },
  {
    name: "g",
    label: "G",
    x: 5.75,
    y: 3.4,
    width: 1,
    code: 10,
  },
  {
    name: "h",
    label: "H",
    x: 6.75,
    y: 3.4,
    width: 1,
    code: 11,
  },
  {
    name: "j",
    label: "J",
    x: 7.75,
    y: 3.4,
    width: 1,
    code: 13,
  },
  {
    name: "k",
    label: "K",
    x: 8.75,
    y: 3.4,
    width: 1,
    code: 14,
  },
  {
    name: "l",
    label: "L",
    x: 9.75,
    y: 3.4,
    width: 1,
    code: 15,
  },
  {
    name: "semicolon",
    label: ";",
    x: 10.75,
    y: 3.4,
    width: 1,
    code: 51,
  },
  {
    name: "quote",
    label: "'",
    x: 11.75,
    y: 3.4,
    width: 1,
    code: 52,
  },
  {
    name: "enter",
    label: "Enter",
    x: 12.75,
    y: 3.4,
    width: 2.25,
    code: 40,
  },
  {
    name: "left-shift",
    label: "Shift",
    x: 0,
    y: 4.4,
    width: 2.25,
    code: 225,
  },
  {
    name: "z",
    label: "Z",
    x: 2.25,
    y: 4.4,
    width: 1,
    code: 29,
  },
  {
    name: "x",
    label: "X",
    x: 3.25,
    y: 4.4,
    width: 1,
    code: 27,
  },
  {
    name: "c",
    label: "C",
    x: 4.25,
    y: 4.4,
    width: 1,
    code: 6,
  },
  {
    name: "v",
    label: "V",
    x: 5.25,
    y: 4.4,
    width: 1,
    code: 25,
  },
  {
    name: "b",
    label: "B",
    x: 6.25,
    y: 4.4,
    width: 1,
    code: 5,
  },
  {
    name: "n",
    label: "N",
    x: 7.25,
    y: 4.4,
    width: 1,
    code: 17,
  },
  {
    name: "m",
    label: "M",
    x: 8.25,
    y: 4.4,
    width: 1,
    code: 16,
  },
  {
    name: "comma",
    label: ",",
    x: 9.25,
    y: 4.4,
    width: 1,
    code: 54,
  },
  {
    name: "period",
    label: ".",
    x: 10.25,
    y: 4.4,
    width: 1,
    code: 55,
  },
  {
    name: "slash",
    label: "/",
    x: 11.25,
    y: 4.4,
    width: 1,
    code: 56,
  },
  {
    name: "right-shift",
    label: "Shift",
    x: 12.25,
    y: 4.4,
    width: 2.75,
    code: 229,
  },
  {
    name: "up",
    label: "↑",
    x: 16.5,
    y: 4.4,
    width: 1,
    code: 82,
  },
  {
    name: "left-ctrl",
    label: "Ctrl",
    x: 0,
    y: 5.4,
    width: 1.25,
    code: 224,
  },
  {
    name: "left-win",
    label: "Win",
    x: 1.25,
    y: 5.4,
    width: 1.25,
    code: 227,
  },
  {
    name: "left-alt",
    label: "Alt",
    x: 2.5,
    y: 5.4,
    width: 1.25,
    code: 226,
  },
  {
    name: "space",
    label: "Space",
    x: 3.75,
    y: 5.4,
    width: 6.25,
    code: 44,
  },
  {
    name: "right-alt",
    label: "Alt",
    x: 10,
    y: 5.4,
    width: 1.25,
    code: 230,
  },
  {
    name: "fn",
    label: "Fn",
    x: 11.25,
    y: 5.4,
    width: 1.25,
    code: 172,
  },
  {
    name: "menu",
    label: "Menu",
    x: 12.5,
    y: 5.4,
    width: 1.25,
    code: 101,
  },
  {
    name: "right-ctrl",
    label: "Ctrl",
    x: 13.75,
    y: 5.4,
    width: 1.25,
    code: 228,
  },
  {
    name: "left",
    label: "←",
    x: 15.5,
    y: 5.4,
    width: 1,
    code: 80,
  },
  {
    name: "down",
    label: "↓",
    x: 16.5,
    y: 5.4,
    width: 1,
    code: 81,
  },
  {
    name: "right",
    label: "→",
    x: 17.5,
    y: 5.4,
    width: 1,
    code: 79,
  },
];

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
export function chordMacro(
  key: number,
  layer: Layer,
  codes: number[],
  name: string,
): MacroBinding {
  return {
    key,
    layer,
    name,
    repeat: 1,
    events: [
      ...codes.map((code) => ({ code, down: true, delayMs: 20 })),
      ...[...codes]
        .reverse()
        .map((code) => ({ code, down: false, delayMs: 20 })),
    ],
  };
}
export function appendMacroTap(macro: MacroBinding, code: number): MacroBinding {
  if(macro.key===81 || macro.events.length>78 || !Number.isInteger(code) || !((code>=4 && code<=0x73) || (code>=0xe0 && code<=0xe7))) return macro;
  return {...macro,events:[...macro.events,{code,down:true,delayMs:20},{code,down:false,delayMs:20}]};
}
export function eventCode(code: string): number | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3) - 65 + 4;
  if (/^Digit[0-9]$/.test(code))
    return code === "Digit0" ? 39 : Number(code.slice(5)) + 29;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    const n = Number(code.slice(1));
    return n <= 12 ? n + 57 : n + 91;
  }
  const names: Record<string, string> = {
    Backquote: "grave",
    Minus: "minus",
    Equal: "equal",
    BracketLeft: "left-bracket",
    BracketRight: "right-bracket",
    Backslash: "backslash",
    Semicolon: "semicolon",
    Quote: "quote",
    Comma: "comma",
    Period: "period",
    Slash: "slash",
    Escape: "esc",
    CapsLock: "caps-lock",
    PrintScreen: "print-screen",
    ScrollLock: "scroll-lock",
    PageUp: "page-up",
    PageDown: "page-down",
    ControlLeft: "left-ctrl",
    ControlRight: "right-ctrl",
    ShiftLeft: "left-shift",
    ShiftRight: "right-shift",
    AltLeft: "left-alt",
    AltRight: "right-alt",
    MetaLeft: "left-win",
    ContextMenu: "menu",
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };
  if (code === "MetaRight") return 231;
  return layout.find((key) => key.name === (names[code] ?? code.toLowerCase()))
    ?.code;
}

export interface HardwareSlot {
  slot: number;
  data: Hardware | null;
  error: string | null;
}
export interface HardwareScan {
  device: Device;
  profiles: HardwareSlot[];
}
