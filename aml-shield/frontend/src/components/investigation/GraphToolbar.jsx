// ═══════════════════════════════════════════════════════════════════════════
// GraphToolbar — the slim button strip that sits between the modal header
// and the graph body. Buttons in three semantic groups, separated by
// vertical dividers:
//
//   Group 1 — View toggles
//     · Edge Labels       (Tag)         — render TRANSACTS_WITH summary on each edge
//     · Account Nodes     (CreditCard)  — re-fetch with ?includeAccounts=true
//
//   Group 2 — Filters
//     · Edge Filter       (Filter)      — opens the EdgeFilterPanel popover;
//                                         carries a blue count dot when any
//                                         non-default filter is active
//     · Time Window       (Calendar)    — opens the time-slider popover; the
//                                         button label shows the active
//                                         window when one is set
//
//   Group 3 — Actions
//     · Multi-select      (MousePointer2) — toggles multi-select mode (amber
//                                           highlight when active)
//     · Capture Evidence  (Camera)      — drops a snapshot of the current
//                                         canvas into the active case file
//     · Export PNG        (Download)    — downloads the canvas as PNG
//     · Save View         (Bookmark)    — persists current filter + camera
//
// All button presses are surfaced as `onAction(name)`. Toggle visual state
// for each button is read off the `state` prop the parent provides.
//
// (Cluster Mode and Flow View / Sankey buttons retired per follow-up UX
// feedback — clustering painted everything in dense networks and the
// Sankey view was rejected outright.)
// ═══════════════════════════════════════════════════════════════════════════

import {
  Tag, CreditCard,
  Filter, Calendar,
  MousePointer2, Camera, Download, Bookmark
} from 'lucide-react';

export default function GraphToolbar({
  state = {},
  activeEdgeFilterCount = 0,
  timeWindow = null,           // { from, to } or null
  onAction
}) {
  const click = (name) => () => onAction && onAction(name);

  // Time window button shows the active range in compact "MMM d" form.
  const timeWindowLabel = timeWindow?.from && timeWindow?.to
    ? `${shortDate(timeWindow.from)} – ${shortDate(timeWindow.to)}`
    : null;

  return (
    <div className="border-b border-gray-200 bg-white px-3 py-1.5 flex items-center gap-1 text-slate-600">
      {/* Group 1 — View toggles. */}
      <Btn icon={Tag}        active={state.showEdgeLabels}    onClick={click('toggleEdgeLabels')}    title="Toggle edge labels" />
      <Btn icon={CreditCard} active={state.showAccountNodes}  onClick={click('toggleAccountNodes')}  title="Show account nodes" />

      <Divider />

      {/* Group 2 — Filters */}
      <BtnBadge
        icon={Filter}
        active={activeEdgeFilterCount > 0}
        badge={activeEdgeFilterCount}
        onClick={click('openEdgeFilter')}
        title={activeEdgeFilterCount > 0
          ? `Edge filters (${activeEdgeFilterCount} active)`
          : 'Open edge filter panel'}
      />
      <BtnLabel
        icon={Calendar}
        active={!!timeWindowLabel}
        label={timeWindowLabel}
        onClick={click('openTimeWindow')}
        title={timeWindowLabel
          ? `Time window: ${timeWindowLabel} (click to change)`
          : 'Open time window picker'}
      />

      <Divider />

      {/* Group 3 — Actions */}
      <Btn
        icon={MousePointer2}
        active={state.multiSelectMode}
        amber={state.multiSelectMode}
        onClick={click('toggleMultiSelect')}
        title={state.multiSelectMode
          ? 'Exit multi-select (Esc)'
          : 'Multi-select nodes for subgraph build'}
      />
      <Btn icon={Camera}   onClick={click('captureEvidence')} title="Capture canvas snapshot to case evidence" />
      <Btn icon={Download} onClick={click('exportPng')}       title="Export canvas as PNG" />
      <Btn icon={Bookmark} active={state.hasSavedView} onClick={click('saveView')} title="Save current filter + camera as a view" />
    </div>
  );
}

// ── Button primitives ─────────────────────────────────────────────────────
function Btn({ icon: Icon, active, amber, disabled, onClick, title }) {
  const base = 'h-8 w-8 rounded inline-flex items-center justify-center transition-colors';
  let cls;
  if (disabled) {
    cls = 'text-slate-300 cursor-not-allowed';
  } else if (amber) {
    cls = 'bg-amber-100 text-amber-700 hover:bg-amber-200';
  } else if (active) {
    cls = 'bg-blue-50 text-blue-600 hover:bg-blue-100';
  } else {
    cls = 'text-slate-600 hover:bg-gray-100';
  }
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={title}
      aria-label={title}
      aria-pressed={active ? true : undefined}
      disabled={disabled}
      className={`${base} ${cls}`}
    >
      <Icon size={15} />
    </button>
  );
}

function BtnBadge({ icon: Icon, active, badge, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`relative h-8 w-8 rounded inline-flex items-center justify-center transition-colors ${
        active ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'text-slate-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={15} />
      {Number(badge) > 0 && (
        <span
          className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none"
          aria-hidden
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function BtnLabel({ icon: Icon, active, label, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`h-8 rounded inline-flex items-center gap-1.5 px-2 transition-colors ${
        active ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'text-slate-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={15} />
      {label && <span className="text-[11px] font-medium tabular-nums">{label}</span>}
    </button>
  );
}

function Divider() {
  return <span className="h-5 w-px bg-gray-200 mx-1" />;
}

function shortDate(s) {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (_) {
    return s;
  }
}
