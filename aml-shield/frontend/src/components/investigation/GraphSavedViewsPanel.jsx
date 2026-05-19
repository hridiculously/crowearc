// ═══════════════════════════════════════════════════════════════════════════
// GraphSavedViewsPanel — popover from the toolbar's Bookmark button.
//
// Persists the analyst's filter + view-toggle state under a name so a
// recurring investigation pattern ("counterparty-only, last 90 days,
// alerted edges, account nodes off") can be recalled in one click.
//
// Storage: localStorage keyed by customer ID, so each focus customer
// has its own view library. Schema per entry:
//   { id, name, createdAt, snapshot: { filter, edgeFilters,
//     timeWindow, showEdgeLabels, showAccountNodes, showClusters,
//     viewMode } }
//
// The panel surfaces:
//   * Save current view (name input + button)
//   * List of saved views (Apply / Delete each)
//
// Pure presentation + callbacks. The parent owns the snapshot/load
// effects so multi-select state, fetch params, etc. all reset cleanly.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { X, Trash2, Plus, BookmarkCheck } from 'lucide-react';

const STORAGE_PREFIX = 'aml_shield_graph_views::';

export function readSavedViews(customerId) {
  if (!customerId) return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + customerId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

export function writeSavedViews(customerId, views) {
  if (!customerId) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + customerId, JSON.stringify(views));
  } catch (_e) { /* localStorage full, fail silently */ }
}

export default function GraphSavedViewsPanel({
  open,
  customerId,
  buildSnapshot,
  onApply,
  onClose
}) {
  const [name, setName] = useState('');
  const [views, setViews] = useState([]);

  // Load on open so a save/delete in another tab is reflected.
  useEffect(() => {
    if (!open) return;
    setViews(readSavedViews(customerId));
    setName('');
  }, [open, customerId]);

  if (!open) return null;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const snapshot = buildSnapshot ? buildSnapshot() : null;
    if (!snapshot) return;
    const entry = {
      id: `v-${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      snapshot
    };
    const next = [entry, ...views].slice(0, 20);   // cap to 20 per customer
    setViews(next);
    writeSavedViews(customerId, next);
    setName('');
  };

  const apply = (view) => {
    onApply && onApply(view.snapshot);
  };

  const remove = (id) => {
    const next = views.filter(v => v.id !== id);
    setViews(next);
    writeSavedViews(customerId, next);
  };

  return (
    <div
      role="dialog"
      aria-label="Saved views"
      className="absolute z-30 bg-white border border-slate-200 rounded-lg shadow-xl text-xs text-slate-700"
      style={{ top: 8, left: 8, width: 320 }}
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold inline-flex items-center gap-1.5">
          <BookmarkCheck size={11} /> Saved views
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
        >
          <X size={12} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Save current */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Save current</div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="View name…"
              maxLength={48}
              className="flex-1 px-2 py-1 border border-slate-300 rounded text-[11px] focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ${
                name.trim()
                  ? 'bg-teal-600 hover:bg-teal-500 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Plus size={12} /> Save
            </button>
          </div>
        </div>

        {/* List */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Library ({views.length})
          </div>
          {views.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic">
              No saved views for this customer yet.
            </div>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {views.map(v => (
                <div
                  key={v.id}
                  className="flex items-center gap-1.5 border border-slate-200 rounded px-2 py-1.5 hover:border-blue-300 hover:bg-blue-50"
                >
                  <button
                    type="button"
                    onClick={() => apply(v)}
                    className="flex-1 text-left min-w-0"
                    title="Apply this view"
                  >
                    <div className="text-[12px] text-navy-900 font-medium truncate">{v.name}</div>
                    <div className="text-[9px] text-slate-500">
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    title="Delete saved view"
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
