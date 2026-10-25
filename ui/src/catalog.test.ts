import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { presetCatalog } from './catalog.ts';
import { layout } from './model.ts';

test('every shipped profile runs from keyboard memory without a host reaction', () => {
  assert.ok(presetCatalog().every(profile => !Object.hasOwn(profile, 'reactive')));
});

test('curated catalog contains distinct lighting programs without bindings or Gaming', () => {
  const profiles = presetCatalog();
  assert.ok(profiles.length >= 34);
  assert.equal(new Set(profiles.map(p => p.id)).size,profiles.length);
  assert.equal(new Set(profiles.map(p => p.name)).size,profiles.length);
  assert.ok(profiles.every(p => p.id !== 'gaming' && p.name !== 'Gaming'));
  const programs = new Set(profiles.map(p => JSON.stringify([p.keys,p.frames,p.brightness,p.firmware])));
  assert.equal(programs.size,profiles.length);
  for(const profile of profiles) {
    assert.equal(profile.keys.length,87);
    assert.equal(profile.bindings.length,0);
    assert.equal(profile.macros?.length ?? 0,0);
    assert.ok(profile.frames.length <= 20);
    assert.ok(profile.frames.some(frame => frame.keys.length > 0),profile.name);
    if(profile.frames.length > 1) assert.ok(new Set(profile.frames.map(f => f.keys.join(','))).size > 1,profile.name);
  }
});

test('factory templates expose documented mode IDs without pretending to be host reactions', () => {
  const profiles=presetCatalog().filter(p=>p.firmware);
  assert.deepEqual(profiles.map(p=>p.firmware!.mode),[0,1,2,3,4,6,7,8,9,10]);
  assert.ok(profiles.every(p=>!Object.hasOwn(p,"reactive") && p.keys.every(k=>k.color.every(c=>c===0))));
});

test('static collection has distinct multicolor layouts that stay constant over time', async () => {
  const {previewColors}=await import('./preview.ts');
  const profiles=presetCatalog().filter(p=>p.id.startsWith('static-v3-'));
  assert.ok(profiles.length >= 24);
  for(const profile of profiles) {
    assert.equal(Object.hasOwn(profile,"reactive"),false);
    assert.equal(profile.frames.length,1);
    assert.equal(new Set(profile.frames[0].keys).size,87);
    assert.ok(profile.keys.every(key=>key.effect==='static'));
    assert.ok(new Set(profile.keys.map(key=>key.color.join(','))).size >= 2,profile.name);
    assert.deepEqual(previewColors(profile,0),previewColors(profile,1735),profile.name);
  }
});
test('desktop and browser share the generated catalog', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../resources/presets.json',import.meta.url),'utf8')),presetCatalog());
});
test('static accent layouts paint navigation separately from letters and function keys', () => {
  const profile=presetCatalog().find(p=>p.id==='static-v3-cherry-ink')!;
  const color=(name:string)=>profile.keys[layout.findIndex(key=>key.name===name)].color;
  assert.deepEqual(color('up'),[245,230,220]);
  assert.deepEqual(color('a'),[105,40,75]);
  assert.deepEqual(color('f1'),[255,25,90]);
});
