// ═══════════════════════════════════════════════════════════════════════════
// graphClusters — community detection for the Part 16 cluster overlay.
//
// We don't ship a full modularity-optimising solver (Louvain etc.) into
// the bundle — the value-to-weight tradeoff isn't there yet. Instead we
// run a connected-components pass over TRANSACTS_WITH + CO_OCCURS_WITH
// edges (the relationship edges, not the structural ACCOUNT edges) and
// colour each component from the HYPOTHESIS_COLOURS palette.
//
// computeClusters(displayData) → {
//   clusterByNodeId : Map<id, clusterId>,
//   colorByClusterId: Map<clusterId, hex>,
//   clusters        : array of { id, color, nodeIds, size }   (sorted desc)
// }
//
// Singleton clusters (one node, no edges) are dropped — they'd add noise
// without information. The focus node and any high-degree counterparty
// hubs become natural cluster centres just because they pull in more
// neighbours.
// ═══════════════════════════════════════════════════════════════════════════

import { HYPOTHESIS_COLOURS } from './graphHelpers.js';

const CLUSTER_LINK_TYPES = new Set([
  'TRANSACTS_WITH',
  'CO_OCCURS_WITH',
  'TRANSACTS_VIA'   // counts toward clustering when account nodes are on
]);

export function computeClusters(displayData) {
  const empty = {
    clusterByNodeId: new Map(),
    colorByClusterId: new Map(),
    clusters: []
  };
  if (!displayData?.nodes?.length) return empty;

  // Build undirected adjacency over the cluster-eligible edges.
  const adj = new Map();
  for (const n of displayData.nodes) adj.set(n.id, new Set());
  for (const l of displayData.links || []) {
    if (!CLUSTER_LINK_TYPES.has(l.type)) continue;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!adj.has(s) || !adj.has(t)) continue;
    adj.get(s).add(t);
    adj.get(t).add(s);
  }

  // BFS components.
  const clusterByNodeId = new Map();
  const componentList = [];
  let nextClusterId = 0;
  for (const start of adj.keys()) {
    if (clusterByNodeId.has(start)) continue;
    const queue = [start];
    const members = [];
    clusterByNodeId.set(start, nextClusterId);
    while (queue.length > 0) {
      const id = queue.shift();
      members.push(id);
      for (const neighbour of adj.get(id) || []) {
        if (clusterByNodeId.has(neighbour)) continue;
        clusterByNodeId.set(neighbour, nextClusterId);
        queue.push(neighbour);
      }
    }
    componentList.push({ id: nextClusterId, nodeIds: members, size: members.length });
    nextClusterId++;
  }

  // Drop singletons. Re-key clusters so the largest gets cluster 0
  // (and therefore the first palette colour).
  const meaningful = componentList
    .filter(c => c.size >= 2)
    .sort((a, b) => b.size - a.size);

  const colorByClusterId = new Map();
  const rekeyed = meaningful.map((c, i) => {
    const color = HYPOTHESIS_COLOURS[i % HYPOTHESIS_COLOURS.length];
    colorByClusterId.set(c.id, color);
    return { ...c, color };
  });

  return { clusterByNodeId, colorByClusterId, clusters: rekeyed };
}
