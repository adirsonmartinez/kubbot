"use client";

// "Nuevo componente": a glass dialog that turns a photo or a datasheet into a part. Three steps: pick the file
// (or fill the ficha by hand), Qubi reading it, and the ficha to review (editable form, the checks inline, a
// live 3D preview). Presentational: everything comes from the import view model.

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { ImportViewModel } from "@/viewmodels/useImportViewModel";
import { importCopy } from "@/views/copy/import";
import "@/views/styles/lab.css";
import { Icon } from "../Icon";

// WebGL only exists in the browser
const PartPreview = dynamic(() => import("@/views/scene/lab/PartPreview").then((m) => m.PartPreview), { ssr: false });

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Pick({ vm }: { vm: ImportViewModel }) {
  const files = useRef<HTMLInputElement>(null);
  const json = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hint = useId();
  const take = (list: FileList | null) => {
    const file = list?.[0];
    if (file) void vm.pickFile(file);
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };
  return (
    <div className="imp-pick">
      <div
        className="imp-drop"
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <span className="imp-drop-art" aria-hidden>
          <Icon name="cube" size={30} />
        </span>
        <strong>{importCopy.drop.title}</strong>
        <span className="imp-sub">{importCopy.drop.sub}</span>
        <button type="button" className="imp-btn primary" onClick={() => files.current?.click()}>
          <Icon name="folder" size={15} />
          {importCopy.drop.pick}
        </button>
        <span className="imp-fine">{importCopy.drop.formats}</span>
        <input ref={files} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      </div>

      <label className="imp-field" htmlFor={hint}>
        <span>{importCopy.drop.hint}</span>
        <input id={hint} type="text" value={vm.hint} maxLength={120} placeholder={importCopy.drop.hintPlaceholder} onChange={(e) => vm.setHint(e.target.value)} />
      </label>

      {vm.error && (
        <p className="imp-error" role="alert">
          <Icon name="alert" size={15} />
          {vm.error}
        </p>
      )}

      <div className="imp-row">
        <button type="button" className="imp-btn" onClick={vm.startManual}>
          {importCopy.manual}
        </button>
        <button type="button" className="imp-btn ghost" onClick={() => json.current?.click()}>
          {importCopy.drop.fromFile}
        </button>
        <input ref={json} type="file" hidden accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void vm.loadJsonFile(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function Reading({ vm }: { vm: ImportViewModel }) {
  return (
    <div className="imp-reading" role="status" aria-live="polite">
      <span className="imp-orb" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <strong>{importCopy.reading.title}</strong>
      <span className="imp-sub">{vm.fileName ? `${vm.fileName} · ` : ""}{importCopy.reading.sub}</span>
      <button type="button" className="imp-btn ghost" onClick={vm.backToPick}>
        {importCopy.reading.cancel}
      </button>
    </div>
  );
}

function Note({ text, level }: { text: string; level: "red" | "yellow" }) {
  return (
    <small className="imp-note" data-level={level}>
      {text}
    </small>
  );
}

function Review({ vm }: { vm: ImportViewModel }) {
  const { form } = vm;
  const field = (name: string) => vm.fieldIssue(name);
  const err = (name: string) => {
    const issue = field(name);
    return issue ? <Note text={issue.text} level={issue.level} /> : null;
  };
  const num = (value: string, set: (v: string) => void, label: string, issue?: boolean) => (
    <label className="imp-field small" data-bad={issue || undefined}>
      <span>{label}</span>
      <input type="text" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );
  const sizeBad = !!field("size");
  const voltsBad = !!field("volts");
  return (
    <div className="imp-review">
      <div className="imp-form">
        <p className="imp-lead">{vm.notes ? importCopy.review.notes : vm.fileName ? importCopy.review.lead : importCopy.review.leadManual}</p>
        {vm.notes && <p className="imp-qubi">{vm.notes}</p>}

        <div className="imp-kind" role="group" aria-label={importCopy.fields.category}>
          {(["part", "board"] as const).map((k) => (
            <button key={k} type="button" className="imp-seg" aria-pressed={form.kind === k} onClick={() => vm.setKind(k)}>
              {importCopy.kinds[k]}
            </button>
          ))}
        </div>

        <label className="imp-field" data-bad={!!field("name") || undefined}>
          <span>{importCopy.fields.name}</span>
          <input type="text" value={form.name} maxLength={60} onChange={(e) => vm.setField("name", e.target.value)} />
          {err("name")}
        </label>
        <label className="imp-field">
          <span>{importCopy.fields.desc}</span>
          <input type="text" value={form.desc} maxLength={200} onChange={(e) => vm.setField("desc", e.target.value)} />
        </label>
        {form.kind === "part" && (
          <label className="imp-field">
            <span>{importCopy.fields.category}</span>
            <select value={form.category} onChange={(e) => vm.setField("category", e.target.value as typeof form.category)}>
              {vm.categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="imp-group">
          <legend>{importCopy.fields.size}</legend>
          <div className="imp-trio">
            {num(form.size[0], (v) => vm.setSize(0, v), importCopy.fields.width, sizeBad)}
            {num(form.size[1], (v) => vm.setSize(1, v), importCopy.fields.depth, sizeBad)}
            {num(form.size[2], (v) => vm.setSize(2, v), importCopy.fields.height, sizeBad)}
          </div>
          {vm.sizeEstimated && <Note text={importCopy.review.estimated} level="yellow" />}
          {err("size")}
        </fieldset>

        {form.kind === "part" ? (
          <fieldset className="imp-group">
            <legend>{importCopy.fields.volts}</legend>
            <div className="imp-trio">
              {num(form.volts[0], (v) => vm.setVolts(0, v), importCopy.fields.voltsMin, voltsBad)}
              {num(form.volts[1], (v) => vm.setVolts(1, v), importCopy.fields.voltsMax, voltsBad)}
              {num(form.mA, (v) => vm.setField("mA", v), importCopy.fields.mA, !!field("mA"))}
            </div>
            {err("volts")}
            {err("mA")}
          </fieldset>
        ) : (
          <label className="imp-field">
            <span>{importCopy.fields.logic}</span>
            <select value={form.logic} onChange={(e) => vm.setField("logic", e.target.value as "3.3" | "5")}>
              <option value="3.3">{importCopy.logic["3.3"]}</option>
              <option value="5">{importCopy.logic["5"]}</option>
            </select>
          </label>
        )}

        <fieldset className="imp-group">
          <legend>{importCopy.fields.pins}</legend>
          <div className="imp-pins" role="table" aria-label={importCopy.fields.pins}>
            <div className="imp-pin head" role="row">
              <span role="columnheader">{importCopy.pinsTable.id}</span>
              <span role="columnheader">{importCopy.pinsTable.label}</span>
              <span role="columnheader">{importCopy.pinsTable.role}</span>
              <span role="columnheader" aria-hidden />
            </div>
            {form.pins.map((pin, i) => (
              <div key={i} className="imp-pin" role="row" data-bad={vm.pinIssues[i] ? "" : undefined}>
                <input aria-label={importCopy.pinsTable.id} type="text" value={pin.id} maxLength={12} onChange={(e) => vm.setPin(i, { id: e.target.value })} />
                <input aria-label={importCopy.pinsTable.label} type="text" value={pin.label ?? ""} maxLength={20} placeholder={pin.id} onChange={(e) => vm.setPin(i, { label: e.target.value })} />
                <select aria-label={importCopy.pinsTable.role} value={pin.role} onChange={(e) => vm.setPin(i, { role: e.target.value })}>
                  {!vm.roleOptions.some((o) => o.value === pin.role) && <option value={pin.role}>{pin.role || "—"}</option>}
                  {vm.roleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="imp-icon" aria-label={importCopy.pinsTable.remove(pin.id)} title={importCopy.pinsTable.remove(pin.id)} onClick={() => vm.removePin(i)}>
                  <Icon name="trash" size={14} />
                </button>
                {vm.pinIssues[i] && <Note text={vm.pinIssues[i]!} level="red" />}
              </div>
            ))}
          </div>
          <button type="button" className="imp-btn ghost small" onClick={vm.addPin}>
            <Icon name="plus" size={13} />
            {importCopy.pinsTable.add}
          </button>
          {err("pins")}
        </fieldset>

        <fieldset className="imp-group">
          <legend>{importCopy.fields.source}</legend>
          <div className="imp-duo">
            <label className="imp-field small">
              <span>{importCopy.fields.source}</span>
              <input type="text" value={form.sourceName} maxLength={80} placeholder={importCopy.fields.sourcePlaceholder} onChange={(e) => vm.setField("sourceName", e.target.value)} />
            </label>
            <label className="imp-field small">
              <span>{importCopy.fields.license}</span>
              <input type="text" value={form.license} maxLength={40} placeholder={importCopy.fields.licensePlaceholder} onChange={(e) => vm.setField("license", e.target.value)} />
            </label>
          </div>
          {err("source.license")}
        </fieldset>
      </div>

      <aside className="imp-side">
        <div className="imp-preview" aria-label={importCopy.previewAlt}>
          {vm.previewType && vm.previewKey ? <PartPreview type={vm.previewType} version={vm.previewKey} /> : <span className="imp-sub">{importCopy.preview}</span>}
        </div>
        <p className="imp-fine">
          {importCopy.preview}. {vm.photo ? importCopy.photoNote : importCopy.noPhoto}
        </p>

        <div className="imp-checks" role="status" aria-live="polite">
          <p className="imp-checks-head" data-ok={vm.canSave || undefined}>
            <Icon name={vm.canSave ? "check" : "alert"} size={15} />
            {vm.canSave ? importCopy.check.ok : importCopy.check.fix(vm.redCount)}
          </p>
          {vm.issues.length > 0 && (
            <ul>
              {vm.issues.map((issue) => (
                <li key={issue.id} data-level={issue.level}>
                  {issue.text}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="imp-fine">
          {importCopy.generic.sim} {importCopy.generic.sketch}
        </p>
      </aside>
    </div>
  );
}

export function ImportComponent({ vm }: { vm: ImportViewModel }) {
  const title = useId();
  const box = useRef<HTMLDivElement>(null);
  const open = vm.open;

  // Focus goes into the dialog and Tab stays in it; Esc closes
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus();
    return () => before?.focus?.();
  }, [open]);

  if (!open) return null;

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      vm.close();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="imp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && vm.close()}>
      <div ref={box} className="imp-modal" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} onKeyDown={keys} data-step={vm.step}>
        <header className="imp-head">
          <h2 id={title}>{importCopy.title}</h2>
          <button type="button" className="imp-icon" aria-label={importCopy.close} title={importCopy.close} onClick={vm.close}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="imp-body">
          {vm.step === "pick" && <Pick vm={vm} />}
          {vm.step === "reading" && <Reading vm={vm} />}
          {vm.step === "review" && <Review vm={vm} />}
        </div>

        {vm.step === "review" && (
          <footer className="imp-foot">
            <button type="button" className="imp-btn ghost" onClick={vm.backToPick}>
              {importCopy.review.again}
            </button>
            <button type="button" className="imp-btn ghost" onClick={vm.exportDraft}>
              <Icon name="download" size={14} />
              {importCopy.download}
            </button>
            <span className="imp-spacer" />
            <button type="button" className="imp-btn" onClick={vm.close}>
              {importCopy.cancel}
            </button>
            <button type="button" className="imp-btn primary" disabled={!vm.canSave} onClick={vm.save}>
              {importCopy.save}
            </button>
          </footer>
        )}
        <p className="imp-sr" role="status" aria-live="polite">
          {vm.message ?? ""}
        </p>
      </div>
    </div>
  );
}
