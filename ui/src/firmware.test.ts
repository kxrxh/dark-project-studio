import {test} from "node:test";
import assert from "node:assert/strict";
import * as firmware from "./firmware.ts";
import {matchStoredLighting} from "./device.ts";
import {visibleProfiles} from "./library.ts";
import type {Profile} from "./model.ts";

test("onboard reaction presets carry two editable colors and valid stored tuning without host reactions",()=>{
  const reactions=firmware.firmwarePresets().filter(profile=>profile.firmware?.tuning);
  assert.deepEqual(reactions.map(profile=>profile.firmware!.mode),[6,7,8,9,10]);
  for(const profile of reactions) {
    assert.equal(Object.hasOwn(profile,"reactive"),false);
    assert.equal(profile.firmware!.tuning!.colors.length,2);
    assert.equal(profile.firmware!.tuning!.brightness,20);
  }
});

test("keypress filter includes firmware reactions without classifying every factory effect as reactive",()=>{
  assert.deepEqual(visibleProfiles(firmware.firmwarePresets(),"","reactive").map(p=>p.firmware!.mode),[6,7,8,9,10]);
});

test("switching firmware reactions retains palette and assignments while clamping the new speed range",()=>{
  const source:Profile={version:1,id:"mine",name:"Mine",description:"",brightness:100,keys:[],frames:[],bindings:[{key:1,layer:"fn",action:176}],firmware:{mode:7,tuning:{brightness:12,speed:0,colors:[[10,20,30],[40,50,60]],randomColors:false}}};
  const before=structuredClone(source);
  const changed=firmware.switchFirmware?.(source,6);
  assert.equal(changed?.firmware?.tuning?.speed,10);
  assert.deepEqual(changed?.firmware?.tuning?.colors,[[10,20,30],[40,50,60]]);
  assert.deepEqual(changed?.bindings,[{key:1,layer:"fn",action:176}]);
  assert.equal(firmware.switchFirmware?.(source,0)?.firmware?.tuning,undefined);
  assert.deepEqual(source,before);
  assert.throws(()=>firmware.switchFirmware?.(source,99));
});

test("slot matching distinguishes the actual saved colors and speed of the same firmware mode",()=>{
  const source:Profile={version:1,id:"mine",name:"Mine",description:"",brightness:100,keys:[],frames:[],bindings:[],firmware:{mode:8,tuning:{brightness:12,speed:50,colors:[[10,20,30],[40,50,60]],randomColors:false}}};
  const other=structuredClone(source);other.id="other";other.firmware!.tuning!.speed=60;
  assert.equal(matchStoredLighting(source,[source,other])?.id,"mine");
  other.firmware!.tuning!.speed=50;other.firmware!.tuning!.colors[0]=[255,0,0];
  assert.equal(matchStoredLighting(source,[other]),undefined);
});
