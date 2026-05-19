// ═══════════════════════════════════════════════════════════════════════════
// graphAnnotations — analyst-pinned notes on CCEG graph nodes / edges.
//
//   GET  /api/graph-annotations/:alert_id   list all annotations on an alert
//   POST /api/graph-annotations             create a new annotation
//   DELETE /api/graph-annotations/:id       remove one (creator or manager)
//
// All writes audit to the alert (entity_type=alert) so the audit trail
// captures the annotation lifecycle alongside other case events.
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const pool = require('../database/db');
const { logAudit, ENTITY_TYPES } = require('../utils/audit');
const { requireAnyAnalyst } = require('../middleware/roleGuard');

const router = express.Router();

router.get('/:alert_id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, alert_id, target_type, target_id, text, color, created_by, created_at
         FROM case_graph_annotations
        WHERE alert_id = $1
        ORDER BY created_at DESC`,
      [req.params.alert_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireAnyAnalyst, async (req, res, next) => {
  try {
    const { alert_id, target_type, target_id, text, color, created_by } = req.body;
    if (!alert_id || !target_type || !target_id || !text) {
      return res.status(400).json({ error: 'alert_id, target_type, target_id and text are required' });
    }
    if (!['node', 'edge', 'region'].includes(target_type)) {
      return res.status(400).json({ error: 'target_type must be one of: node, edge, region' });
    }
    const trimmed = String(text).trim().slice(0, 1000);
    if (!trimmed) return res.status(400).json({ error: 'text cannot be empty' });

    const result = await pool.query(
      `INSERT INTO case_graph_annotations
         (alert_id, target_type, target_id, text, color, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, alert_id, target_type, target_id, text, color, created_by, created_at`,
      [alert_id, target_type, target_id, trimmed, color || null, created_by || req.headers['x-user-name'] || 'system']
    );

    const preview = trimmed.slice(0, 50);
    await logAudit({
      entity_type: ENTITY_TYPES.ALERT, entity_id: alert_id,
      action: `Graph annotation added on ${target_type} ${target_id} — ${preview}${trimmed.length > 50 ? '…' : ''}`,
      performed_by: req.headers['x-user-name'] || created_by || 'system'
    });

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAnyAnalyst, async (req, res, next) => {
  try {
    const existing = await pool.query(
      'SELECT * FROM case_graph_annotations WHERE id = $1',
      [req.params.id]
    );
    const ann = existing.rows[0];
    if (!ann) return res.status(404).json({ error: 'Annotation not found' });

    // Only the creator or a manager can delete.
    const requesterRole = req.headers['x-user-role'];
    const requesterName = req.headers['x-user-name'];
    if (requesterRole !== 'compliance_manager' &&
        ann.created_by && requesterName !== ann.created_by) {
      return res.status(403).json({ error: 'Only the creator or a manager can delete this annotation' });
    }

    await pool.query('DELETE FROM case_graph_annotations WHERE id = $1', [req.params.id]);

    await logAudit({
      entity_type: ENTITY_TYPES.ALERT, entity_id: ann.alert_id,
      action: `Graph annotation removed (${ann.target_type} ${ann.target_id})`,
      performed_by: requesterName || 'system'
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
