# CCEG layout — acceptance fixtures

This directory holds the visual acceptance evidence for the
Cross-Case Entity Graph (CCEG) modal across four topology shapes.
Before any buyer or partner demo, the graph must open readable on
first paint for every fixture below — no piling, no overlapping
labels, no nodes outside the viewport.

## The four fixtures

| Fixture | Topology | Customer ID | Why we test it |
|---|---|---|---|
| NovaBit Exchange | Default mid-density radial | (existing demo customer) | The shape we tuned the layout against |
| Atlas Capital Holdings | **Dense** — 40+ counterparties, several CO_OCCURS_WITH clusters | `CUS-FX-DENSE-001` | Stresses collide-force resolution under load |
| Pinnacle Holdings Group | **Hub** — 25+ leaves through one central counterparty + 12 neighbour customers | `CUS-FX-HUB-001` | Tests a true hub-and-spoke shape with one dominant node |
| Cascade Logistics Inc | **Chain** — 10 sequential CO_OCCURS_WITH handoffs across 10 neighbour customers | `CUS-FX-CHAIN-001` | Tests a sparse, sequenced network — the failure mode for radial pre-seeds |

The fixtures are seeded deterministically by
`backend/database/seed_cceg_fixtures.js`. Regenerate with
`npm run seed` from the backend directory.

## How to capture the screenshots

Each fixture needs **two** PNG screenshots at 1440×900 viewport:

* `<fixture>-before.png` — graph state without the Re-layout
  button being pressed (pure first-open).
* `<fixture>-after.png` — graph after one press of the
  Re-layout button.

Capture procedure (manual, since this isn't wired into CI yet):

1. Start the stack locally:
   ```
   cd aml-shield/backend  && npm run seed && npm start
   cd aml-shield/frontend && npm run dev
   ```
2. Open Chrome, set the window to 1440×900 (DevTools → "Toggle
   device toolbar" → "Responsive" → 1440 × 900).
3. Visit `http://localhost:5173/employee/customers/<customer_id>`
   for each fixture, log in as any L1 (e.g. `arjun.sharma` /
   `Arjun@123`).
4. On the customer profile, click **View Network**.
5. **Capture before:** wait until the modal warm-up finishes
   (~1 s) and the layout settles. Screenshot the full modal at
   1440×900. Save as `docs/cceg-acceptance/<fixture>-before.png`.
6. **Capture after:** click the **Re-layout** button (shuffle
   icon, group 1 in the toolbar). Wait for the warm-up to
   complete again. Screenshot. Save as `<fixture>-after.png`.

## Acceptance criteria — per-fixture

For each fixture, both screenshots must satisfy:

- No two node circles overlap or touch.
- Every node has a visible label (the focus + neighbour
  customers always; all other entity nodes if the zoom is
  ≥ 0.4 after auto-fit).
- The full network fits inside the 1440×900 viewport — no
  nodes clipped off the canvas edges.
- The Re-layout (`after`) screenshot's layout is visibly
  different from the `before` (different rotation; same
  topology preserved).
- Risk rings (red sanctions / violet PEP) render correctly on
  any flagged node.

If any fixture's `before` screenshot fails, the layout knobs
to revisit are documented in
`docs/cceg-acceptance/TOPOLOGY_OBSERVATIONS.md`.

## File naming

```
docs/cceg-acceptance/
├── README.md                        ← this file
├── TOPOLOGY_OBSERVATIONS.md         ← observed layout behaviour per shape
├── novabit-before.png
├── novabit-after.png
├── dense-before.png
├── dense-after.png
├── hub-before.png
├── hub-after.png
├── chain-before.png
└── chain-after.png
```
