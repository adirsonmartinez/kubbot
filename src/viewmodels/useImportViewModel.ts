"use client";

// ViewModel of "Nuevo componente": the dialog that imports a part from a photo or a datasheet, and the
// person's own catalog ("Mi catálogo"). It owns the form, asks Qubi to read the file (the route holds the
// key), runs the deterministic validator on every edit, keeps the live 3D preview registered, saves to the
// browser and exposes the saved parts as catalog cards. Views read what it returns and call its commands.
//
// Saved parts are registered into the catalog (and their names into the lab's copy) when this module loads in
// the browser, before any bench is read, so a saved design with an imported part loads whole.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Category, Component } from "@/models/lab/catalog";
import { registerUserComponents, type UserEntry } from "@/models/lab/catalog";
import { isPersonalOnly, specToComponent, userEntryFor, validateSpec, type ComponentSpec, type SpecIssue } from "@/models/lab/componentSpec";
import { downloadFile } from "@/services/labStorage";
import {
  LIMITS, extractComponent, loadUserItems, photoFor, removeUserItem, saveUserItem, specFileName, specFromJson, specToJson,
  type ExtractError, type UserItem,
} from "@/services/userCatalog";
import { importCopy } from "@/views/copy/import";
import { labCopy } from "@/views/copy/lab";
import { categoriesFor, convertRole, emptyForm, formToSpec, freshPinId, rolesFor, specToForm, type Form } from "./importForm";

export type { Form } from "./importForm";
export type { ComponentSpec, SpecPin } from "@/models/lab/componentSpec";

export const PREVIEW_ID = "usr-vista-previa";
const PART_TEXT = labCopy.parts as Record<string, { name: string; desc: string }>;
const MESSAGE_MS = 6000;

export type MineItem = Component & { name: string; desc: string; personal: boolean; photo: string | null };
export type Step = "pick" | "reading" | "review";
export type IssueView = { id: string; level: SpecIssue["level"]; field: string; text: string };

// --- The registry the rest of the lab reads: saved parts, plus the draft while the dialog is open ---
function publish(items: readonly UserItem[], preview: { spec: ComponentSpec; photo: string | null } | null): void {
  const entries: UserEntry[] = items.map((i) => userEntryFor(i.spec, i.photo ?? undefined));
  if (preview) entries.push({ ...userEntryFor({ ...preview.spec, id: PREVIEW_ID }, preview.photo ?? undefined), hidden: true });
  registerUserComponents(entries);
  for (const key of Object.keys(PART_TEXT)) if (key.startsWith("usr-")) delete PART_TEXT[key];
  for (const i of items) PART_TEXT[i.spec.id] = { name: i.spec.name, desc: i.spec.desc };
  PART_TEXT[PREVIEW_ID] = { name: preview?.spec.name || importCopy.title, desc: "" };
}

// The saved parts, read once in the browser and shared by every user of this view model. The server and the
// first client render see none (useSyncExternalStore's server snapshot), so hydration matches.
const NONE: UserItem[] = [];
let stored: UserItem[] = typeof window !== "undefined" ? loadUserItems() : NONE;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") publish(stored, null);
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const reload = () => {
  stored = loadUserItems();
  listeners.forEach((fn) => fn());
};

const issueView = (issue: SpecIssue, index: number): IssueView => ({
  id: `${issue.key}:${issue.field}:${index}`,
  level: issue.level,
  field: issue.field,
  text: importCopy.check.issues[issue.key],
});

export function useImportViewModel() {
  const items = useSyncExternalStore(subscribe, () => stored, () => NONE);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [form, setForm] = useState<Form>(emptyForm);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoRev, setPhotoRev] = useState(0);
  const [hint, setHint] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<ExtractError | "badFile" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const token = useRef(0); // a reading that is no longer wanted ends up ignored

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const taken = useMemo(() => items.map((i) => i.spec.id), [items]);
  const spec = useMemo(() => formToSpec(form, taken), [form, taken]);
  const check = useMemo(() => validateSpec(spec), [spec]);
  const issues = useMemo(() => check.issues.map(issueView), [check]);

  // The preview needs sensible sizes and pins; the rest can still be wrong
  const previewable = open && step === "review" && !check.issues.some((i) => ["size", "noPins", "tooManyPins"].includes(i.key));
  const previewKey = useMemo(() => {
    if (!previewable) return null;
    const geometry = [spec.kind, spec.category, spec.size, spec.color, spec.pins.map((p) => [p.id, p.role, p.accepts, p.kinds])];
    return `${JSON.stringify(geometry)}|${photoRev}`;
  }, [previewable, spec, photoRev]);
  // Registered while rendering on purpose: the preview's own effect runs before any effect here and needs the
  // draft known already. It is idempotent (same input, same registry).
  useMemo(() => {
    publish(items, previewKey ? { spec, photo } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, previewKey]);

  const mine = useMemo<MineItem[]>(
    () => items.map((i) => ({ ...specToComponent(i.spec), name: i.spec.name, desc: i.spec.desc, personal: validateSpec(i.spec).issues.some((x) => x.key === "licenseMissing" || x.key === "licensePersonal"), photo: i.photo })),
    [items],
  );

  const reset = useCallback(() => {
    token.current++;
    setStep("pick");
    setForm(emptyForm());
    setPhoto(null);
    setPhotoRev((n) => n + 1);
    setNotes("");
    setError(null);
    setFileName("");
  }, []);

  const openDialog = useCallback(() => {
    reset();
    setHint("");
    setMessage(null);
    setOpen(true);
  }, [reset]);
  const close = useCallback(() => {
    token.current++;
    setOpen(false);
  }, []);

  const startManual = useCallback(() => {
    token.current++;
    setForm((f) => (step === "review" ? f : emptyForm()));
    setNotes("");
    setError(null);
    setStep("review");
  }, [step]);

  const pickFile = useCallback(
    async (file: File) => {
      const run = ++token.current;
      setError(null);
      setFileName(file.name);
      setStep("reading");
      const isImage = file.type.startsWith("image/");
      const [read, picture] = await Promise.all([
        extractComponent(file, hint, taken),
        isImage ? photoFor(file).catch(() => null) : Promise.resolve(null),
      ]);
      if (token.current !== run) return;
      setPhoto(picture?.dataUrl ?? null);
      setPhotoRev((n) => n + 1);
      if (!read.ok) {
        setError(read.error);
        setNotes(read.notes);
        setStep("pick");
        return;
      }
      const next = specToForm(read.spec);
      if (picture && next.color === null) next.color = picture.color;
      setForm(next);
      setNotes(read.notes);
      setStep("review");
    },
    [hint, taken],
  );

  const loadJsonFile = useCallback(
    async (file: File) => {
      const parsed = specFromJson(await file.text().catch(() => ""), taken);
      if (!parsed) {
        setError("badFile");
        return;
      }
      token.current++;
      setError(null);
      setForm(specToForm(parsed));
      setNotes(importCopy.loadedFile);
      setStep("review");
    },
    [taken],
  );

  // --- Editing the form ---
  const setField = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value })), []);
  const setSize = useCallback((i: 0 | 1 | 2, value: string) => setForm((f) => ({ ...f, sizeEstimated: false, size: f.size.map((v, k) => (k === i ? value : v)) as Form["size"] })), []);
  const setVolts = useCallback((i: 0 | 1, value: string) => setForm((f) => ({ ...f, volts: f.volts.map((v, k) => (k === i ? value : v)) as Form["volts"] })), []);
  const setKind = useCallback(
    (kind: Form["kind"]) =>
      setForm((f) => ({
        ...f,
        kind,
        category: kind === "board" ? "boards" : f.kind === "board" ? "sensors" : f.category,
        pins: f.pins.map((p) => ({ ...p, role: convertRole(p.role, kind), accepts: undefined, kinds: undefined })),
      })),
    [],
  );
  const setPin = useCallback(
    (index: number, patch: Partial<Pick<Form["pins"][number], "id" | "label" | "role" | "optional">>) =>
      setForm((f) => ({
        ...f,
        pins: f.pins.map((p, k) => {
          if (k !== index) return p;
          const next = { ...p, ...patch };
          // A new role replaces what a previous one set on the pin
          if (patch.role !== undefined) {
            delete next.accepts;
            delete next.kinds;
          }
          return next;
        }),
      })),
    [],
  );
  const addPin = useCallback(
    () => setForm((f) => (f.pins.length >= 64 ? f : { ...f, pins: [...f.pins, { id: freshPinId(f.pins), role: f.kind === "board" ? "board-digital" : "signal-in" }] })),
    [],
  );
  const removePin = useCallback((index: number) => setForm((f) => ({ ...f, pins: f.pins.filter((_, k) => k !== index) })), []);

  // --- Saving, removing, files ---
  const save = useCallback(() => {
    if (!check.ok) return;
    const result = saveUserItem({ spec, photo });
    if (result !== "ok") {
      setMessage(importCopy.saveErrors[result]);
      return;
    }
    reload();
    setMessage(importCopy.saved(spec.name));
    token.current++;
    setOpen(false);
  }, [check.ok, spec, photo]);

  const remove = useCallback(
    (id: string) => {
      const name = items.find((i) => i.spec.id === id)?.spec.name ?? id;
      if (!removeUserItem(id)) return;
      reload();
      setMessage(importCopy.mine.removed(name));
    },
    [items],
  );

  const deliver = useCallback((target: ComponentSpec) => {
    setMessage(downloadFile(specFileName(target), specToJson(target), "application/json") ? importCopy.exportDone : importCopy.exportFailed);
  }, []);
  const exportItem = useCallback((id: string) => {
    const found = items.find((i) => i.spec.id === id);
    if (found) deliver(found.spec);
  }, [items, deliver]);
  const exportDraft = useCallback(() => deliver(spec), [deliver, spec]);

  // --- What the view shows ---
  const roleOptions = useMemo(
    () => rolesFor(form.kind).map((value) => ({ value, label: (importCopy.roles as Record<string, string>)[value] ?? value })),
    [form.kind],
  );
  const categoryOptions = useMemo(
    () => categoriesFor(form.kind).map((value: Category) => ({ value, label: labCopy.categories[value] })),
    [form.kind],
  );
  const fieldIssue = useCallback((field: string): IssueView | null => issues.find((i) => i.field === field) ?? null, [issues]);
  const pinIssues = useMemo(() => form.pins.map((_, i) => issues.find((x) => x.field === `pins.${i}`)?.text ?? null), [form.pins, issues]);
  const redCount = issues.filter((i) => i.level === "red").length;
  const personalOnly = isPersonalOnly(form.license) || form.license.trim() === "";

  return {
    // state
    open, step, form, photo, hint, notes, fileName, message, mine,
    error: error ? (error === "badFile" ? importCopy.badFile : importCopy.errors[error]) : null,
    // checks
    issues, canSave: check.ok, redCount, fieldIssue, pinIssues, personalOnly,
    sizeEstimated: form.sizeEstimated,
    // preview
    previewType: previewKey ? PREVIEW_ID : null,
    previewKey,
    // options
    roleOptions, categoryOptions, maxUploadMb: LIMITS.uploadBytes / (1024 * 1024),
    // commands
    openDialog, close, pickFile, loadJsonFile, startManual, backToPick: reset, setHint,
    setField, setSize, setVolts, setKind, setPin, addPin, removePin,
    save, remove, exportItem, exportDraft,
  };
}

export type ImportViewModel = ReturnType<typeof useImportViewModel>;
