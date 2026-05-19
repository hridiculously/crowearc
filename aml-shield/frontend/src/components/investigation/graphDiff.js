// ═══════════════════════════════════════════════════════════════════════════
// graphDiff — union + diff of two CCEG graph payloads.
//
// computeGraphDiff(baseData, compareData) → merged dataset where every
// node and link carries a `_diffStatus` of one of:
//
//   'removed'   — present in base but not in compare  (window A only)
//   'added'     — present in compare but not in base  (window B only)
//   'unchanged' — present in both, or one side is null (fallback to base)
//
// We diff by:
//   * nodes: node.id (the canvas ID)
//   * links: a normalised "source::target::type" key (lexically ordered
//     so direction symmetry doesn't flip the verdict)
//
// When compareData is null the function returns baseData unchanged (no
// `_diffStatus` set) so consumers can short-circuit by checking the
// presence of the field rather than running through a diff path.
//
// The returned dataset preserves baseData's `focus_id` and `meta`. Both
// snapshots' nodes are merged so the canvas can visualise removed
// entities; tagged links keep base values when present (so we don't
// drop alert / amount details from the base series).
// ═══════════════════════════════════════════════════════════════════════════

function linkKey(link) {
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  const a = String(s), b = String(t);
  const ordered = a < b ? `${a}::${b}` : `${b}::${a}`;
  return `${ordered}::${link.type || ''}`;
}

export function computeGraphDiff(baseData, compareData) {
  if (!compareData) return baseData;
  if (!baseData)    return compareData;

  // Nodes — index both sides by ID, then walk the union.
  const baseNodeById    = new Map((baseData.nodes    || []).map(n => [n.id, n]));
  const compareNodeById = new Map((compareData.nodes || []).map(n => [n.id, n]));
  const allNodeIds = new Set([...baseNodeById.keys(), ...compareNodeById.keys()]);

  const mergedNodes = [];
  for (const id of allNodeIds) {
    const inBase    = baseNodeById.has(id);
    const inCompare = compareNodeById.has(id);
    const src = inBase ? baseNodeById.get(id) : compareNodeById.get(id);
    let status;
    if (inBase && inCompare) status = 'unchanged';
    else if (inBase)         status = 'removed';     // only in window A
    else                     status = 'added';       // only in window B
    mergedNodes.push({ ...src, _diffStatus: status });
  }

  // Links — same approach with the normalised key.
  const baseLinkByKey    = new Map((baseData.links    || []).map(l => [linkKey(l), l]));
  const compareLinkByKey = new Map((compareData.links || []).map(l => [linkKey(l), l]));
  const allLinkKeys = new Set([...baseLinkByKey.keys(), ...compareLinkByKey.keys()]);

  const mergedLinks = [];
  for (const k of allLinkKeys) {
    const inBase    = baseLinkByKey.has(k);
    const inCompare = compareLinkByKey.has(k);
    const src = inBase ? baseLinkByKey.get(k) : compareLinkByKey.get(k);
    let status;
    if (inBase && inCompare) status = 'unchanged';
    else if (inBase)         status = 'removed';
    else                     status = 'added';
    mergedLinks.push({ ...src, _diffStatus: status });
  }

  return {
    ...baseData,
    nodes: mergedNodes,
    links: mergedLinks,
    meta: {
      ...(baseData.meta || {}),
      compareApplied: true,
      compareCounts: {
        addedNodes:    mergedNodes.filter(n => n._diffStatus === 'added').length,
        removedNodes:  mergedNodes.filter(n => n._diffStatus === 'removed').length,
        unchangedNodes: mergedNodes.filter(n => n._diffStatus === 'unchanged').length,
        addedLinks:    mergedLinks.filter(l => l._diffStatus === 'added').length,
        removedLinks:  mergedLinks.filter(l => l._diffStatus === 'removed').length
      }
    }
  };
}
