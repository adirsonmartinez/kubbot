import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, PHOTO_KEY, SPECS_KEY, loadUserItems, removeUserItem, saveUserItem, specFromJson, specToJson } from "../src/services/userCatalog.ts";
import type { ComponentSpec } from "../src/models/lab/componentSpec.ts";

const memory = (quota = Infinity) => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if ([...data.values()].join("").length + v.length > quota) throw new Error("quota");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
};
const spec = (id = "usr-uno", name = "Uno"): ComponentSpec => ({
  id, name, desc: "", category: "sensors", kind: "part", size: [20, 20, 10], volts: [3.3, 5], mA: 5,
  pins: [{ id: "VCC", role: "power" }, { id: "GND", role: "ground" }, { id: "S", role: "signal-in" }],
  source: { name: "", license: "MIT", url: "" },
});
const photo = "data:image/jpeg;base64,/9j/AAAA";

test("save, load and remove a component with its photo", () => {
  const s = memory();
  assert.deepEqual(loadUserItems(s), []);
  assert.equal(saveUserItem({ spec: spec(), photo }, s), "ok");
  assert.equal(saveUserItem({ spec: spec("usr-dos", "Dos"), photo: null }, s), "ok");
  const items = loadUserItems(s);
  assert.deepEqual(items.map((i) => i.spec.id), ["usr-uno", "usr-dos"]);
  assert.equal(items[0].photo, photo);
  assert.equal(items[1].photo, null);
  assert.equal(saveUserItem({ spec: { ...spec(), name: "Cambiado" }, photo: null }, s), "ok");
  assert.equal(loadUserItems(s).length, 2, "same id replaces");
  assert.equal(loadUserItems(s)[1].spec.name, "Cambiado");
  assert.equal(s.data.has(PHOTO_KEY + "usr-uno"), false, "replacing without a photo drops the old one");
  assert.equal(removeUserItem("usr-uno", s), true);
  assert.deepEqual(loadUserItems(s).map((i) => i.spec.id), ["usr-dos"]);
});

test("a photo over the guard is dropped but the ficha is kept", () => {
  const s = memory();
  const big = "data:image/jpeg;base64," + "A".repeat(LIMITS.photoBytes);
  assert.equal(saveUserItem({ spec: spec(), photo: big }, s), "ok");
  assert.equal(loadUserItems(s)[0].photo, null);
});

test("storage that is full, missing or throwing never throws", () => {
  assert.equal(saveUserItem({ spec: spec(), photo: null }, null), "failed");
  assert.deepEqual(loadUserItems(null), []);
  assert.equal(removeUserItem("x", null), false);
  assert.equal(saveUserItem({ spec: spec(), photo: null }, memory(10)), "failed");
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadUserItems(throwing), []);
  assert.equal(saveUserItem({ spec: spec(), photo: null }, throwing), "failed");
});

test("too many components is 'full'", () => {
  const s = memory();
  for (let i = 0; i < LIMITS.components; i++) assert.equal(saveUserItem({ spec: spec(`usr-p${i}`, `P${i}`), photo: null }, s), "ok");
  assert.equal(saveUserItem({ spec: spec("usr-extra", "Extra"), photo: null }, s), "full");
});

test("broken or invalid saved data is ignored", () => {
  const s = memory();
  s.data.set(SPECS_KEY, "not json");
  assert.deepEqual(loadUserItems(s), []);
  s.data.set(SPECS_KEY, JSON.stringify([spec(), { name: "sin pines" }, null, 4, spec()]));
  assert.equal(loadUserItems(s).length, 1, "invalid and duplicate fichas are left out");
  s.data.set(PHOTO_KEY + "usr-uno", "javascript:alert(1)");
  assert.equal(loadUserItems(s)[0].photo, null, "only image data URLs are accepted");
});

test("the .json of a ficha round-trips and rejects other files", () => {
  const text = specToJson(spec());
  assert.deepEqual(specFromJson(text), spec());
  assert.equal(specFromJson("[1,2]"), null);
  assert.equal(specFromJson("{"), null);
  assert.equal(specFromJson(JSON.stringify({ hello: "world" })), null);
  assert.equal(specFromJson(JSON.stringify({ name: "x", pins: [] }))?.name, "x");
});
