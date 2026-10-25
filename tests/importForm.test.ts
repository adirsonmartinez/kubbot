import test from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "../src/models/lab/componentSpec.ts";
import { convertRole, emptyForm, formToSpec, freshPinId, specToForm } from "../src/viewmodels/importForm.ts";

test("an empty form is not saveable until it has a name, sizes and volts", () => {
  const form = emptyForm();
  const keys = validateSpec(formToSpec(form)).issues.map((i) => i.key);
  assert.ok(keys.includes("name") && keys.includes("size") && keys.includes("voltsMissing"));
  Object.assign(form, { name: "Sensor de gas", size: ["32", "22", "27"], volts: ["4,5", "5.5"] });
  const check = validateSpec(formToSpec(form));
  assert.equal(check.ok, true, JSON.stringify(check.issues));
});

test("form and ficha convert both ways, decimals with a comma included", () => {
  const form = emptyForm();
  Object.assign(form, { name: " Módulo ", size: ["12,5", "20", "3"], volts: ["3,3", "5"], mA: "20", license: "MIT" });
  const spec = formToSpec(form, ["usr-modulo"]);
  assert.equal(spec.id, "usr-modulo-2", "an id that is taken gets a number");
  assert.deepEqual(spec.size, [12.5, 20, 3]);
  assert.deepEqual(spec.volts, [3.3, 5]);
  assert.equal(spec.name, "Módulo");
  const back = specToForm(spec);
  assert.deepEqual(back.size, ["12.5", "20", "3"]);
  assert.equal(formToSpec(back, ["usr-modulo"]).id, spec.id);
});

test("a board form never carries a part category, and roles follow the kind", () => {
  const form = { ...emptyForm(), kind: "board" as const, category: "sensors" as const };
  assert.equal(formToSpec(form).category, "boards");
  assert.equal(convertRole("power", "board"), "board-5v");
  assert.equal(convertRole("signal-in", "board"), "board-digital");
  assert.equal(convertRole("board-gnd", "part"), "ground");
  assert.equal(convertRole("board-digital", "part"), "signal-in");
  assert.equal(convertRole("board-pwm", "board"), "board-pwm");
});

test("fresh pin ids do not repeat", () => {
  assert.equal(freshPinId([]), "PIN1");
  assert.equal(freshPinId([{ id: "PIN1", role: "ground" }, { id: "PIN2", role: "ground" }]), "PIN3");
});
