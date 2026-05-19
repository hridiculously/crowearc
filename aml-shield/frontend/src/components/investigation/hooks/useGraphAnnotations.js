// ═══════════════════════════════════════════════════════════════════════════
// useGraphAnnotations — analyst-pinned notes on the CCEG canvas.
//
// Scoped to an alertId. When the modal is opened from a non-alert surface
// (e.g. a customer profile), the hook returns a no-op shell so the caller
// doesn't have to branch.
//
// State:
//   * annotations    — array of rows from /api/graph-annotations/:alert_id
//   * byTargetKey    — Map<targetKey, annotation[]> for O(1) canvas lookup
//
// Actions:
//   * addAnnotation({ target_type, target_id, text, color })
//   * removeAnnotation(id)
//   * refresh()
//
// targetKey scheme:
//   * node:  node.id  (e.g. "c-CUST-0001", "cp-...", "acc-12", "alert-A-1")
//   * edge:  `${source}::${target}`  (canonical order: lexically smaller first)
//   * region: a free string the caller defines (region selections, future)
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../api/client.js';

export function edgeKey(s, t) {
  const a = String(s), b = String(t);
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function useGraphAnnotations(alertId, userName) {
  const [annotations, setAnnotations] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!alertId) { setAnnotations([]); return; }
    try {
      setLoading(true);
      const r = await api.get(`/graph-annotations/${encodeURIComponent(alertId)}`);
      setAnnotations(Array.isArray(r.data) ? r.data : []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load annotations');
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addAnnotation = useCallback(async ({ target_type, target_id, text, color }) => {
    if (!alertId) return { ok: false, error: 'No alert in scope' };
    try {
      const r = await api.post('/graph-annotations', {
        alert_id: alertId,
        target_type, target_id, text,
        color: color || null,
        created_by: userName || null
      });
      setAnnotations(prev => [r.data, ...prev]);
      return { ok: true, data: r.data };
    } catch (err) {
      return { ok: false, error: err.response?.data?.error || err.message || 'Save failed' };
    }
  }, [alertId, userName]);

  const removeAnnotation = useCallback(async (id) => {
    try {
      await api.delete(`/graph-annotations/${id}`);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.response?.data?.error || err.message || 'Delete failed' };
    }
  }, []);

  // Build target-key → annotation[] map for quick canvas badge lookup.
  const byTargetKey = useMemo(() => {
    const m = new Map();
    for (const a of annotations) {
      const key = a.target_type === 'node'
        ? a.target_id
        : a.target_type === 'edge'
          ? a.target_id            // already in "src::tgt" form
          : a.target_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(a);
    }
    return m;
  }, [annotations]);

  return {
    annotations, byTargetKey,
    loading, error,
    addAnnotation, removeAnnotation, refresh,
    enabled: !!alertId
  };
}
