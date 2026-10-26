import assert from "node:assert/strict";
import { test } from "node:test";
import type { Profile } from "../../model/types.ts";
import type { BuilderSettings } from "./builder.ts";
import {
  buildLighting,
  defaultSettings,
  palettes,
  patterns,
} from "./builder.ts";
const base = (): Profile => ({
  version: 1,
  id: "custom",
  name: "Custom",
  description: "",
  brightness: 100,
  keys: [],
  frames: [],
  bindings: [{ key: 1, layer: "fn", action: 176 }],
  macros: [],
});
test("replacing factory lighting clears the factory selector while preserving assignments", () => {
  const source = { ...base(), firmware: { mode: 7 } };
  const result = buildLighting(source, defaultSettings());
  assert.equal(result.firmware, undefined);
  assert.deepEqual(result.bindings, [{ key: 1, layer: "fn", action: 176 }]);
  assert.deepEqual(source.firmware, { mode: 7 });
});
test("all shipped patterns and palettes compile to bounded native profiles", () => {
  assert.ok(patterns.length >= 24);
  assert.ok(palettes.length >= 12);
  assert.equal(new Set(patterns.map((p) => p.id)).size, patterns.length);
  for (const pattern of patterns)
    for (const palette of palettes) {
      const settings = {
        ...defaultSettings(),
        pattern: pattern.id,
        colors: palette.colors,
      };
      const profile = buildLighting(base(), settings);
      assert.equal(profile.keys.length, 87);
      assert.ok(
        profile.frames.length >= 1 && profile.frames.length <= 20,
        pattern.id,
      );
      assert.ok(
        profile.frames.every(
          (f) =>
            f.duration >= 1 &&
            f.duration <= 255 &&
            f.keys.every((k) => k >= 0 && k < 87) &&
            new Set(f.keys).size === f.keys.length,
        ),
      );
      assert.ok(
        profile.keys.every(
          (k) =>
            k.speed >= 1 &&
            k.color.every((c) => Number.isInteger(c) && c >= 0 && c <= 255),
        ),
      );
      assert.deepEqual(profile.bindings, base().bindings);
      assert.deepEqual(profile, buildLighting(base(), settings));
    }
});
test("custom palette modes, effects, reversal and brightness preserve user choices", () => {
  const settings: BuilderSettings = {
    ...defaultSettings(),
    pattern: "wave",
    colors: [
      [255, 0, 0],
      [0, 0, 255],
    ] as [number, number, number][],
    brightness: 35,
    width: 2,
    duration: 3,
  };
  const p = buildLighting(base(), settings);
  assert.equal(p.brightness, 35);
  assert.deepEqual(p.keys[0].color, [255, 0, 0]);
  assert.deepEqual(p.keys[86].color, [0, 0, 255]);
  assert.deepEqual(
    buildLighting(base(), { ...settings, reverse: true }).frames,
    [...p.frames].reverse(),
  );
  const cycle = buildLighting(base(), { ...settings, effect: "cycle" });
  assert.ok(
    cycle.keys.every((k) => k.pause <= 5 && k.color.every((c) => c === 255)),
  );
  const solid = buildLighting(base(), { ...settings, distribution: "solid" });
  assert.ok(solid.keys.every((k) => k.color.join() === "255,0,0"));
});
test("invalid constructor parameters fail before creating a profile", () => {
  for (const change of [
    { pattern: "unknown" },
    { colors: [] },
    { width: 0 },
    { duration: 0 },
    { brightness: 101 },
    { colors: [[300, 0, 0]] },
    { distribution: "bad" },
    { effect: "bad" },
    { width: NaN },
  ]) {
    assert.throws(() =>
      buildLighting(base(), { ...defaultSettings(), ...change } as never),
    );
  }
});

test("constructor color direction and palette reversal leave the motion program unchanged", () => {
  const settings = {
    ...defaultSettings(),
    colors: [
      [255, 0, 0],
      [0, 0, 255],
    ] as [number, number, number][],
  };
  const normal = buildLighting(base(), settings);
  const reversed = buildLighting(base(), { ...settings, reverseColors: true });
  assert.deepEqual(reversed.keys[0].color, [0, 0, 255]);
  assert.deepEqual(reversed.keys[86].color, [255, 0, 0]);
  assert.deepEqual(reversed.frames, normal.frames);
  const upward = buildLighting(base(), {
    ...settings,
    distribution: "vertical-reverse",
  });
  assert.deepEqual(upward.keys[0].color, [0, 0, 255]);
  assert.deepEqual(upward.keys[86].color, [255, 0, 0]);
  const diagonal = buildLighting(base(), {
    ...settings,
    distribution: "diagonal",
  });
  assert.deepEqual(diagonal.keys[0].color, [255, 0, 0]);
  assert.deepEqual(diagonal.keys[86].color, [0, 0, 255]);
});

test("new autonomous patterns move distinctly inside the native frame budget", () => {
  const programs = [];
  for (const pattern of [
    "double-wave",
    "diamond-ring",
    "twin-spiral",
    "waterfall",
    "pinwheel",
    "converge",
    "braid",
    "zipper",
  ]) {
    const profile = buildLighting(base(), {
      ...defaultSettings(),
      pattern: pattern as never,
    });
    assert.ok(profile.frames.length <= 20);
    assert.ok(
      new Set(profile.frames.map((f) => f.keys.join(","))).size > 1,
      pattern,
    );
    assert.ok(
      profile.frames.some((f) => f.keys.length > 0),
      pattern,
    );
    programs.push(JSON.stringify(profile.frames));
  }
  assert.equal(new Set(programs).size, 8);
});
