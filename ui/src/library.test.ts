import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleProfiles, extractUserProfiles, profileEditor } from "./library.ts";
import { presetCatalog } from "./catalog.ts";

test("opening or copying a hardware factory profile selects its actual lighting editor", () => {
  assert.equal(profileEditor({firmware:{mode:7}}),"firmware");
  assert.equal(profileEditor({}),"overview");
});

test("profile browsing combines the search with the actual hardware capability", () => {
  const still = {frames:[{keys:[0],duration:1}],keys:[{color:[1,2,3] as [number,number,number],effect:"static" as const,speed:1,pause:0}]};
  const items = [
    { ...still, id: "edited", name: "Моя Волна" },
    { ...still, id: "factory", name: "Волна от нажатия", firmware: {mode:9} },
    { ...still, id: "other", name: "Sunset" },
  ];
  assert.deepEqual(visibleProfiles(items, "  ВОЛНА ", "static").map(p => p.id), ["edited"]);
  assert.deepEqual(visibleProfiles(items, "волна", "reactive").map(p => p.id), ["factory"]);
  assert.deepEqual(visibleProfiles(items, "", "all").map(p => p.id), ["edited", "factory", "other"]);
  assert.deepEqual(visibleProfiles(items, "missing", "all"), []);
});

test("separating locked presets preserves edited legacy presets as user copies and is repeatable", () => {
  const presets=presetCatalog().slice(0,2);
  const edited={...structuredClone(presets[1]),name:"Мой закат",brightness:37};
  const custom={...structuredClone(presets[0]),id:"personal",name:"Мой профиль"};
  const users=extractUserProfiles([presets[0],edited,custom],presets,()=>"preserved-copy");
  assert.deepEqual(users,[{...edited,id:"preserved-copy"},custom]);
  assert.deepEqual(extractUserProfiles(users,presets,()=>"should-not-be-used"),users);
  assert.equal(edited.id,presets[1].id);
});

test("my profiles filter excludes locked preset ids while keeping user copies of the same lighting", () => {
  const preset=presetCatalog()[0];
  const custom={...preset,id:"my-copy",name:"Моя копия"};
  assert.deepEqual(visibleProfiles([preset,custom],"","mine",new Set([preset.id])).map(p=>p.id),["my-copy"]);
});

test("static browsing excludes a one-frame breathing effect, animated masks and factory modes", () => {
  const still={name:"Quiet",frames:[{keys:[0],duration:1}],keys:[{color:[100,50,0] as [number,number,number],effect:"static" as const,speed:1,pause:0}]};
  const items=[
    {...still,id:"static"},
    {...still,id:"breathing",keys:[{...still.keys[0],effect:"breathing" as const}]},
    {...still,id:"moving",frames:[...still.frames,{keys:[],duration:1}]},
    {...still,id:"factory",firmware:{mode:6}},
  ];
  assert.deepEqual(visibleProfiles(items,"","static").map(p=>p.id),["static"]);
});
