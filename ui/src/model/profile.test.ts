import assert from "node:assert/strict";
import { test } from "node:test";
import {
  copyFrame,
  generateAnimation,
  moveFrame,
} from "../features/lighting/frames.ts";
import {
  appendMacroTap,
  chordMacro,
  eventCode,
} from "../features/macros/model.ts";
import { layout } from "./keyboard.ts";
import {
  editKeys,
  frameAt,
  gradient,
  hex,
  rgb,
  setBinding,
} from "./profile.ts";
import type { Profile } from "./types.ts";
const profile = (): Profile => ({
  version: 1,
  id: "test",
  name: "Test",
  description: "",
  brightness: 100,
  keys: Array.from({ length: 87 }, () => ({
    color: [10, 20, 30],
    effect: "static",
    speed: 1,
    pause: 32,
  })),
  frames: [
    { keys: [0, 1], duration: 1 },
    { keys: [2], duration: 3 },
  ],
  bindings: [],
});
test("edits only selected keys and leaves undo source intact", () => {
  const original = profile();
  const changed = editKeys(original, [1, 35], { color: [255, 0, 10] });
  assert.deepEqual(original.keys[1].color, [10, 20, 30]);
  assert.deepEqual(changed.keys[35].color, [255, 0, 10]);
  assert.equal(changed.keys[0], original.keys[0]);
});
test("binding replaces one layer, preserves the other and protects Fn", () => {
  let p = setBinding(profile(), 1, "base", 4);
  p = setBinding(p, 1, "fn", 0xb0);
  p = setBinding(p, 1, "base", 5);
  assert.deepEqual(p.bindings, [
    { key: 1, layer: "fn", action: 0xb0 },
    { key: 1, layer: "base", action: 5 },
  ]);
  assert.throws(() => setBinding(p, 81, "base", 0));
  assert.equal(setBinding(p, 1, "base", null).bindings.length, 1);
});
test("timeline wraps using firmware 100ms units", () => {
  const p = profile();
  assert.equal(frameAt(p, 0), 0);
  assert.equal(frameAt(p, 100), 1);
  assert.equal(frameAt(p, 399), 1);
  assert.equal(frameAt(p, 400), 0);
});
test("color conversion and gradient cover both endpoints", () => {
  assert.equal(hex([0, 128, 255]), "#0080ff");
  assert.deepEqual(rgb("#0080ff"), [0, 128, 255]);
  const changed = gradient(profile(), [0, 1], [255, 0, 0], [0, 0, 255]);
  assert.deepEqual(changed.keys[0].color, [255, 0, 0]);
  assert.deepEqual(changed.keys[1].color, [0, 0, 255]);
  assert.equal(layout.length, 87);
  assert.equal(new Set(layout.map((k) => k.name)).size, 87);
  assert.equal(layout[81].name, "fn");
});

test("gradient direction follows keyboard positions, including reverse, vertical and radial layouts", () => {
  const key = (name: string) => layout.findIndex((k) => k.name === name);
  const corners = [key("esc"), key("pause"), key("left-ctrl"), key("right")];
  const source = profile();
  const vertical = gradient(source, corners, [255, 0, 0], [0, 0, 255], "down");
  assert.deepEqual(vertical.keys[key("esc")].color, [255, 0, 0]);
  assert.deepEqual(vertical.keys[key("pause")].color, [255, 0, 0]);
  assert.deepEqual(vertical.keys[key("left-ctrl")].color, [0, 0, 255]);
  assert.deepEqual(vertical.keys[key("right")].color, [0, 0, 255]);
  const reverse = gradient(source, corners, [255, 0, 0], [0, 0, 255], "left");
  assert.deepEqual(reverse.keys[key("esc")].color, [0, 0, 255]);
  assert.deepEqual(reverse.keys[key("pause")].color, [255, 0, 0]);
  const center = key("g");
  const radial = gradient(
    source,
    [...corners, center],
    [255, 0, 0],
    [0, 0, 255],
    "outward",
  );
  assert.deepEqual(radial.keys[center].color, [255, 0, 0]);
  assert.deepEqual(radial.keys[key("esc")].color, [0, 0, 255]);
  assert.deepEqual(
    gradient(source, [...corners, center], [255, 0, 0], [0, 0, 255], "inward")
      .keys[center].color,
    [0, 0, 255],
  );
  assert.equal(vertical.keys[1], source.keys[1]);
  assert.deepEqual(source.keys[0].color, [10, 20, 30]);
});

test("native animation generators stay bounded, deterministic and cover the keyboard", () => {
  for (const kind of ["wave", "meet", "sparkle"] as const) {
    const frames = generateAnimation(kind, 2, 3, false);
    assert.ok(frames.length > 1 && frames.length <= 20);
    assert.deepEqual(frames, generateAnimation(kind, 2, 3, false));
    assert.ok(
      frames.every(
        (f) =>
          f.duration === 3 &&
          f.keys.every((i) => i >= 0 && i < 87) &&
          new Set(f.keys).size === f.keys.length,
      ),
    );
    if (kind === "wave")
      assert.equal(new Set(frames.flatMap((f) => f.keys)).size, 87);
    assert.deepEqual(
      generateAnimation(kind, 2, 3, true),
      [...frames].reverse(),
    );
  }
});
test("frame edits clone masks, reorder and preserve the source", () => {
  const p = profile();
  const cloned = copyFrame(p, 0);
  assert.equal(cloned.frames.length, 3);
  assert.deepEqual(cloned.frames[1], p.frames[0]);
  assert.notEqual(cloned.frames[1].keys, p.frames[0].keys);
  assert.deepEqual(moveFrame(p, 0, 1).frames, [p.frames[1], p.frames[0]]);
  assert.deepEqual(p.frames[0].keys, [0, 1]);
});
test("macro chords release modifiers and normal bindings replace macro assignments", () => {
  const item = chordMacro(12, "fn", [224, 6], "Копировать");
  assert.deepEqual(
    item.events.map((e) => [e.code, e.down]),
    [
      [224, true],
      [6, true],
      [6, false],
      [224, false],
    ],
  );
  const p = { ...profile(), macros: [item] };
  assert.equal(setBinding(p, 12, "fn", 176).macros?.length, 0);
  assert.equal(p.macros.length, 1);
  assert.equal(eventCode("KeyA"), 4);
  assert.equal(eventCode("ControlLeft"), 224);
  assert.equal(eventCode("Unidentified"), undefined);
});

test("visual macro taps append balanced pairs without changing the source or exceeding firmware limits", () => {
  const original = chordMacro(1, "fn", [224, 6], "Copy");
  const next = appendMacroTap(original, 4);
  assert.deepEqual(next.events.slice(-2), [
    { code: 4, down: true, delayMs: 20 },
    { code: 4, down: false, delayMs: 20 },
  ]);
  assert.equal(original.events.length, 4);
  assert.equal(next.key, 1);
  assert.equal(next.layer, "fn");
  assert.equal(next.name, "Copy");
  const full = {
    ...original,
    events: Array.from({ length: 39 }, () => [
      { code: 4, down: true, delayMs: 20 },
      { code: 4, down: false, delayMs: 20 },
    ]).flat(),
  };
  const last = appendMacroTap(full, 5);
  assert.equal(last.events.length, 80);
  assert.equal(appendMacroTap(last, 6), last);
  assert.equal(appendMacroTap(original, 0xac), original);
  assert.equal(
    appendMacroTap({ ...original, key: 81 }, 4).events,
    original.events,
  );
});
