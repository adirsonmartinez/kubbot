import test from "node:test";
import assert from "node:assert/strict";
import {
  callErrorCode,
  callReducer,
  cleanForSpeech,
  createBargeInDetector,
  initialCall,
  normalizeLang,
  pickVoice,
  rankVoices,
  splitSentences,
  voiceScore,
  type CallModel,
  type VoiceInfo,
} from "../src/services/voice/speechText.ts";

const v = (name: string, lang: string, extra: Partial<VoiceInfo> = {}): VoiceInfo => ({ name, lang, ...extra });

test("normalizeLang: Android underscores and odd casing", () => {
  assert.equal(normalizeLang("es_VE"), "es-VE");
  assert.equal(normalizeLang("es-ve"), "es-VE");
  assert.equal(normalizeLang("ES"), "es");
  assert.equal(normalizeLang(""), "");
});

test("rankVoices: only Spanish, in the order es-VE, es-US, es-MX, es-ES, then other Spanish", () => {
  const ranked = rankVoices([
    v("Samantha", "en-US"),
    v("Monica", "es-ES"),
    v("Argentina", "es-AR"),
    v("Paulina", "es-MX"),
    v("Alice", "it-IT"),
    v("Karen", "es-US"),
    v("Maria", "es_VE"),
  ]);
  assert.deepEqual(
    ranked.map((x) => x.name),
    ["Maria", "Karen", "Paulina", "Monica", "Argentina"],
  );
});

test("rankVoices: inside one language a natural or online voice wins, and the language still beats quality", () => {
  const plain = v("Monica", "es-ES");
  const natural = v("Microsoft Elvira Online (Natural)", "es-ES");
  assert.equal(pickVoice([plain, natural]), natural);
  const venezuelan = v("Plain", "es-VE");
  assert.equal(pickVoice([natural, venezuelan]), venezuelan);
  assert.ok(voiceScore(natural) > voiceScore(plain));
});

test("pickVoice: null when the browser has no Spanish voice", () => {
  assert.equal(pickVoice([v("Samantha", "en-US")]), null);
  assert.equal(pickVoice([]), null);
});

test("cleanForSpeech: no markdown, code, links or emoji", () => {
  const text = "## Listo\n- Puse el **sensor** y un `LED` 🎉\n```ts\nconst a = 1\n```\nMira [la guía](https://x.dev/a) o https://x.dev";
  const out = cleanForSpeech(text);
  assert.ok(!/[#*`]|http|const|🎉/.test(out), out);
  assert.match(out, /Listo/);
  assert.match(out, /Puse el sensor y un LED/);
  assert.match(out, /la guía/);
});

test("splitSentences: cuts at . ! ? and keeps the opening ¡ ¿ with its sentence", () => {
  const chunks = splitSentences("¡Epa, pana! ¿Quieres que arme una alarma con el sensor de distancia? Dime y lo hago ahora mismo.", 60, 10);
  assert.deepEqual(chunks, ["¡Epa, pana!", "¿Quieres que arme una alarma con el sensor de distancia?", "Dime y lo hago ahora mismo."]);
});

test("splitSentences: a decimal point is not the end of a sentence", () => {
  const chunks = splitSentences("El sensor trabaja con 3.3 V y no con 5 V. Cuidado con eso.", 200, 5);
  assert.deepEqual(chunks, ["El sensor trabaja con 3.3 V y no con 5 V.", "Cuidado con eso."]);
});

test("splitSentences: short sentences join the next so the voice does not stutter", () => {
  assert.deepEqual(splitSentences("¡Listo! Ya quedó armado el circuito completo del semáforo."), ["¡Listo! Ya quedó armado el circuito completo del semáforo."]);
});

test("splitSentences: a long sentence breaks at commas, then spaces; no chunk exceeds the limit", () => {
  const long = "Primero conecto la placa con el cable de energía, luego pongo el sensor de distancia en la mesa, después tiro los cables de señal y por último reviso todo el cableado con el verificador del laboratorio";
  const chunks = splitSentences(long, 60, 10);
  assert.ok(chunks.length >= 4);
  for (const c of chunks) assert.ok(c.length <= 60, `${c.length}: ${c}`);
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), long);
});

test("splitSentences: empty or markdown-only text gives nothing; a giant word is hard cut", () => {
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences("```code```"), []);
  const chunks = splitSentences("a".repeat(100), 40, 5);
  assert.deepEqual(chunks.map((c) => c.length), [40, 40, 20]);
});

test("callErrorCode: speech recognition codes and errors become the codes the view translates", () => {
  assert.equal(callErrorCode("not-allowed"), "micDenied");
  assert.equal(callErrorCode("service-not-allowed"), "micDenied");
  assert.equal(callErrorCode("audio-capture"), "micDenied");
  assert.equal(callErrorCode("network"), "network");
  assert.equal(callErrorCode("language-not-supported"), "noSpeech");
  assert.equal(callErrorCode("no-speech"), null);
  assert.equal(callErrorCode("aborted"), null);
  assert.equal(callErrorCode(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })), "micDenied");
  assert.equal(callErrorCode(new Error("WebSocket connection failed")), "network");
  assert.equal(callErrorCode(new Error("boom")), "failed");
});

const on = (s: CallModel = initialCall): CallModel => callReducer(callReducer(s, { type: "connecting" }), { type: "connected", mode: "browser" });

test("callReducer: off -> connecting -> on (listening, in its mode)", () => {
  const connecting = callReducer(initialCall, { type: "connecting" });
  assert.equal(connecting.status, "connecting");
  assert.equal(connecting.mode, null);
  const live = callReducer(connecting, { type: "connected", mode: "elevenlabs" });
  assert.deepEqual(live, { status: "on", mode: "elevenlabs", muted: false, error: null, activity: "listening", caption: "" });
});

test("callReducer: a late 'connected' after hanging up does not bring the call back", () => {
  const hung = callReducer(callReducer(initialCall, { type: "connecting" }), { type: "end" });
  assert.equal(callReducer(hung, { type: "connected", mode: "browser" }), hung);
  assert.equal(hung.status, "off");
});

test("callReducer: activity and caption only count while the call is on; thinking or speaking clears the caption", () => {
  assert.equal(callReducer(initialCall, { type: "activity", activity: "speaking" }), initialCall);
  assert.equal(callReducer(initialCall, { type: "caption", text: "hola" }), initialCall);
  let s = on();
  s = callReducer(s, { type: "caption", text: "pon un sensor" });
  assert.equal(s.caption, "pon un sensor");
  s = callReducer(s, { type: "activity", activity: "thinking" });
  assert.equal(s.activity, "thinking");
  assert.equal(s.caption, "");
  s = callReducer(s, { type: "activity", activity: "speaking" });
  s = callReducer(s, { type: "activity", activity: "listening" });
  assert.equal(s.activity, "listening");
});

test("callReducer: mute toggles, or sets, and clears the caption", () => {
  let s = callReducer(on(), { type: "caption", text: "algo" });
  s = callReducer(s, { type: "mute" });
  assert.equal(s.muted, true);
  assert.equal(s.caption, "");
  s = callReducer(s, { type: "mute", muted: true });
  assert.equal(s.muted, true);
  s = callReducer(s, { type: "mute" });
  assert.equal(s.muted, false);
  assert.equal(callReducer(initialCall, { type: "mute" }), initialCall);
});

test("callReducer: an error turns the call off with its code; calling again starts clean; end resets", () => {
  const failed = callReducer(on(), { type: "error", code: "micDenied" });
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "micDenied");
  assert.equal(failed.activity, "idle");
  const again = callReducer(failed, { type: "connecting" });
  assert.equal(again.status, "connecting");
  assert.equal(again.error, null);
  assert.deepEqual(callReducer(on(), { type: "end" }), initialCall);
  // connecting twice does not restart a call that is already on
  const live = on();
  assert.equal(callReducer(live, { type: "connecting" }), live);
});

test("barge-in: a loud, steady voice after the grace period triggers; a blip does not", () => {
  const d = createBargeInDetector({ threshold: 0.06, holdMs: 300, graceMs: 500 });
  d.reset(0);
  let fired = false;
  for (let t = 0; t < 1500; t += 50) {
    // quiet leak of Qubi's own voice, then the person talks from 800 ms on
    const level = t >= 800 ? 0.2 : 0.01;
    if (d.push(level, t)) {
      fired = true;
      assert.ok(t >= 1100, `fired at ${t}`);
      break;
    }
  }
  assert.ok(fired);

  const blip = createBargeInDetector({ threshold: 0.06, holdMs: 300, graceMs: 500 });
  blip.reset(0);
  const hits = [];
  for (let t = 0; t < 1500; t += 50) hits.push(blip.push(t === 900 ? 0.5 : 0.01, t));
  assert.ok(hits.every((h) => !h));
});

test("barge-in: loud speaker leak during the grace period raises the bar, so Qubi's own voice does not cut him off", () => {
  const d = createBargeInDetector({ threshold: 0.06, holdMs: 300, graceMs: 500, leakFactor: 2.5 });
  d.reset(0);
  const results: boolean[] = [];
  for (let t = 0; t < 2000; t += 50) results.push(d.push(0.1, t)); // constant 0.1 leak: trigger is 0.25
  assert.ok(results.every((r) => !r));
  assert.equal(d.push(0.4, 2000), false);
  assert.equal(d.push(0.4, 2350), true);
});
