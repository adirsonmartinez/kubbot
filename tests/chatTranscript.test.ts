import assert from "node:assert/strict";
import { test } from "node:test";
import { transcript, type TranscriptEntry } from "../src/models/chat.ts";

const labels = { title: "Conversación con Qubi", you: "Tú", qubi: "Qubi", task: "Tarea", voice: "por llamada" };

test("the transcript lists who said what, the cards and the tasks, and skips run cards", () => {
  const entries: TranscriptEntry[] = [
    { role: "sys", text: "Nueva conversación" },
    { role: "user", text: "Pon un sensor", voice: true },
    { role: "bot", text: "", run: { status: "done" } },
    { role: "sys", text: "Puse el sensor", card: true },
    { role: "bot", text: "Listo, pana." },
    { role: "sys", text: "", task: { goal: "Estación del clima", steps: [{ text: "Poner la placa", state: "done" }, { text: "Cablear", state: "pending" }] } },
  ];
  const text = transcript(entries, { ...labels, date: "25 de octubre" });
  assert.match(text, /^# Conversación con Qubi\n\n_25 de octubre_/);
  assert.match(text, /\*\*Tú \(por llamada\):\*\* Pon un sensor/);
  assert.match(text, /- Puse el sensor/);
  assert.match(text, /\*\*Qubi:\*\* Listo, pana\./);
  assert.match(text, /- \[x\] Poner la placa\n- \[ \] Cablear/);
  assert.equal(text.includes("status"), false);
  assert.equal(text.endsWith("\n"), true);
});
