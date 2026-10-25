import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsProfileScan,
  targetProfile,
  destinationAfterDetection,
  matchStoredLighting,
} from "./device.ts";
import type { Device, Profile } from "./model.ts";
const connected: Device = {
  connected: true,
  supported: true,
  revision: "3131",
  identity: "usb-a",
  active: 3,
  message: "",
};
test("detects newly connected and replacement keyboards without scanning unchanged identity", () => {
  assert.equal(needsProfileScan(null, connected), true);
  assert.equal(needsProfileScan("usb-a", connected), false);
  assert.equal(
    needsProfileScan("usb-a", { ...connected, identity: "usb-b" }),
    true,
  );
  assert.equal(
    needsProfileScan(null, { ...connected, connected: false }),
    false,
  );
  assert.equal(
    needsProfileScan(null, { ...connected, supported: false }),
    false,
  );
});
test("destination follows actual active profile by default, never a hardcoded fourth profile", () => {
  assert.equal(targetProfile(null, connected), 3);
  assert.equal(targetProfile(null, { ...connected, active: 1 }), 1);
  assert.equal(targetProfile(2, connected), 2);
  assert.equal(targetProfile(null, { ...connected, active: null }), null);
  assert.equal(targetProfile(4, { ...connected, connected: false }), null);
  assert.equal(targetProfile(4, { ...connected, supported: false }), null);
});
test("a new connection discards the previous manual write destination", () => {
  assert.equal(destinationAfterDetection(2, "usb-a", connected), 2);
  assert.equal(
    destinationAfterDetection(2, "usb-a", { ...connected, identity: "usb-b" }),
    null,
  );
  assert.equal(
    destinationAfterDetection(2, "usb-a", { ...connected, connected: false }),
    null,
  );
});
test("stored lighting names use baked brightness and unordered masks, without guessing between identical copies", () => {
  const source: Profile={version:1,id:"mine",name:"My light",description:"",brightness:50,keys:[0,1].map(()=>({color:[101,51,0],effect:"static",speed:1,pause:32})),frames:[{keys:[1,0],duration:1}],bindings:[]};
  const stored: Profile={...structuredClone(source),id:"slot-2",name:"Slot 2",brightness:100,keys:source.keys.map(key=>({...key,color:[50,25,0]})),frames:[{keys:[0,1],duration:1}]};
  assert.equal(matchStoredLighting(stored,[source])?.name,"My light");
  assert.equal(matchStoredLighting(stored,[source,{...source,id:"copy",name:"Copy"}]),undefined);
  const changed=structuredClone(source); changed.keys[0].color=[255,0,0];
  assert.equal(matchStoredLighting(stored,[changed]),undefined);
});

test("factory slot names match their mode instead of unused custom lighting", () => {
  const source: Profile & {firmware:{mode:number}}={version:1,id:"factory-6",name:"Заводской 6",description:"",brightness:100,keys:[],frames:[],bindings:[],firmware:{mode:6}};
  const stored={...source,brightness:25,keys:[{color:[55,99,77] as [number,number,number],effect:"static" as const,speed:1,pause:32}]};
  assert.equal(matchStoredLighting(stored,[source])?.id,"factory-6");
  assert.equal(matchStoredLighting(stored,[{...source,firmware:{mode:7}}]),undefined);
  assert.equal(matchStoredLighting(source,[{...source,firmware:undefined}]),undefined);
});
