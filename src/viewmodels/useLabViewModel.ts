"use client";

// ViewModel of the Arduino lab: owns the bench state (the pure reducer in models/lab/bench), saves it
// to the browser, drives the simulation clock, builds the printable enclosure and the sketch on demand,
// and runs the chat agent's tools. Views only read what it returns and call its commands.

import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { benchReducer, initBench, notice as makeNotice, type Notice } from "@/models/lab/bench";
import { catalogSections, type Component } from "@/models/lab/catalog";
import { emptyDesign, parseDesign, serializeDesign, type Design, type Issue } from "@/models/lab/circuit";
import { applyAgentTool } from "@/models/lab/agentTools";
import { enclosureFor, toScad, toStl } from "@/models/lab/enclosure";
import { parkingSensor } from "@/models/lab/examples";
import { simulate } from "@/models/lab/simulation";
import { sketchFor } from "@/models/lab/sketch";
import { downloadFile, loadDesign, readDesignFile, saveDesign } from "@/services/labStorage";
import { labCopy } from "@/views/copy/lab";

// Types a view may need (a view never imports models directly)
export type { Check, Design, Issue, Level, PinRef, PlacedPart, Wire } from "@/models/lab/circuit";
export type { Notice, NoticeCode, NoticeKind } from "@/models/lab/bench";
export type { Component, Category } from "@/models/lab/catalog";

export const SAVE_DELAY_MS = 400;
const MAX_FRAME_MS = 100; // a background tab must not make the simulation jump

const FILES = { stl: "qubbot-caja.stl", scad: "qubbot-caja.scad", ino: "qubbot.ino" } as const;

type PartText = { name: string; desc: string };
const PART_TEXT = labCopy.parts as Record<string, PartText>;

// A part's visible name: "Sensor de distancia 2" from its id "hc-sr04-2"
export function partLabel(design: Design, id: string): string {
  const type = design.parts.find((p) => p.id === id)?.type;
  const n = /-(\d+)$/.exec(id)?.[1];
  if (!type) return id;
  const name = PART_TEXT[type]?.name ?? type;
  return n ? labCopy.panel.partLabel(name, Number(n)) : name;
}

export type IssueLine = { level: Issue["level"]; key: Issue["key"]; part: string | null; text: string };

// The checker's findings in plain Spanish, with parts named like the person sees them
export function issueLines(design: Design, issues: Issue[]): IssueLine[] {
  const text = labCopy.check.issues;
  return issues.map((i) => {
    const part = i.part ? partLabel(design, i.part) : "";
    const pin = i.pin ?? "";
    const line = (() => {
      switch (i.key) {
        case "short": return text.short();
        case "mixedPower": return text.mixedPower();
        case "overvoltage": return text.overvoltage(part);
        case "undervoltage": return text.undervoltage(part);
        case "missing": return text.missing(part, pin);
        case "wrongPin": return text.wrongPin(part, pin);
        case "pinShared": return text.pinShared(part, pin, i.boardPin ?? "");
        case "level": return text.level(part, pin);
        case "budget": return text.budget(part, i.usedMa ?? 0, i.budgetMa ?? 0);
        case "noBoard": return text.noBoard();
      }
    })();
    return { level: i.level, key: i.key, part: i.part ?? null, text: line };
  });
}

// A notice code in plain Spanish
export function noticeText(design: Design, n: Notice): string {
  const { bench } = labCopy;
  switch (n.code) {
    case "wiring": return bench.wiring(partLabel(design, String(n.args.part)), String(n.args.pin));
    case "connectRefused": {
      const refused = bench.connectRefused as Record<string, string>;
      return refused[String(n.args.reason)] ?? bench.connectRefused.unknown;
    }
    case "noBoardForWire": return bench.noBoardForWire;
    case "autoWired": return bench.autoWired(Number(n.args.added));
    case "autoWireMissing": {
      const missing = Array.isArray(n.args.missing) ? n.args.missing : [];
      return bench.autoWireMissing(missing.map((m) => `${partLabel(design, m.part)} ${m.pin}`));
    }
    case "simBlocked": return labCopy.sim.blocked;
    case "enclosureNoBoard": return labCopy.enclosure.noBoard;
    case "loadFailed": return bench.loadFailed;
    case "saveFailed": return bench.saveFailed;
    case "exportSaved": return labCopy.labViewModel.downloaded(String(n.args.file));
    case "exportFailed": return labCopy.viewModel.exportFailed;
    case "notReady": return labCopy.viewModel.notReady;
    case "sketchNoBoard": return labCopy.sketch.noBoard;
    case "importFailed": return labCopy.labViewModel.importFailed;
  }
}

export type CatalogItem = Component & PartText;
export type CatalogGroup = { category: Component["category"]; title: string; items: CatalogItem[] };

const textOf = (c: Component): PartText => PART_TEXT[c.id] ?? { name: c.id, desc: "" };

export function useLabViewModel() {
  const [state, dispatch] = useReducer(benchReducer, undefined, () => initBench());
  const { design } = state;
  const [flushCount, setFlushCount] = useState(0);

  // What is saved, what is waiting to be saved, and the latest design (tools can run several times in
  // one tick, before React renders again)
  const loadedRef = useRef(false);
  const savedRef = useRef<Design | null>(null);
  const pendingRef = useRef<Design | null>(null);
  const flushedRef = useRef(0);
  const designRef = useRef(design);
  const stateRef = useRef(state);
  useEffect(() => {
    designRef.current = design;
    stateRef.current = state;
  });

  // Saving: a pause after the last change, or at once when a drag ends. Declared before the load effect
  // so the empty first design is never written over what was saved.
  useEffect(() => {
    const immediate = flushCount !== flushedRef.current;
    flushedRef.current = flushCount;
    if (!loadedRef.current || design === savedRef.current) return;
    const write = () => {
      pendingRef.current = null;
      savedRef.current = design;
      if (!saveDesign(serializeDesign(design))) dispatch({ type: "notify", notice: makeNotice("error", "saveFailed") });
    };
    if (immediate) {
      write();
      return;
    }
    pendingRef.current = design;
    const timer = setTimeout(write, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [design, flushCount]);

  // A pending save is not lost when the page closes or the lab unmounts
  useEffect(() => {
    const flush = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      savedRef.current = pending;
      saveDesign(serializeDesign(pending));
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // Load what was saved, on the client only (the server renders an empty bench)
  useEffect(() => {
    const text = loadDesign();
    const parsed = text === null ? { design: emptyDesign(), dropped: 0 } : parseDesign(text);
    savedRef.current = parsed.design;
    loadedRef.current = true;
    dispatch({ type: "load", design: parsed.design, dropped: parsed.dropped });
  }, []);

  // The simulation clock: one tick per frame while it runs
  const running = state.sim.running;
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      dispatch({ type: "tick", dt: Math.min(now - last, MAX_FRAME_MS) });
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const simT = state.sim.t;
  const simState = useMemo(() => {
    if (!running) return null;
    try {
      return simulate(design, simT);
    } catch {
      return null;
    }
  }, [running, design, simT]);

  // The enclosure is only built while it is shown; deferred so dragging a part stays smooth
  const enclosureVisible = state.enclosure.visible;
  const settledDesign = useDeferredValue(design);
  const enclosureData = useMemo(() => {
    if (!enclosureVisible) return null;
    try {
      const data = enclosureFor(settledDesign);
      return data.ok ? data : null;
    } catch {
      return null;
    }
  }, [enclosureVisible, settledDesign]);

  const sections = useMemo<CatalogGroup[]>(
    () =>
      catalogSections(state.query, (c) => textOf(c).name).map((s) => ({
        category: s.category,
        title: labCopy.categories[s.category],
        items: s.items.map((c) => ({ ...c, ...textOf(c) })),
      })),
    [state.query],
  );

  const issuesText = useMemo(() => issueLines(design, state.check.issues), [design, state.check.issues]);

  const notice = useMemo(
    () => (state.notice ? { ...state.notice, text: noticeText(design, state.notice) } : null),
    [state.notice, design],
  );

  const commands = useMemo(() => {
    const tell = (n: Notice) => dispatch({ type: "notify", notice: n });
    // Gives the person a file; tells them when it could not be made
    const deliver = (file: string, make: () => { data: string | ArrayBuffer; mime: string } | Notice) => {
      let made: ReturnType<typeof make>;
      try {
        made = make();
      } catch {
        tell(makeNotice("error", "exportFailed"));
        return false;
      }
      if ("code" in made) {
        tell(made);
        return false;
      }
      if (!downloadFile(file, made.data, made.mime)) {
        tell(makeNotice("error", "exportFailed"));
        return false;
      }
      tell(makeNotice("ok", "exportSaved", { file }));
      return true;
    };
    const enclosureOrNotice = () => {
      const data = enclosureFor(designRef.current);
      return data.ok ? data : makeNotice("warn", "enclosureNoBoard");
    };

    return {
      add: (part: string, at?: { x: number; z: number }) => dispatch({ type: "add", part, at }),
      move: (id: string, at: { x: number; z: number }) => dispatch({ type: "move", id, x: at.x, z: at.z }),
      // A drag ended: save now instead of waiting
      moveEnd: () => {
        dispatch({ type: "moveEnd" });
        setFlushCount((n) => n + 1);
      },
      rotate: (id?: string) => dispatch({ type: "rotate", id }),
      remove: (id?: string) => dispatch({ type: "remove", id }),
      select: (id: string | null) => dispatch({ type: "select", id }),
      pickPin: (part: string, pin: string) => dispatch({ type: "pickPin", part, pin }),
      hoverPin: (part?: string | null, pin?: string | null) => dispatch({ type: "hoverPin", part, pin }),
      cancelWire: () => dispatch({ type: "cancelWire" }),
      autoWire: (id?: string | null) => dispatch({ type: "autoWire", id }),
      removeWire: (id: string) => dispatch({ type: "removeWire", id }),
      setQuery: (query: string) => dispatch({ type: "setQuery", query }),
      // Esc -> whether it did something (cancelled a wire, deselected or stopped the simulation)
      escape: () => {
        const s = stateRef.current;
        const did = !!(s.wiring || s.selected || s.sim.running);
        dispatch({ type: "escape" });
        return did;
      },
      toggleSim: () => dispatch({ type: "toggleSim" }),
      toggleEnclosure: () => dispatch({ type: "toggleEnclosure" }),
      toggleExplode: () => dispatch({ type: "toggleExplode" }),
      clearNotice: () => dispatch({ type: "clearNotice" }),

      exportStl: () =>
        deliver(FILES.stl, () => {
          const data = enclosureOrNotice();
          return "code" in data ? data : { data: toStl(data), mime: "application/sla" };
        }),
      exportScad: () =>
        deliver(FILES.scad, () => {
          const data = enclosureOrNotice();
          return "code" in data ? data : { data: toScad(data), mime: "text/plain" };
        }),
      exportSketch: () =>
        deliver(FILES.ino, () => {
          const sketch = sketchFor(designRef.current);
          if (!sketch.ok) return makeNotice("warn", sketch.reason === "noBoard" ? "sketchNoBoard" : "notReady");
          return { data: sketch.code, mime: "text/plain" };
        }),

      // Puts a ready-made, wired circuit on the bench (the empty bench's "Probar con un ejemplo")
      loadExample: () => {
        const example = parkingSensor();
        designRef.current = example;
        dispatch({ type: "load", design: example });
      },

      // Replaces the bench with a circuit.json the person picked -> whether it was loaded
      importDesign: async (file: File) => {
        const imported = await readDesignFile(file);
        if (!imported) {
          tell(makeNotice("error", "importFailed"));
          return false;
        }
        designRef.current = imported.design;
        dispatch({ type: "load", design: imported.design, dropped: imported.dropped });
        return true;
      },

      // The chat agent's tools run on the latest design; the result goes back to the model
      applyAgentTool: (name: string, input: Parameters<typeof applyAgentTool>[2]) => {
        const before = designRef.current;
        const out = applyAgentTool(before, name, input);
        if (out.design !== before) {
          designRef.current = out.design;
          dispatch({ type: "load", design: out.design });
        }
        return out; // the whole outcome: the chat takes the new design without waiting for a render
      },
    };
  }, []);

  return {
    // data
    design,
    check: state.check,
    selected: state.selected,
    wiring: state.wiring,
    hover: state.hover,
    query: state.query,
    sections,
    notice,
    sim: state.sim,
    simState,
    enclosure: { visible: state.enclosure.visible, exploded: state.enclosure.exploded, data: enclosureData },
    issuesText,
    partLabel: useCallback((id: string) => partLabel(design, id), [design]),
    ...commands,
  };
}

export type LabViewModel = ReturnType<typeof useLabViewModel>;
