// ═══════════════════════════════════════════════════════════════════════════
// GraphEdgeFilterPanel — popover surfaced from the toolbar's "Edge Filter"
// button. Lets the analyst slice the canvas by:
//
//   * master toggle ("Show all edges")
//   * direction (inbound / outbound / bidirectional)
//   * alert status (alerted / non-alerted)
//   * link type (TRANSACTS_WITH / CO_OCCURS_WITH / HOLDS_ACCOUNT)
//   * volume thresholds (minimum txn count, minimum total $ volume)
//
// All state is owned by useGraphFilters. This component is purely
// presentation + callback. It receives the current `edgeFilters` object
// and an `onChange(key, value)` callback, plus an optional `onReset`.
// ═══════════════════════════════════════════════════════════════════════════

import { X, RotateCcw } from 'lucide-react';

export default function GraphEdgeFilterPanel({
  open,
  edgeFilters,
  onChange,
  onReset,
  onClose
}) {
  if (!open || !edgeFilters) return null;

  const toggle = (key) => onChange(key, !edgeFilters[key]);
  const setNum = (key, raw) => {
    const v = Number(raw);
    onChange(key, Number.isFinite(v) && v >= 0 ? v : 0);
  };

  return (
    <div
      role="dialog"
      aria-label="Edge filter"
      className="absolute z-30 bg-white border border-slate-200 rounded-lg shadow-xl text-xs text-slate-700"
      style={{ top: 8, left: 8, width: 280 }}
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Edge filter</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            title="Reset to defaults"
            className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <Check label="Show all edges" checked={edgeFilters.showAll} onChange={() => toggle('showAll')} master />

        <Group title="Direction" disabled={!edgeFilters.showAll}>
          <Check label="Inbound (credit)"   checked={edgeFilters.inbound}       onChange={() => toggle('inbound')} />
          <Check label="Outbound (debit)"   checked={edgeFilters.outbound}      onChange={() => toggle('outbound')} />
          <Check label="Bidirectional"      checked={edgeFilters.bidirectional} onChange={() => toggle('bidirectional')} />
        </Group>

        <Group title="Alert status" disabled={!edgeFilters.showAll}>
          <Check label="Alerted only"     checked={edgeFilters.alerted}    onChange={() => toggle('alerted')} />
          <Check label="Non-alerted"      checked={edgeFilters.nonAlerted} onChange={() => toggle('nonAlerted')} />
        </Group>

        <Group title="Link type" disabled={!edgeFilters.showAll}>
          <Check label="Transactions"           checked={edgeFilters.transactsWith} onChange={() => toggle('transactsWith')} />
          <Check label="Shared counterparty"    checked={edgeFilters.coOccursWith}  onChange={() => toggle('coOccursWith')} />
          <Check label="Account ownership"      checked={edgeFilters.holdsAccount}  onChange={() => toggle('holdsAccount')} />
        </Group>

        <Group title="Volume" disabled={!edgeFilters.showAll}>
          <NumInput
            label="Min txn count"
            value={edgeFilters.minTxnCount}
            onChange={(v) => setNum('minTxnCount', v)}
          />
          <NumInput
            label="Min total $ volume"
            value={edgeFilters.minVolume}
            onChange={(v) => setNum('minVolume', v)}
            step={100}
          />
        </Group>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange, master, disabled }) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-blue-600"
      />
      <span className={master ? 'font-semibold text-navy-900' : 'text-slate-700'}>{label}</span>
    </label>
  );
}

function Group({ title, disabled, children }) {
  return (
    <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NumInput({ label, value, onChange, step = 1 }) {
  return (
    <label className="flex items-center justify-between gap-2 text-slate-700">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-1.5 py-0.5 text-right border border-slate-300 rounded tabular-nums text-[11px] focus:outline-none focus:border-blue-500"
      />
    </label>
  );
}
