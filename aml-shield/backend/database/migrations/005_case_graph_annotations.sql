-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005 — Case Graph Annotations (CCEG Part 12)
--
-- Lets analysts pin free-text notes to nodes / edges within the CCEG graph,
-- scoped to a specific alert (case). Annotations are persistent and shared
-- across users on the same alert, so a reviewer / L2 / approver sees the
-- preparer's reasoning trail on the graph itself instead of having to
-- reconstruct it from the case notes feed.
--
-- Schema notes:
--   * `alert_id` is TEXT to match the existing convention used by
--     case_notes, case_documents, sar_filings, etc.
--   * `target_type` is constrained to the three things we actually pin
--     to today; CHECK is preferred over ENUM so it can be widened later
--     without a type alter.
--   * `target_id` carries the canvas node ID for nodes (e.g. "c-CUST-0001",
--     "cp-counterparty-uuid", "acc-12") or the synthetic "src::tgt" key
--     for edges. The frontend builds the key, the backend just stores it.
--   * `color` is a free-form hex string so the annotator can group notes
--     by colour without a hard-coded palette in the schema.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS guards.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS case_graph_annotations (
  id          SERIAL PRIMARY KEY,
  alert_id    TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('node', 'edge', 'region')),
  target_id   TEXT NOT NULL,
  text        TEXT NOT NULL,
  color       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_graph_annotations_alert
  ON case_graph_annotations(alert_id);

CREATE INDEX IF NOT EXISTS idx_case_graph_annotations_target
  ON case_graph_annotations(alert_id, target_type, target_id);
