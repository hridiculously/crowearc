// ═══════════════════════════════════════════════════════════════════════════
// GraphTimeWindowPanel — popover surfaced from the toolbar's Calendar
// button. Lets the analyst clip the graph to a date range.
//
// Track bounds come from `dataDateRange` in the graph meta (earliest /
// latest non-null txn_date for the focus customer's transactions). The
// component owns its own draft state and only fires `onApply({ from, to })`
// on Apply; this keeps the parent's effect from re-fetching on every
// keystroke.
//
// A "Quick range" row offers Last 30/90 days + YTD + Last 12 months
// relative to today, plus an All-time clear that fires onApply(null).
//
// Pure presentation + callbacks. The active time window is read off
// `value`; null means "no window applied".
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';

const QUICK_RANGES = [
  { label: 'Last 30 days',   days: 30 },
  { label: 'Last 90 days',   days: 90 },
  { label: 'Last 12 months', days: 365 },
  { label: 'Year to date',   ytd: true }
];

export default function GraphTimeWindowPanel({
  open,
  value,            // { from, to } | null
  bounds,           // { earliest, latest } | null  (data envelope)
  onApply,
  onClose
}) {
  const [from, setFrom] = useState(value?.from || '');
  const [to,   setTo]   = useState(value?.to   || '');

  // Sync local draft when the popover opens with a different value (e.g.
  // analyst opened it twice, parent value changed in between).
  useEffect(() => {
    if (!open) return;
    setFrom(value?.from || '');
    setTo(value?.to || '');
  }, [open, value]);

  if (!open) return null;

  const minDate = bounds?.earliest || undefined;
  const maxDate = bounds?.latest   || undefined;

  // ── Range validation ────────────────────────────────────────────────
  const fromInvalid = !!(from && to && from > to);
  const toInvalid   = fromInvalid;

  // ── Quick-range helpers ─────────────────────────────────────────────
  const applyQuick = (q) => {
    const today = new Date();
    let f, t;
    if (q.ytd) {
      f = `${today.getFullYear()}-01-01`;
      t = today.toISOString().slice(0, 10);
    } else {
      const past = new Date(today);
      past.setDate(today.getDate() - q.days);
      f = past.toISOString().slice(0, 10);
      t = today.toISOString().slice(0, 10);
    }
    setFrom(f);
    setTo(t);
    onApply({ from: f, to: t });
  };

  const applyCustom = () => {
    if (fromInvalid) return;
    if (!from && !to) { onApply(null); return; }
    onApply({ from: from || null, to: to || null });
  };

  const clear = () => {
    setFrom(''); setTo('');
    onApply(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Time window"
      className="absolute z-30 bg-white border border-slate-200 rounded-lg shadow-xl text-xs text-slate-700"
      style={{ top: 8, left: 8, width: 300 }}
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Time window</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clear}
            title="Show all time"
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
        {/* Data envelope hint */}
        {(minDate || maxDate) && (
          <div className="text-[10px] text-slate-500">
            Data available: <span className="font-mono text-slate-700">{minDate || '?'}</span>
            {' '}→{' '}
            <span className="font-mono text-slate-700">{maxDate || '?'}</span>
          </div>
        )}

        {/* Quick ranges */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Quick range</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_RANGES.map(q => (
              <button
                key={q.label}
                type="button"
                onClick={() => applyQuick(q)}
                className="text-[11px] px-2 py-0.5 rounded border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom range */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Custom range</div>
          <div className="grid grid-cols-2 gap-2">
            <DateField
              label="From"
              value={from}
              min={minDate}
              max={maxDate}
              invalid={fromInvalid}
              onChange={setFrom}
            />
            <DateField
              label="To"
              value={to}
              min={minDate}
              max={maxDate}
              invalid={toInvalid}
              onChange={setTo}
            />
          </div>
          {fromInvalid && (
            <div className="mt-1 text-[10px] text-red-600">From date must be on or before To date.</div>
          )}
        </div>

        {/* Apply */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] text-slate-500">
            {value ? `Active: ${value.from || '–'} → ${value.to || '–'}` : 'No window applied'}
          </div>
          <button
            type="button"
            onClick={applyCustom}
            disabled={fromInvalid}
            className={`text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded font-semibold ${
              fromInvalid
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-500 text-white'
            }`}
          >
            <Check size={12} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, min, max, invalid, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-slate-600">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={`px-1.5 py-1 text-[11px] border rounded font-mono tabular-nums focus:outline-none focus:border-blue-500 ${
          invalid ? 'border-red-300 bg-red-50' : 'border-slate-300'
        }`}
      />
    </label>
  );
}
