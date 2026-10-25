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
import { meshEnclosure, type PieceMesh } from "@/models/lab/enclosureMesh";
import { exampleDesign } from "@/models/lab/examples";
import { canRedo, canUndo, commit, createHistory, redo as redoHistory, undo as undoHistory, type History } from "@/models/lab/history";
import { compatiblePins } from "@/models/lab/guide";
import { healthOf } from "@/models/lab/health";
import { layersOf } from "@/models/lab/printLayers";
import { simulate } from "@/models/lab/simulation";
import { sketchFor } from "@/models/lab/sketch";
import { downloadFile, loadDesign, readDesignFile, saveDesign } from "@/services/labStorage";
import { loadManifold } from "@/services/manifoldService";
import { labCopy } from "@/views/copy/lab";
import { pinsCopy } from "@/views/copy/pins";
import { printCopy } from "@/views/copy/print";
import { usePrintClock } from "./usePrintClock";
import { fitViews, guideViewOf, partHelpOf, pinInfoOf, suggestionViews } from "./labGuide";

// Types a view may need (a view never imports models directly)
export type { Check, Design, Issue, Level, PinRef, PlacedPart, Wire } from "@/models/lab/circuit";
export type { Notice, NoticeCode, NoticeKind } from "@/models/lab/bench";
export type { Component, Category } from "@/models/lab/catalog";
export type { BoardLegend, Fit, GuideView, PartHelp, PinFitView, PinHelp, PinInfo, StepView, SuggestionView } from "./labGuide";

export const SAVE_DELAY_MS = 400;
const MAX_FRAME_MS = 100; // a background tab must not make the simulation jump

const TIP_KEY = "qubbot-lab-wiring-tip"; // the first-time wiring tip has been seen

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

export type IssueLine = { level: Issue["level"]; key: Issue["key"]; code?: string; part: string | null; text: string };

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
        case "ledNoResistor": return text.ledNoResistor();
        case "i2cDuplicate": return text.i2cDuplicate(part);
        case "externalPower": return text.externalPower(part, i.usedMa ?? 0, i.budgetMa ?? 0);
        case "pinCurrent": return text.pinCurrent(part, pin, i.boardPin ?? "");
        case "strapping": return text.strapping(part, pin, i.boardPin ?? "");
        case "inputOnly": return text.inputOnly(part, pin, i.boardPin ?? "");
      }
    })();
    return { level: i.level, key: i.key, code: i.code, part: i.part ?? null, text: line };
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
    case "guideDone": return pinsCopy.guide.finished;
    case "guideNoSteps": return pinsCopy.guide.nothing;
  }
}

export type CatalogItem = Component & PartText;
export type CatalogGroup = { category: Component["category"]; title: string; items: CatalogItem[] };

const textOf = (c: Component): PartText => PART_TEXT[c.id] ?? { name: c.id, desc: "" };

export function useLabViewModel() {
  const [state, dispatch] = useReducer(benchReducer, undefined, () => initBench());
  const { design } = state;
  const [flushCount, setFlushCount] = useState(0);
  // The tip only shows while a wire is being made, which the server never renders: reading the browser here is safe
  const [tipSeen, setTipSeen] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(TIP_KEY) === "1";
    } catch {
      return false;
    }
  });

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

  // The undo history: every change of the design is one entry (a drag of one part, one). It only follows
  // the design: loading from storage, undo and redo move `present` themselves, so they are never recorded.
  // (created on first use: it reads the clock, which a prerender must not do)
  const historyRef = useRef<History<Design> | null>(null);
  const historyOf = useCallback(() => (historyRef.current ??= createHistory(designRef.current)), []);
  const coalesceRef = useRef<string | undefined>(undefined);
  const [undoable, setUndoable] = useState({ undo: false, redo: false });
  const syncHistory = useCallback(() => {
    const h = historyOf();
    setUndoable((u) => (u.undo === canUndo(h) && u.redo === canRedo(h) ? u : { undo: canUndo(h), redo: canRedo(h) }));
  }, [historyOf]);
  const record = useCallback(
    (next: Design, coalesceKey?: string) => {
      commit(historyOf(), next, { coalesceKey });
      syncHistory();
    },
    [historyOf, syncHistory],
  );
  useEffect(() => {
    if (!loadedRef.current) return;
    const key = coalesceRef.current;
    coalesceRef.current = undefined;
    record(design, key);
  }, [design, record]);

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
    historyRef.current = createHistory(parsed.design); // what was saved is where the history starts
    dispatch({ type: "load", design: parsed.design, dropped: parsed.dropped });
  }, []);

  // The wiring tip shows on the first wires of a bench until the person closes it (remembered in this browser)
  const wiringTip = state.wiring !== null && !tipSeen && design.wires.length < 2;

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

  // The print preview: the enclosure drawn layer by layer, on a clock the person can play, pause and restart
  const [printing, setPrinting] = useState(false);
  const { progress, playing, play: playClock, pause: pauseClock, reset: resetClock } = usePrintClock();

  // The enclosure is only built while it is shown (or being printed); deferred so dragging a part stays smooth
  const enclosureVisible = state.enclosure.visible;
  const settledDesign = useDeferredValue(design);
  const enclosureData = useMemo(() => {
    if (!enclosureVisible && !printing) return null;
    try {
      const data = enclosureFor(settledDesign);
      return data.ok ? data : null;
    } catch {
      return null;
    }
  }, [enclosureVisible, printing, settledDesign]);

  const printLayers = useMemo(() => (printing && enclosureData ? layersOf(enclosureData) : []), [printing, enclosureData]);
  const printView = useMemo(() => {
    const total = printLayers.length;
    const done = progress >= 1;
    const count = total === 0 ? 0 : Math.max(1, Math.ceil(progress * total));
    return {
      active: printing && total > 0,
      layers: printLayers,
      count, // layers printed so far, the one being drawn included
      total,
      playing,
      done,
      label: done ? printCopy.complete : printCopy.layerInfo(count, total),
      play: playClock,
      pause: pauseClock,
      restart: () => {
        resetClock();
        playClock();
      },
    };
  }, [printing, printLayers, progress, playing, playClock, pauseClock, resetClock]);

  const sections = useMemo<CatalogGroup[]>(
    () =>
      catalogSections(state.query, (c) => textOf(c).name).map((s) => ({
        category: s.category,
        title: labCopy.categories[s.category],
        items: s.items.map((c) => ({ ...c, ...textOf(c) })),
      })),
    [state.query],
  );

  // The wiring guide: pins that fit the wire in progress, the selected part's suggested wires, the help
  // card, the guide's current step and the words for the pin under the pointer
  const partName = useCallback((id: string) => partLabel(design, id), [design]);
  const { wiring, hover, guide, selected } = state;
  const fits = useMemo(() => (wiring ? fitViews(wiring, compatiblePins(design, wiring)) : []), [design, wiring]);
  const bestTarget = useMemo(() => {
    const best = fits.find((f) => f.fit === "best");
    return best ? { part: best.part, pin: best.pin } : null;
  }, [fits]);
  const suggestions = useMemo(() => suggestionViews(design, selected), [design, selected]);
  const help = useMemo(() => (selected ? partHelpOf(design, selected, partName) : null), [design, selected, partName]);
  const guideView = useMemo(() => guideViewOf(design, guide, partName), [design, guide, partName]);
  const pinInfo = useMemo(() => pinInfoOf(design, hover, wiring, fits, partName), [design, hover, wiring, fits, partName]);

  const issuesText = useMemo(() => issueLines(design, state.check.issues), [design, state.check.issues]);

  const notice = useMemo(
    () => (state.notice ? { ...state.notice, text: noticeText(design, state.notice) } : null),
    [state.notice, design],
  );

  // The pieces of the last STL that came out as closed meshes (null: none yet, or the plain STL was used)
  const [meshStats, setMeshStats] = useState<PieceMesh[] | null>(null);

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
    const loadNamed = (name: string) => {
      const example = exampleDesign(name);
      if (!example) return false;
      designRef.current = example;
      record(example);
      dispatch({ type: "load", design: example });
      return true;
    };
    const travel = (step: (h: History<Design>) => Design | undefined) => {
      const to = step(historyOf());
      syncHistory();
      if (!to) return;
      designRef.current = to;
      dispatch({ type: "load", design: to });
    };
    const enclosureOrNotice = () => {
      const data = enclosureFor(designRef.current);
      return data.ok ? data : makeNotice("warn", "enclosureNoBoard");
    };

    return {
      add: (part: string, at?: { x: number; z: number }) => dispatch({ type: "add", part, at }),
      move: (id: string, at: { x: number; z: number }) => {
        coalesceRef.current = `move:${id}`; // a drag is one undo step
        dispatch({ type: "move", id, x: at.x, z: at.z });
      },
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
      // The wiring guide: step by step for one part, or all its suggested wires at once
      startGuide: (part: string) => dispatch({ type: "startGuide", part }),
      nextGuide: () => dispatch({ type: "nextGuide" }),
      prevGuide: () => dispatch({ type: "prevGuide" }),
      goGuide: (step: number) => dispatch({ type: "goGuide", step }),
      endGuide: () => dispatch({ type: "endGuide" }),
      guideDo: () => dispatch({ type: "guideDo" }),
      acceptSuggestions: (part?: string | null) => dispatch({ type: "acceptSuggestions", part }),
      removeWire: (id: string) => dispatch({ type: "removeWire", id }),
      setQuery: (query: string) => dispatch({ type: "setQuery", query }),
      // Esc -> whether it did something (cancelled a wire, deselected or stopped the simulation)
      escape: () => {
        const s = stateRef.current;
        const did = !!(s.wiring || s.guide || s.selected || s.sim.running);
        dispatch({ type: "escape" });
        return did;
      },
      toggleSim: () => dispatch({ type: "toggleSim" }),
      toggleEnclosure: () => dispatch({ type: "toggleEnclosure" }),
      // «Ver cómo se imprime»: the static box is hidden and the print starts from the first layer
      startPrint: () => {
        if (!enclosureFor(designRef.current).ok) return tell(makeNotice("warn", "enclosureNoBoard"));
        resetClock();
        setPrinting(true);
        playClock();
      },
      stopPrint: () => {
        resetClock();
        setPrinting(false);
      },
      toggleExplode: () => dispatch({ type: "toggleExplode" }),
      clearNotice: () => dispatch({ type: "clearNotice" }),

      // Undo / redo put the design back as a load that is not recorded
      undo: () => travel(undoHistory),
      redo: () => travel(redoHistory),

      // One closed mesh per piece when the WASM is there; the plain STL when it is not
      exportStl: async () => {
        const wasm = await loadManifold();
        return deliver(FILES.stl, () => {
          const data = enclosureOrNotice();
          if ("code" in data) return data;
          if (wasm) {
            try {
              const mesh = meshEnclosure(data, wasm);
              setMeshStats(mesh.isManifold ? mesh.pieces : null);
              if (mesh.isManifold) return { data: mesh.stl, mime: "application/sla" };
            } catch {
              /* falls back to the plain STL */
            }
          }
          setMeshStats(null);
          return { data: toStl(data), mime: "application/sla" };
        });
      },
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
      loadExample: () => loadNamed("parkingSensor"),
      // The same, for any of the examples by name -> whether there is one with that name
      loadExampleNamed: (name: string) => loadNamed(name),

      // Replaces the bench with a circuit.json the person picked -> whether it was loaded
      importDesign: async (file: File) => {
        const imported = await readDesignFile(file);
        if (!imported) {
          tell(makeNotice("error", "importFailed"));
          return false;
        }
        designRef.current = imported.design;
        record(imported.design);
        dispatch({ type: "load", design: imported.design, dropped: imported.dropped });
        return true;
      },

      // The chat agent's tools run on the latest design; the result goes back to the model
      applyAgentTool: (name: string, input: Parameters<typeof applyAgentTool>[2]) => {
        const before = designRef.current;
        const out = applyAgentTool(before, name, input);
        if (out.design !== before) {
          designRef.current = out.design;
          record(out.design); // one entry per tool call, even when several run before React renders
          dispatch({ type: "load", design: out.design });
        }
        return out; // the whole outcome: the chat takes the new design without waiting for a render
      },
    };
  }, [record, syncHistory, historyOf, resetClock, playClock]);

  const meshView = useMemo(() => {
    if (!meshStats?.length) return null;
    const genus = meshStats.reduce((sum, p) => sum + p.genus, 0);
    const { w, d, h } = meshStats[0].size;
    return { pieces: meshStats, genus, text: labCopy.enclosure.mesh.closed(w, d, h), check: labCopy.enclosure.mesh.closedCheck };
  }, [meshStats]);

  return {
    // data
    design,
    check: state.check,
    selected: state.selected,
    wiring: state.wiring,
    hover: state.hover,
    guide: guideView,
    fits,
    bestTarget,
    suggestions,
    help,
    pinInfo,
    wiringTip,
    dismissWiringTip: () => {
      setTipSeen(true);
      try {
        window.localStorage.setItem(TIP_KEY, "1");
      } catch {
        /* the tip just shows again next time */
      }
    },
    query: state.query,
    sections,
    notice,
    sim: state.sim,
    simState,
    enclosure: {
      visible: state.enclosure.visible,
      exploded: state.enclosure.exploded,
      data: enclosureData,
      mesh: meshView,
    },
    print: printView,
    issuesText,
    canUndo: undoable.undo,
    canRedo: undoable.redo,
    // The circuit's health for the HUD: score, problems, parts, wires and each board's power
    health: (() => {
      const h = healthOf(state.check, design);
      return { ...h, budget: h.budget.map((b) => ({ ...b, board: partLabel(design, b.board) })) }; // the board's name, not its id
    })(),
    partLabel: useCallback((id: string) => partLabel(design, id), [design]),
    ...commands,
  };
}

export type LabViewModel = ReturnType<typeof useLabViewModel>;
