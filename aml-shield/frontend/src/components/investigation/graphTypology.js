// ═══════════════════════════════════════════════════════════════════════════
// graphTypology — frontend-only pattern matcher over the CCEG payload.
//
// Returns an ordered list of typology hits the analyst should review.
// Each match is purely advisory — it tells the analyst "here's a known
// AML shape in your network"; it does NOT itself create an alert.
//
// Currently recognised patterns:
//
//   * hub                — Phase-B counterparty with shared_with_customer_count >= 3.
//                          Known typology: a single intermediary across
//                          many customers (layering / shell-company web).
//   * structuring        — counterparty with multiple TRANSACTS_WITH txns
//                          where total_amount sits in the $9,000–$9,999
//                          range (a classic structuring tell — keeping
//                          each transaction under the $10k CTR floor).
//   * fan_out            — focus customer with ≥6 distinct counterparties.
//                          Possible mule / dispersion pattern.
//   * bidirectional_pair — TRANSACTS_WITH edge with direction='bidirectional'
//                          AND both sides ≥ $5k. U-turn-style activity.
//   * sanctions_proximity — counterparty with ofac_flagged OR
//                          risk_indicators.sanctions_hit. Severity always high.
//
// detectTypologies(displayData) → array of {
//   id, kind, label, severity ∈ {high, medium, low}, summary,
//   nodeIds: string[]  (members of the pattern — for highlight),
//   edgeKeys: string[] (canonical "src::tgt" keys),
//   evidence: string   (one-line explanation analyst can paste in a note)
// }
// ═══════════════════════════════════════════════════════════════════════════

const STRUCT_LOW  = 9_000;
const STRUCT_HIGH = 9_999;
const FAN_OUT_THRESHOLD = 6;
const HUB_CUSTOMER_THRESHOLD = 3;

function linkPairKey(s, t) {
  const a = String(s), b = String(t);
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function detectTypologies(displayData) {
  if (!displayData?.nodes) return [];
  const nodes = displayData.nodes;
  const links = displayData.links || [];

  const focus = nodes.find(n => n.is_focus);
  const focusId = focus?.id || null;
  const matches = [];

  // ── 1. Hub counterparties ──────────────────────────────────────────
  for (const n of nodes) {
    if (!n.is_counterparty) continue;
    const cnt = Number(n.shared_with_customer_count) || 0;
    if (cnt < HUB_CUSTOMER_THRESHOLD) continue;
    matches.push({
      id: `hub-${n.id}`,
      kind: 'hub',
      label: `Hub counterparty: ${n.label}`,
      severity: cnt >= 5 ? 'high' : 'medium',
      summary: `${cnt}${cnt >= 99 ? '+' : ''} customers transact with this entity`,
      nodeIds: [n.id],
      edgeKeys: [],
      evidence: `Counterparty "${n.label}" appears across ${cnt}${cnt >= 99 ? '+' : ''} customers in the institution — possible common intermediary in a layering or structuring web.`
    });
  }

  // ── 2. Sanctions / OFAC proximity ──────────────────────────────────
  for (const n of nodes) {
    const hit = n.ofac_flagged || n.risk_indicators?.sanctions_hit || n.sanctions;
    if (!hit) continue;
    matches.push({
      id: `sanc-${n.id}`,
      kind: 'sanctions_proximity',
      label: `Sanctions proximity: ${n.label}`,
      severity: 'high',
      summary: 'OFAC / sanctions match in network',
      nodeIds: focusId ? [focusId, n.id] : [n.id],
      edgeKeys: [],
      evidence: `Entity "${n.label}" matches a sanctions list and sits ≤1 hop from the focus customer.`
    });
  }

  // ── 3. Structuring tells ───────────────────────────────────────────
  // A TRANSACTS_WITH edge whose total amount lands in $9,000–$9,999
  // with multiple txns is the textbook structuring signal.
  for (const l of links) {
    if (l.type !== 'TRANSACTS_WITH') continue;
    const amt = Number(l.total_amount) || 0;
    const cnt = Number(l.txn_count) || 0;
    if (amt < STRUCT_LOW || amt > STRUCT_HIGH) continue;
    if (cnt < 2) continue;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    const otherId = s === focusId ? t : s;
    const other = nodes.find(n => n.id === otherId);
    matches.push({
      id: `struct-${s}-${t}`,
      kind: 'structuring',
      label: `Possible structuring: ${other?.label || otherId}`,
      severity: 'high',
      summary: `${cnt} txns totalling $${Math.round(amt).toLocaleString()} (just under $10k CTR threshold)`,
      nodeIds: focusId ? [focusId, otherId] : [otherId],
      edgeKeys: [linkPairKey(s, t)],
      evidence: `Transactions with "${other?.label || otherId}" total $${Math.round(amt).toLocaleString()} across ${cnt} payments — sitting just below the $10,000 CTR filing threshold. Classic structuring pattern.`
    });
  }

  // ── 4. Fan-out from focus ──────────────────────────────────────────
  if (focusId) {
    const focusCounterparties = nodes.filter(n => n.is_counterparty);
    if (focusCounterparties.length >= FAN_OUT_THRESHOLD) {
      matches.push({
        id: 'fan-out',
        kind: 'fan_out',
        label: `Fan-out: ${focusCounterparties.length} distinct counterparties`,
        severity: focusCounterparties.length >= 12 ? 'high' : 'medium',
        summary: 'Money disperses across many counterparties',
        nodeIds: [focusId, ...focusCounterparties.map(n => n.id).slice(0, 25)],
        edgeKeys: [],
        evidence: `Focus customer transacts with ${focusCounterparties.length} counterparties in the visible window — review for layering or mule-account dispersion.`
      });
    }
  }

  // ── 5. Bidirectional pairs at meaningful volume ────────────────────
  for (const l of links) {
    if (l.type !== 'TRANSACTS_WITH') continue;
    if (l.direction !== 'bidirectional') continue;
    const inflow  = Number(l.inflow_amount)  || 0;
    const outflow = Number(l.outflow_amount) || 0;
    if (inflow < 5_000 || outflow < 5_000) continue;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    const otherId = s === focusId ? t : s;
    const other = nodes.find(n => n.id === otherId);
    matches.push({
      id: `uturn-${s}-${t}`,
      kind: 'bidirectional_pair',
      label: `U-turn flow: ${other?.label || otherId}`,
      severity: 'medium',
      summary: `Sends $${Math.round(outflow).toLocaleString()} and receives $${Math.round(inflow).toLocaleString()}`,
      nodeIds: focusId ? [focusId, otherId] : [otherId],
      edgeKeys: [linkPairKey(s, t)],
      evidence: `Two-way transfers with "${other?.label || otherId}" at material volume (in $${Math.round(inflow).toLocaleString()} / out $${Math.round(outflow).toLocaleString()}) — possible round-tripping or pass-through pattern.`
    });
  }

  // Highest-severity first; structuring + sanctions consistently lead.
  const order = { high: 0, medium: 1, low: 2 };
  matches.sort((a, b) => (order[a.severity] - order[b.severity]));
  return matches;
}
