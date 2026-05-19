// ═══════════════════════════════════════════════════════════════════════════
// GraphRightPanel — the 30%-width right pane of the CCEG modal.
//
// State machine, driven by `node` (the currently-selected graph node):
//   * null      → WelcomeState (network counts + flagged entities + recent
//                 network activity timeline).
//   * CASE      → AlertDetails + single-event timeline.
//   * SAR       → SarDetails  + single-event timeline.
//   * customer  → CustomerDetails + per-customer alert timeline.
//   * counterparty (is_counterparty=true) → CounterpartyDetails + via-
//                 connected-customers timeline.
//
// All detail components are pure: they take a node + a few accessory
// props (data, adjacency, userRole, etc.) and render. None of them fetch.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import {
  Network, Flame, ExternalLink, Building2, FileText, ShieldAlert, Users,
  MousePointer2, X, GitMerge, CreditCard, StickyNote, Trash2, Plus
} from 'lucide-react';
import EntityAlertTimeline from './EntityAlertTimeline.jsx';
import {
  COLORS, initialsOf, fmtMoney, riskTone, priorityTone,
  computeRiskScore, riskScoreTone
} from './graphHelpers.js';

// ─── Timeline derivation ────────────────────────────────────────────────
// Pure: given the raw graph payload + a node, returns the alerts and SARs
// that belong on the timeline for that node.
function deriveTimeline(data, node) {
  const empty = { alerts: [], sars: [] };
  if (!data || !node) return empty;
  const links = data.links || [];
  const nodes = data.nodes || [];

  if (node.type === 'CASE') return { alerts: [node], sars: [] };
  if (node.type === 'SAR')  return { alerts: [], sars: [node] };

  const neighboursOf = (rootId) => {
    const out = new Set();
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (s === rootId) out.add(t);
      else if (t === rootId) out.add(s);
    }
    return out;
  };

  if (!node.is_counterparty) {
    const linked = neighboursOf(node.id);
    const alerts = nodes.filter(n => n.type === 'CASE' && linked.has(n.id));
    const sars   = nodes.filter(n => n.type === 'SAR'  && linked.has(n.id));
    return { alerts, sars };
  }

  // Counterparty: hop through neighbour customers.
  const directLinks = neighboursOf(node.id);
  const customerIds = new Set();
  for (const id of directLinks) {
    const n = nodes.find(x => x.id === id);
    if (n && (n.type === 'PERSON' || n.type === 'COMPANY') && !n.is_counterparty) {
      customerIds.add(id);
    }
  }
  const linkedEventIds = new Set();
  for (const c of customerIds) {
    for (const id of neighboursOf(c)) linkedEventIds.add(id);
  }
  const alerts = nodes.filter(n => n.type === 'CASE' && linkedEventIds.has(n.id));
  const sars   = nodes.filter(n => n.type === 'SAR'  && linkedEventIds.has(n.id));
  return { alerts, sars };
}

function deriveNetworkRecent(data) {
  if (!data) return { alerts: [], sars: [] };
  const events = (data.nodes || []).filter(n => n.type === 'CASE' || n.type === 'SAR');
  events.sort((a, b) => {
    const at = a.filed_date || a.created_date || 0;
    const bt = b.filed_date || b.created_date || 0;
    return new Date(bt).getTime() - new Date(at).getTime();
  });
  const top = events.slice(0, 5);
  return {
    alerts: top.filter(n => n.type === 'CASE'),
    sars:   top.filter(n => n.type === 'SAR')
  };
}

// ─── Main panel ─────────────────────────────────────────────────────────
export default function GraphRightPanel({
  node, data, counts, customerName, customerId, userRole, userName,
  rolePrefix, adjacency, onSelectNode, onRecenter,
  // Multi-select (Part 4)
  multiSelectMode = false,
  multiSelectNodes = null,
  onToggleMultiSelectNode,
  onClearMultiSelect,
  onBuildSubgraph,
  subgraphFilter = null,
  onClearSubgraphFilter,
  // Annotations (Part 12) — { byTargetKey, addAnnotation, removeAnnotation, enabled, ... }
  annotations = null
}) {
  const { alerts: timelineAlerts, sars: timelineSars } = useMemo(
    () => deriveTimeline(data, node),
    [data, node]
  );
  const networkRecent = useMemo(() => deriveNetworkRecent(data), [data]);
  const selectedEntityType = node?.is_counterparty
    ? 'counterparty'
    : (node?.type === 'CASE' || node?.type === 'SAR')
      ? 'event'
      : 'customer';
  const selectedEntityLabel = node?.label || node?.customer_name || node?.alert_id || node?.sar_id || '';

  // The multi-select view takes priority over single-node detail when the
  // analyst is actively building a subgraph (either in mode, or has 2+
  // staged nodes from a prior session).
  const showMultiSelectView = multiSelectMode || (multiSelectNodes && multiSelectNodes.size >= 1);

  return (
    <aside
      className="border-l border-slate-200 overflow-y-auto text-slate-700 bg-white"
      style={{ flex: '0 0 30%', maxWidth: '30%' }}
    >
      {/* Subgraph-active banner sits above everything else; clearing it
          drops the dim filter so the full network returns. */}
      {subgraphFilter && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <GitMerge size={12} /> Subgraph view ({subgraphFilter.size} nodes)
          </span>
          <button
            type="button"
            onClick={onClearSubgraphFilter}
            className="text-amber-800 hover:text-amber-900 underline font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {showMultiSelectView ? (
        <MultiSelectView
          data={data}
          multiSelectNodes={multiSelectNodes}
          onToggleMultiSelectNode={onToggleMultiSelectNode}
          onClearMultiSelect={onClearMultiSelect}
          onBuildSubgraph={onBuildSubgraph}
        />
      ) : !node ? (
        <>
          <WelcomeState counts={counts} customerName={customerName} data={data} onSelectNode={onSelectNode} />
          {(networkRecent.alerts.length > 0 || networkRecent.sars.length > 0) && (
            <div className="px-5 pb-5">
              <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
                Recent Network Activity
              </div>
              <EntityAlertTimeline
                alerts={networkRecent.alerts}
                sarAlerts={networkRecent.sars}
                entityType="customer"
                entityLabel=""
                userRole={userRole}
                compact={true}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {node.type === 'CASE' ? (
            <AlertDetails node={node} userRole={userRole} userName={userName} rolePrefix={rolePrefix} customerId={customerId} />
          ) : node.type === 'SAR' ? (
            <SarDetails node={node} userRole={userRole} rolePrefix={rolePrefix} />
          ) : node.type === 'ACCOUNT' ? (
            <AccountDetails node={node} data={data} />
          ) : node.is_counterparty ? (
            <CounterpartyDetails node={node} data={data} adjacency={adjacency} userRole={userRole} />
          ) : (
            <CustomerDetails node={node} data={data} adjacency={adjacency} userRole={userRole} rolePrefix={rolePrefix} customerId={customerId} onRecenter={onRecenter} />
          )}

          {annotations?.enabled && (
            <AnnotationsForNode
              nodeId={node.id}
              nodeLabel={node.label || node.id}
              annotations={annotations}
              userName={userName}
            />
          )}

          <div className="mx-5 mt-4 pt-4 border-t border-gray-100 pb-5">
            {selectedEntityType === 'event' && (
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                Showing selected event
              </div>
            )}
            <EntityAlertTimeline
              alerts={timelineAlerts}
              sarAlerts={timelineSars}
              entityType={selectedEntityType === 'counterparty' ? 'counterparty' : 'customer'}
              entityLabel={selectedEntityLabel}
              userRole={userRole}
            />
          </div>
        </>
      )}
    </aside>
  );
}

// ─── Annotations for a selected node (Part 12) ─────────────────────────
// Inline add form + a list of any pinned notes on this target. The
// `annotations` prop is the full hook return value so this component can
// call addAnnotation / removeAnnotation directly. The hook itself owns
// the network + state plumbing.
const ANNOTATION_COLORS = [
  { value: '#F59E0B', label: 'Amber' },     // default
  { value: '#DC2626', label: 'Red' },
  { value: '#10B981', label: 'Green' },
  { value: '#3B82F6', label: 'Blue' }
];

function AnnotationsForNode({ nodeId, nodeLabel, annotations, userName }) {
  const [drafting, setDrafting] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState(ANNOTATION_COLORS[0].value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const list = useMemo(() => {
    const arr = annotations?.byTargetKey?.get(nodeId) || [];
    return [...arr].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [annotations, nodeId]);

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    const result = await annotations.addAnnotation({
      target_type: 'node',
      target_id: nodeId,
      text: trimmed,
      color
    });
    setBusy(false);
    if (!result.ok) {
      setErr(result.error || 'Save failed');
      return;
    }
    setText('');
    setDrafting(false);
  };

  const remove = async (id) => {
    const r = await annotations.removeAnnotation(id);
    if (!r.ok) setErr(r.error || 'Delete failed');
  };

  return (
    <div className="mx-5 mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
          <StickyNote size={11} /> Annotations ({list.length})
        </div>
        {!drafting && (
          <button
            type="button"
            onClick={() => setDrafting(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
          >
            <Plus size={11} /> Add note
          </button>
        )}
      </div>

      {drafting && (
        <div className="border border-slate-200 rounded p-2 mb-2 bg-slate-50">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Pin a note on ${nodeLabel}…`}
            rows={3}
            maxLength={1000}
            className="w-full text-[12px] px-2 py-1 border border-slate-300 rounded focus:outline-none focus:border-blue-500 bg-white"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1">
              {ANNOTATION_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  aria-label={c.label}
                  className={`w-4 h-4 rounded-full border-2 ${color === c.value ? 'border-slate-900' : 'border-white'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setDrafting(false); setText(''); setErr(null); }}
                disabled={busy}
                className="text-[11px] px-2 py-1 rounded text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !text.trim()}
                className={`text-[11px] px-2 py-1 rounded font-semibold ${
                  busy || !text.trim()
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-500 text-white'
                }`}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {err && <div className="mt-1.5 text-[10px] text-red-600">{err}</div>}
        </div>
      )}

      {list.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic">
          No notes pinned to this {nodeLabel ? `entity` : 'node'} yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map(a => (
            <div
              key={a.id}
              className="text-[12px] border border-slate-200 rounded bg-white px-2.5 py-1.5 flex items-start gap-2"
              style={{ borderLeft: `3px solid ${a.color || '#F59E0B'}` }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-slate-700 break-words whitespace-pre-wrap">{a.text}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {a.created_by || 'unknown'} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              {(a.created_by === userName || userName === null) && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  title="Delete annotation"
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Multi-select view ─────────────────────────────────────────────────
// Shown in place of the WelcomeState / detail panels while the analyst is
// in multi-select mode or has staged ≥1 nodes for a subgraph build. Lists
// every staged node as a chip (click X to remove). When 2+ are staged,
// computes the intersection of their first-order neighbour sets so the
// analyst can see at a glance what their selection shares.
function MultiSelectView({ data, multiSelectNodes, onToggleMultiSelectNode, onClearMultiSelect, onBuildSubgraph }) {
  const count = multiSelectNodes?.size || 0;

  const nodeById = useMemo(() => {
    const m = new Map();
    for (const n of data?.nodes || []) m.set(n.id, n);
    return m;
  }, [data]);

  // Map: node-id -> Set of neighbour ids (over raw graph, not the filtered
  // displayData — selection survives filter narrowing).
  const adjacencyRaw = useMemo(() => {
    const map = new Map();
    for (const l of data?.links || []) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s).add(t);
      map.get(t).add(s);
    }
    return map;
  }, [data]);

  // Shared connections = intersection of the neighbour sets of every
  // staged node, with the staged nodes themselves removed (you don't
  // want a node to "share" itself).
  const sharedConnections = useMemo(() => {
    if (!multiSelectNodes || multiSelectNodes.size < 2) return [];
    const ids = Array.from(multiSelectNodes);
    let acc = adjacencyRaw.get(ids[0]) ? new Set(adjacencyRaw.get(ids[0])) : new Set();
    for (let i = 1; i < ids.length; i++) {
      const next = adjacencyRaw.get(ids[i]) || new Set();
      acc = new Set([...acc].filter(x => next.has(x)));
      if (acc.size === 0) break;
    }
    for (const id of ids) acc.delete(id);
    return Array.from(acc).map(id => nodeById.get(id)).filter(Boolean);
  }, [multiSelectNodes, adjacencyRaw, nodeById]);

  const stagedNodes = useMemo(() => {
    if (!multiSelectNodes) return [];
    return Array.from(multiSelectNodes).map(id => nodeById.get(id)).filter(Boolean);
  }, [multiSelectNodes, nodeById]);

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-amber-100 border border-amber-300 shrink-0">
          <MousePointer2 size={16} className="text-amber-700" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-navy-900">Multi-select</div>
          <div className="text-[11px] text-slate-500">
            {count === 0
              ? 'Click nodes on the canvas to stage them.'
              : `${count} node${count === 1 ? '' : 's'} staged`}
          </div>
        </div>
      </div>

      {count > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
            <span>Selected</span>
            <button
              type="button"
              onClick={onClearMultiSelect}
              className="text-[10px] text-slate-500 hover:text-slate-800 underline normal-case tracking-normal"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stagedNodes.map(n => (
              <span
                key={n.id}
                className="inline-flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-full pl-2 pr-1 py-0.5 text-[11px] max-w-full"
                title={n.label || n.id}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[n.type] || '#94A3B8' }}
                />
                <span className="truncate max-w-[10rem]">{n.label || n.id}</span>
                <button
                  type="button"
                  onClick={() => onToggleMultiSelectNode && onToggleMultiSelectNode(n.id)}
                  className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-amber-200 text-amber-700"
                  aria-label={`Remove ${n.label || n.id}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {count >= 2 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Shared connections ({sharedConnections.length})
          </div>
          {sharedConnections.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic">
              These nodes have no first-order neighbours in common.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {sharedConnections.slice(0, 25).map(n => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5"
                  title={n.id}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[n.type] || '#94A3B8' }}
                  />
                  <div className="min-w-0 flex-1 truncate text-navy-900">{n.label || n.id}</div>
                  {n.is_counterparty && <Chip tone="amber">Counterparty</Chip>}
                </div>
              ))}
              {sharedConnections.length > 25 && (
                <div className="text-[10px] text-slate-500 italic">
                  +{sharedConnections.length - 25} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onBuildSubgraph}
        disabled={count < 2}
        className={`w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded px-3 py-2 ${
          count < 2
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-teal-600 hover:bg-teal-500 text-white'
        }`}
        title={count < 2 ? 'Stage at least 2 nodes' : 'Dim everything outside this subgraph'}
      >
        <GitMerge size={14} /> Build Subgraph
      </button>
      <div className="text-[10px] text-slate-500 text-center -mt-2">
        Esc to cancel · clicks toggle membership
      </div>
    </div>
  );
}

// ─── Welcome state (default panel) ──────────────────────────────────────
function WelcomeState({ counts, customerName, data, onSelectNode }) {
  const flagged = useMemo(() => {
    if (!data?.nodes) return [];
    const items = data.nodes
      .filter(n => n.sanctions || n.pep || n.is_high_risk_country)
      .filter(n => !n.is_focus);
    items.sort((a, b) => {
      const score = (x) => (x.sanctions ? 3 : 0) + (x.pep ? 2 : 0) + (x.is_high_risk_country ? 1 : 0);
      return score(b) - score(a);
    });
    return items;
  }, [data]);

  return (
    <div className="p-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-teal-50 border border-teal-200 mb-3">
          <Network size={24} className="text-teal-600" />
        </div>
        <div className="text-base font-bold text-navy-900">Entity Network</div>
        <div className="text-xs text-slate-500 mt-1.5 max-w-xs">
          Click any node to see details about that entity and its connections.
        </div>
      </div>

      {counts && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">In this network</div>
          <div className="grid grid-cols-2 gap-2">
            <SummaryStat icon={Users}        label="Customers"      value={counts.customers} />
            <SummaryStat icon={Building2}    label="Counterparties" value={counts.counterparties} />
            <SummaryStat icon={ShieldAlert}  label="Alerts"         value={counts.alerts} />
            {counts.sars > 0 && <SummaryStat icon={FileText} label="SARs" value={counts.sars} />}
          </div>
          {customerName && (
            <div className="mt-3 text-[11px] text-slate-500">
              Focus: <span className="text-navy-900 font-medium">{customerName}</span>
            </div>
          )}
        </div>
      )}

      {flagged.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-1.5 mb-2">
            <Flame size={11} className="text-orange-500" />
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Flagged entities ({flagged.length})
            </div>
          </div>
          <div className="space-y-1.5">
            {flagged.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelectNode && onSelectNode(n)}
                className="w-full flex items-start gap-2 text-left border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded px-2.5 py-1.5 transition"
                title={`Focus on ${n.label}`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: COLORS[n.type] || '#94A3B8' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-navy-900 truncate">{n.label}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {n.sanctions && <FlagChip tone="red">Sanctions</FlagChip>}
                    {n.pep && <FlagChip tone="purple">PEP</FlagChip>}
                    {n.is_high_risk_country && <FlagChip tone="orange">High Risk</FlagChip>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FlagChip({ tone, children }) {
  const cls = {
    red:    'bg-red-50    text-red-700    border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200'
  }[tone] || 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cls}`}>
      {children}
    </span>
  );
}

function SummaryStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
        <Icon size={10} /> {label}
      </div>
      <div className="text-lg font-bold text-navy-900 tabular-nums">{value || 0}</div>
    </div>
  );
}

// ─── Customer details ───────────────────────────────────────────────────
function CustomerDetails({ node, data, adjacency, userRole, rolePrefix, customerId: focusCustomerId, onRecenter }) {
  let neighbourSummary = null;
  if (node.is_neighbour && data?.links) {
    neighbourSummary = node.via_counterparty || null;
  }

  const profileHref = node.customer_id
    ? `${rolePrefix}/customers/${encodeURIComponent(node.customer_id)}`
    : null;

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full inline-flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: COLORS[node.type] || '#94A3B8' }}
        >
          {initialsOf(node.label)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-navy-900 break-words">{node.label}</div>
          {node.customer_id && (
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{node.customer_id}</div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip tone="slate">{node.customer_type === 'Business' ? 'Business' : 'Individual'}</Chip>
            {node.is_focus && <Chip tone="blue">Focus</Chip>}
            {node.is_neighbour && <Chip tone="slate-soft">Neighbour</Chip>}
          </div>
          {onRecenter && node.customer_id && node.customer_id !== focusCustomerId && (
            <button
              type="button"
              onClick={() => onRecenter(node.customer_id)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium"
            >
              Focus this customer →
            </button>
          )}
        </div>
      </div>

      <Section title="Risk">
        <div className="flex flex-wrap gap-1.5">
          {node.risk && <Chip tone={riskTone(node.risk)}>{node.risk}</Chip>}
          {node.cdd_level && <Chip tone="slate">{node.cdd_level === 'Enhanced' ? 'Enhanced CDD' : 'Standard CDD'}</Chip>}
        </div>
        {(node.pep || node.sanctions || node.is_high_risk_country) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {node.pep && <Chip tone="purple">PEP</Chip>}
            {node.sanctions && <Chip tone="red">Sanctions</Chip>}
            {node.is_high_risk_country && <Chip tone="orange">High Risk Country</Chip>}
          </div>
        )}
        <RiskScoreBar score={computeRiskScore(node)} />
      </Section>

      <Section title="Key facts">
        <KV k="Customer since" v={node.customer_since ? String(node.customer_since).slice(0, 10) : '—'} />
        <KV k={node.customer_type === 'Business' ? 'Industry' : 'Occupation'}
            v={node.customer_type === 'Business' ? (node.industry || '—') : (node.occupation || '—')} />
        <KV k="Country" v={node.country || '—'} />
      </Section>

      {node.is_neighbour && neighbourSummary && (
        <Section title="Connection">
          <div className="text-xs text-slate-600">Connected via shared counterparty:</div>
          <div className="text-sm font-medium text-navy-900 mt-1 break-words">{neighbourSummary}</div>
        </Section>
      )}

      {profileHref && (
        <a
          href={profileHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 w-full text-sm bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded px-3 py-2"
        >
          View Customer Profile <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

// ─── Counterparty details ───────────────────────────────────────────────
function CounterpartyDetails({ node, data, adjacency, userRole }) {
  const focusLink = useMemo(() => {
    if (!data?.links) return null;
    return data.links.find(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      return l.type === 'TRANSACTS_WITH' && (s === node.id || t === node.id);
    }) || null;
  }, [data, node.id]);

  const customersConnected = useMemo(() => {
    if (!data) return [];
    const matchName = (node.label || '').trim().toLowerCase();
    return data.nodes.filter(n =>
      n.is_neighbour &&
      typeof n.via_counterparty === 'string' &&
      n.via_counterparty.trim().toLowerCase() === matchName
    );
  }, [data, node.label]);

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full inline-flex items-center justify-center text-white shrink-0"
          style={{ background: COLORS.COMPANY }}
        >
          <Building2 size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-navy-900 break-words">{node.label}</div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{node.id}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip tone="amber">Counterparty</Chip>
            {node.is_high_risk_country && <Chip tone="orange">High Risk</Chip>}
          </div>
        </div>
      </div>

      {node.counterparty_id && (
        <Section title="Entity">
          <div className="flex flex-wrap gap-1 mb-2">
            <Chip tone="slate">
              {(node.counterparty_type || 'unknown').replace('_', ' ').toUpperCase()}
            </Chip>
            {node.risk_indicators?.pep && <Chip tone="purple">PEP</Chip>}
            {node.risk_indicators?.sanctions_hit && <Chip tone="red">SANCTIONS HIT</Chip>}
            {node.risk_indicators?.high_risk_jurisdiction && <Chip tone="orange">HIGH-RISK JURISDICTION</Chip>}
          </div>
          <RiskScoreBar score={computeRiskScore(node)} />
          <div className="mt-2 text-[10px] text-slate-500 font-mono break-all">{node.counterparty_id}</div>
        </Section>
      )}

      <Section title="Country & risk">
        <KV k="Country" v={node.country || 'Unknown'} />
        {node.is_high_risk_country && (
          <div className="mt-2 text-[11px] text-red-700 border border-red-200 bg-red-50 rounded px-2.5 py-1.5 inline-flex items-center gap-1.5">
            <Flame size={11} /> FATF high-risk jurisdiction
          </div>
        )}
      </Section>

      <Section title="Transactions with focus customer">
        <KV k="Total transactions" v={focusLink?.txn_count ?? node.txn_count_with_focus ?? '—'} />
        <KV k="Total amount"       v={fmtMoney(focusLink?.total_amount)} />
        <KV k="Alerted transactions"
            v={focusLink?.alerted_count > 0
                ? <span className="text-red-700 font-semibold">{focusLink.alerted_count}</span>
                : '0'} />
      </Section>

      {node.counterparty_id && (
        <Section title="Across all customers in this institution">
          <KV k="Total transactions" v={node.txn_count ?? '—'} />
          <KV k="Total volume"       v={fmtMoney(node.total_volume)} />
          <KV k="Customer count"     v={node.shared_with_customer_count >= 99 ? '99+' : (node.shared_with_customer_count ?? '—')} />
          {Number(node.shared_with_customer_count) >= 3 && (
            <div className="mt-2 text-[11px] text-violet-800 border border-violet-300 bg-violet-50 rounded px-2.5 py-1.5">
              ⚠ Network hub — this entity transacts with {node.shared_with_customer_count >= 99 ? '99+' : node.shared_with_customer_count} customers in your institution. Review for potential layering or structuring through a common intermediary.
            </div>
          )}
        </Section>
      )}

      {node.counterparty_id && userRole === 'bsa_officer' && (
        <Section title="Full profile">
          <a
            href={`/bsa/counterparty-merge?id=${encodeURIComponent(node.counterparty_id)}`}
            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            View Full Profile →
          </a>
        </Section>
      )}

      {customersConnected.length > 0 && (
        <Section title={`Other customers via this counterparty (${customersConnected.length})`}>
          <div className="space-y-1.5">
            {customersConnected.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5">
                <div className="min-w-0">
                  <div className="text-navy-900 truncate">{c.label}</div>
                  {c.customer_id && <div className="text-[10px] text-slate-500 font-mono">{c.customer_id}</div>}
                </div>
                {c.risk && <Chip tone={riskTone(c.risk)}>{c.risk}</Chip>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Account details (when includeAccounts=true) ────────────────────────
function AccountDetails({ node, data }) {
  // Count the counterparties this account transacts with, by walking the
  // TRANSACTS_VIA links from this account.
  const cpCount = useMemo(() => {
    if (!data?.links) return 0;
    const set = new Set();
    for (const l of data.links) {
      if (l.type !== 'TRANSACTS_VIA') continue;
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (s === node.id) set.add(t);
      if (t === node.id) set.add(s);
    }
    return set.size;
  }, [data, node.id]);

  const inactive = node.status && node.status !== 'Active';

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-md inline-flex items-center justify-center text-white shrink-0"
          style={{ background: COLORS.ACCOUNT }}
        >
          <CreditCard size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-navy-900 font-mono">{node.label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Account</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {node.account_type && <Chip tone="slate">{node.account_type}</Chip>}
            {node.currency && <Chip tone="slate-soft">{node.currency}</Chip>}
            {inactive && <Chip tone="amber">{node.status}</Chip>}
          </div>
        </div>
      </div>

      <Section title="Activity">
        <KV k="Transactions" v={node.txn_count ?? '—'} />
        <KV k="Total volume" v={fmtMoney(node.total_volume)} />
        <KV k="Counterparties via this account" v={cpCount} />
      </Section>
    </div>
  );
}

// ─── Alert / Case details ───────────────────────────────────────────────
function AlertDetails({ node, userRole, userName, rolePrefix, customerId }) {
  const ruleSummary = node.rule_explanation?.rule_summary
    || node.rule_explanation?.summary
    || node.rule_explanation?.description
    || (typeof node.rule_explanation === 'string' ? node.rule_explanation : null);

  const canOpen = userRole && userRole !== 'analyst_l1';
  const investigationHref = canOpen
    ? `${rolePrefix}/alerts?alert=${encodeURIComponent(node.alert_id || node.label)}`
    : null;

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded inline-flex items-center justify-center text-white shrink-0"
          style={{ background: COLORS.CASE }}
        >
          <ShieldAlert size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-navy-900 font-mono">{node.alert_id || node.label}</div>
          {node.customer_name && (
            <div className="text-[11px] text-slate-500 mt-0.5">{node.customer_name}</div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {node.priority && <Chip tone={priorityTone(node.priority)}>{node.priority}</Chip>}
            {node.status && <Chip tone="slate">{node.status}</Chip>}
          </div>
        </div>
      </div>

      <Section title="Detection">
        {node.scenario && <KV k="Scenario" v={node.scenario} />}
        {node.amount != null && <KV k="Amount" v={fmtMoney(node.amount)} />}
        {node.created_date && <KV k="Created" v={String(node.created_date).slice(0, 10)} />}
      </Section>

      {ruleSummary && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Rule explanation</div>
          <div className="border-l-4 border-blue-500 bg-blue-50 px-3 py-2 text-[12px] text-slate-700 leading-snug">
            {truncateRuleSummary(ruleSummary)}
          </div>
        </div>
      )}

      {investigationHref && (
        <a
          href={investigationHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 w-full text-sm bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded px-3 py-2"
        >
          Open Investigation <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

function truncateRuleSummary(s) {
  const str = String(s);
  if (str.length <= 220) return str;
  return str.slice(0, 220).replace(/\s+\S*$/, '') + '… read more in the investigation workspace';
}

// ─── SAR details ────────────────────────────────────────────────────────
function SarDetails({ node, userRole }) {
  if (userRole === 'analyst_l1') {
    return (
      <div className="p-5 text-xs text-slate-500">
        SAR details are not visible to L1 analysts.
      </div>
    );
  }
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded inline-flex items-center justify-center text-white shrink-0"
          style={{ background: COLORS.SAR }}
        >
          <FileText size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-navy-900 font-mono">{node.sar_id || node.label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Filed SAR</div>
        </div>
      </div>

      <Section title="Filing">
        {node.status && <KV k="Status" v={node.status} />}
        {node.filed_date && <KV k="Filed date" v={String(node.filed_date).slice(0, 10)} />}
        {node.amount != null && <KV k="Total amount" v={fmtMoney(node.amount)} />}
        {node.filing_type && <KV k="Filing type" v={node.filing_type} />}
      </Section>
    </div>
  );
}

// ─── Section / KV / Chip primitives ─────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      <div className="space-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-500 shrink-0">{k}</span>
      <span className="text-navy-900 font-medium text-right break-words">{v == null || v === '' ? '—' : v}</span>
    </div>
  );
}

// Risk score bar — 0-100 rolled up from sanctions / PEP / hub / OFAC /
// jurisdiction signals (counterparties) or the customer's assigned risk
// tier (PERSON / COMPANY). Hidden when the helper returns null.
function RiskScoreBar({ score }) {
  if (score == null) return null;
  const tone = riskScoreTone(score);
  const fillCls = {
    red:    'bg-red-500',
    orange: 'bg-orange-500',
    amber:  'bg-amber-400',
    slate:  'bg-slate-400'
  }[tone] || 'bg-slate-400';
  const labelCls = {
    red:    'text-red-700',
    orange: 'text-orange-700',
    amber:  'text-amber-700',
    slate:  'text-slate-600'
  }[tone] || 'text-slate-600';
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        <span>Risk score</span>
        <span className={`font-bold ${labelCls}`}>{score}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full ${fillCls}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

function Chip({ tone, children }) {
  const toneCls = {
    red:          'bg-red-50    text-red-700    border border-red-200',
    purple:       'bg-purple-50 text-purple-700 border border-purple-200',
    amber:        'bg-amber-50  text-amber-700  border border-amber-200',
    orange:       'bg-orange-50 text-orange-700 border border-orange-200',
    blue:         'bg-blue-50   text-blue-700   border border-blue-200',
    slate:        'bg-slate-100 text-slate-700  border border-slate-200',
    'slate-soft': 'bg-slate-50  text-slate-500  border border-slate-200'
  }[tone] || 'bg-slate-100 text-slate-700 border border-slate-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${toneCls}`}>
      {children}
    </span>
  );
}
