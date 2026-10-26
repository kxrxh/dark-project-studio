import { layout } from "../../model/keyboard.ts";
import type { Layer, MacroBinding } from "../../model/types.ts";

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
export function appendMacroTap(
  macro: MacroBinding,
  code: number,
): MacroBinding {
  if (
    macro.key === 81 ||
    macro.events.length > 78 ||
    !Number.isInteger(code) ||
    !((code >= 4 && code <= 0x73) || (code >= 0xe0 && code <= 0xe7))
  )
    return macro;
  return {
    ...macro,
    events: [
      ...macro.events,
      { code, down: true, delayMs: 20 },
      { code, down: false, delayMs: 20 },
    ],
  };
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
