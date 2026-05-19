// ═══════════════════════════════════════════════════════════════════════════
// Integration tests for routes/graphAnnotations.js (CCEG Part 12 backend).
//
// Mocks pg.Pool and the audit logger, then exercises the route with
// supertest and the four role headers. Covers validation, happy paths,
// and the creator-or-manager DELETE guard.
// ═══════════════════════════════════════════════════════════════════════════

const mockQuery = jest.fn();
jest.mock('../database/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(),
  on: jest.fn()
}));

const mockLogAudit = jest.fn();
jest.mock('../utils/audit', () => ({
  logAudit: (...args) => mockLogAudit(...args),
  ENTITY_TYPES: { ALERT: 'alert' }
}));

const express = require('express');
const request = require('supertest');
const router = require('./graphAnnotations');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/graph-annotations', router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockLogAudit.mockReset();
});

// ─── GET ─────────────────────────────────────────────────────────────────
test('GET /:alert_id returns the rows from the DB', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [
    { id: 1, alert_id: 'A-1', target_type: 'node', target_id: 'c-1', text: 'note', color: '#F59E0B', created_by: 'henry', created_at: '2026-05-19T00:00:00Z' }
  ] });
  const res = await request(buildApp()).get('/api/graph-annotations/A-1');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].alert_id).toBe('A-1');
  // Query was the alert-scoped SELECT.
  expect(mockQuery.mock.calls[0][0]).toMatch(/FROM case_graph_annotations/);
  expect(mockQuery.mock.calls[0][1]).toEqual(['A-1']);
});

// ─── POST validation ─────────────────────────────────────────────────────
test('POST returns 400 when required fields are missing', async () => {
  const res = await request(buildApp())
    .post('/api/graph-annotations')
    .set('x-user-role', 'analyst_l1')
    .send({ alert_id: 'A-1', target_type: 'node' });   // no target_id / text
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/required/);
});

test('POST returns 400 for an unsupported target_type', async () => {
  const res = await request(buildApp())
    .post('/api/graph-annotations')
    .set('x-user-role', 'analyst_l1')
    .send({ alert_id: 'A-1', target_type: 'cluster', target_id: 'x', text: 'note' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/target_type must be one of/);
});

test('POST returns 401 when no role header is present (roleGuard)', async () => {
  const res = await request(buildApp())
    .post('/api/graph-annotations')
    .send({ alert_id: 'A-1', target_type: 'node', target_id: 'c-1', text: 'note' });
  expect(res.status).toBe(401);
});

// ─── POST happy path ─────────────────────────────────────────────────────
test('POST persists and audits an annotation', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    id: 42, alert_id: 'A-1', target_type: 'node', target_id: 'c-1',
    text: 'high risk signal', color: '#DC2626', created_by: 'henry',
    created_at: '2026-05-19T00:00:00Z'
  }] });
  const res = await request(buildApp())
    .post('/api/graph-annotations')
    .set('x-user-role', 'analyst_l1')
    .set('x-user-name', 'henry')
    .send({ alert_id: 'A-1', target_type: 'node', target_id: 'c-1', text: 'high risk signal', color: '#DC2626' });
  expect(res.status).toBe(201);
  expect(res.body.id).toBe(42);
  expect(mockLogAudit).toHaveBeenCalledTimes(1);
  expect(mockLogAudit.mock.calls[0][0]).toMatchObject({
    entity_type: 'alert',
    entity_id: 'A-1',
    performed_by: 'henry'
  });
});

// ─── DELETE guards ───────────────────────────────────────────────────────
test('DELETE returns 404 when the row does not exist', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });   // SELECT returns nothing
  const res = await request(buildApp())
    .delete('/api/graph-annotations/999')
    .set('x-user-role', 'analyst_l1')
    .set('x-user-name', 'henry');
  expect(res.status).toBe(404);
});

test('DELETE returns 403 when caller is neither creator nor manager', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    id: 7, alert_id: 'A-1', target_type: 'node', target_id: 'c-1',
    text: 'x', created_by: 'henry'
  }] });
  const res = await request(buildApp())
    .delete('/api/graph-annotations/7')
    .set('x-user-role', 'analyst_l1')
    .set('x-user-name', 'olivia');   // different user, not a manager
  expect(res.status).toBe(403);
});

test('DELETE succeeds for the creator and writes an audit row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    id: 7, alert_id: 'A-1', target_type: 'node', target_id: 'c-1',
    text: 'x', created_by: 'henry'
  }] });
  mockQuery.mockResolvedValueOnce({});   // the DELETE
  const res = await request(buildApp())
    .delete('/api/graph-annotations/7')
    .set('x-user-role', 'analyst_l1')
    .set('x-user-name', 'henry');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
  expect(mockLogAudit).toHaveBeenCalled();
});

test('DELETE succeeds for a compliance_manager even when not the creator', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{
    id: 7, alert_id: 'A-1', target_type: 'node', target_id: 'c-1',
    text: 'x', created_by: 'henry'
  }] });
  mockQuery.mockResolvedValueOnce({});   // the DELETE
  const res = await request(buildApp())
    .delete('/api/graph-annotations/7')
    .set('x-user-role', 'compliance_manager')
    .set('x-user-name', 'olivia');
  expect(res.status).toBe(200);
});
