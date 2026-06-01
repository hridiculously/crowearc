# CCEG topology observations

This document records what the layout pipeline does well, what it
struggles with, and where future tuning work should focus per
topology. Updated when a new fixture is added or a layout knob
changes.

**Current layout pipeline (as of this PR):**

* Deterministic pre-seed — focus at `(0,0)`, counterparties on an
  inner ring (`max(180, count × 24)`), neighbour customers on an
  outer ring at `innerR + 160` with a 0.5 rad offset
* d3-force config — `charge(-800)`, `link.distance(180)`,
  `forceCollide(radiusFor(n) + 20)`
* `warmupTicks: 250`, `cooldownTicks: 0` — 250 ticks invisible
  before first paint, no animated cooldown afterward
* Re-layout button bumps a rev counter that re-seeds with a
  rotation offset of `rev * 1.1357` rad

## Per-topology observations

### NovaBit Exchange (default mid-density radial)

* Counterparties: ~10–15
* Neighbours: 3–5
* **Layout works on first open.** The shape we tuned against.
* Re-layout produces a clearly distinct rotation.
* **No concerns.**

### Dense — Atlas Capital Holdings

* Counterparties: 42 (with 8 shared)
* Neighbour customers: 6
* **Expected risk:** the inner ring's `count × 24` formula
  produces a ring of radius ~1000, which is fine — but with
  42 nodes on the ring, the angular spacing is ~8.6° per node,
  borderline. If two adjacent CPs are large (high txn count
  → `radiusFor` returns ~15), their bodies + 20px padding
  may still touch under load.
* **Mitigations:**
  * Raise inner-ring `count × 24` to `count × 28` if the
    `before` screenshot shows touching circles.
  * Bump `forceCollide` padding from `+20` to `+24` for the
    same reason. Cheap.
  * If the warmup isn't enough to spread, bump `warmupTicks`
    from 250 → 350.

### Hub — Pinnacle Holdings Group

* Counterparties: 26 (1 hub + 25 leaves)
* Neighbour customers: 12 (all connected through the hub)
* **Expected risk:** the hub counterparty's
  `shared_with_customer_count` is high → `radiusFor` log-
  scales the node up. The hub node ends up larger than its
  neighbours. With the pre-seed placing it equidistantly with
  other CPs on the inner ring, the larger node may visually
  dominate one side.
* **Status:** acceptable. The hub being visibly larger is the
  desired signal — that's the whole point of log-scaled
  radius after retiring the violet ring. The 12 neighbour
  customers all collapse near the hub due to their single
  shared edge; outer-ring placement keeps them readable.
* **Mitigations if it fails:**
  * Increase outer-ring radius gap (`innerR + 160` →
    `innerR + 200`) so the hub-orbiting neighbour customers
    don't compete with the counterparties on the inner ring.

### Chain — Cascade Logistics Inc

* Counterparties: 12 (each shared with exactly one neighbour)
* Neighbour customers: 10 (sequential handoffs)
* **Expected risk: this is the failure mode for radial pre-
  seeds.** A truly linear chain wants a line layout, not a
  ring. The pre-seed places the 10 neighbour customers on
  an outer ring; the chain structure (each connected to the
  previous and the next via a shared CP) creates strong
  in-chain forces that the radial seed actively fights.
* **What I expect to see:** the simulation will try to
  straighten the chain into an arc on the outer ring. It
  should be readable but won't look like a true line — more
  like a horseshoe.
* **If the `before` screenshot shows a tangled chain:**
  this is the case where deeper algorithmic work is needed.
  Options for a follow-up:
  * Replace the outer-ring seed for chain-shaped networks
    with a tangential layout — but detecting a chain at
    seed time requires graph analysis.
  * Add a `linkStrength` boost for CO_OCCURS_WITH edges to
    pull chain neighbours into a tighter sequence.
  * Use the `Re-layout` button as the analyst's escape valve
    — pure-force layout from a fresh rotation may resolve
    into a usable shape.

## Re-layout button behaviour

* Each press clears all node x/y/fx/fy and bumps `layoutRev`.
* The pre-seed effect re-runs with a rotation offset of
  `layoutRev × 1.1357` rad — an irrational multiple of π so
  the eye reads each press as a distinct layout, not a
  rotation by a round fraction.
* The simulation re-heats via `d3ReheatSimulation()` and
  re-runs `warmupTicks: 250` invisible iterations before
  the next paint, then the auto-fit `onEngineStop` callback
  re-frames the network.

## Outstanding follow-ups (deferred — not part of this PR)

* True line layout for chain-shaped networks (auto-detect
  chain topology via average path length / clustering
  coefficient, switch pre-seed strategy)
* Configurable inner-ring radius from manager settings
  (`graph.layout.inner_ring_per_node`, default 24)
* Layout-change-on-resize: currently a window resize doesn't
  re-trigger the pre-seed; the layout stays at its initial
  scale. Low impact today.
