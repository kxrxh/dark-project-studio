import { test } from "node:test";
import assert from "node:assert/strict";
import { previewColors } from "./preview.ts";
import { layout } from "./model.ts";
import type { Profile } from "./model.ts";

const profile: Profile = {
  version: 1, id: "preview", name: "Preview", description: "", brightness: 50,
  keys: layout.map(()=>({color:[200,100,0],effect:"static",speed:1,pause:0})),
  frames: [{keys:[0],duration:1},{keys:[1],duration:1}], bindings: [],
};
test("catalog preview follows stored frame timing and brightness without mutating the profile", () => {
  const before = structuredClone(profile);
  assert.deepEqual(previewColors(profile, 50).slice(0,2), [[100,50,0],[8,4,0]]);
  assert.deepEqual(previewColors(profile, 150).slice(0,2), [[8,4,0],[100,50,0]]);
  assert.deepEqual(profile, before);
});
