// ═══════════════════════════════════════════════════════════════════════════
// CCEG fixture seeder — three topology-specific demo customers used to
// exercise the entity-network modal on networks the default NovaBit
// Exchange fixture doesn't cover:
//
//   DENSE   — 40+ counterparties with several CO_OCCURS_WITH clusters
//             (6+ members each). Tests that the radial layout doesn't
//             collapse on a node-heavy fan.
//   HUB     — one central counterparty shared with 25+ neighbour
//             customers, sparse otherwise. Tests the layout on a true
//             hub-and-spoke shape with a single dominant node.
//   CHAIN   — long handoff chain of 10+ counterparties + 10 neighbour
//             customers, each pair sharing exactly one counterparty.
//             Tests the layout on a sparse network where neighbour
//             customers form a sequence rather than a starburst.
//
// All amounts / dates are derived from the existing rng() helper for
// determinism, so the fixtures regenerate identically on every
// `npm run seed`.
//
// Customer IDs use the CUS-FX-{TOPOLOGY}-{NN} convention so they're
// easy to spot in /customers and to deep-link to from doc samples.
// ═══════════════════════════════════════════════════════════════════════════

const { customerShell, accountShell, txn } = require('./seed_cceg_helpers.js');

// ─── Fixture specifications ────────────────────────────────────────────────

const DENSE = {
  focus: { id: 'CUS-FX-DENSE-001', name: 'Atlas Capital Holdings', segment: 'FX Trading', risk: 'High' },
  neighbours: [
    { id: 'CUS-FX-DENSE-N01', name: 'Meridian FX Partners',     segment: 'FX Trading'   },
    { id: 'CUS-FX-DENSE-N02', name: 'Sterling Bullion Ltd',     segment: 'FX Trading'   },
    { id: 'CUS-FX-DENSE-N03', name: 'Orient Currency House',    segment: 'FX Trading'   },
    { id: 'CUS-FX-DENSE-N04', name: 'Coastline Commodities Co', segment: 'Trade Finance' },
    { id: 'CUS-FX-DENSE-N05', name: 'Highland Forex Brokers',   segment: 'FX Trading'   },
    { id: 'CUS-FX-DENSE-N06', name: 'Atlantic Trade Desk LLP',  segment: 'Trade Finance' }
  ],
  // 42 counterparties; 8 are shared (appear in neighbours' txn lists too).
  counterparties: {
    unique: [
      'Bluewater Maritime', 'Crescent Refining', 'Dorado Energy', 'Equinox Metals',
      'Forge Industrial', 'Garnet Mining', 'Helios Solar Group', 'Indigo Textiles',
      'Juniper Aerospace', 'Kestrel Defence', 'Lumen Optics', 'Maple Hill Pharma',
      'Nimbus Cloud Svcs', 'Obsidian Storage', 'Polaris Maritime', 'Quartz Properties',
      'Rivermark Hospitality', 'Saffron Spice Trading', 'Tempest Wind Farms', 'Umber Logistics',
      'Vermilion Auto Parts', 'Willow Creek Dairy', 'Xenon Lighting', 'Yarrow Health',
      'Zenith Bearings', 'Alabaster Stone Co', 'Birchwood Lumber', 'Cinder Hardware',
      'Driftwood Boats', 'Ember Foundry', 'Fjord Shipping', 'Glacier Cold Chain',
      'Hawthorn Distilling', 'Ivory Coast Cocoa'                              // 34 unique
    ],
    shared: [
      'Pacific Holdings Group',    // shared with N01, N02
      'Crimson Trade Services',    // shared with N01, N03
      'Sapphire Logistics',        // shared with N02, N04
      'Onyx Customs Brokers',      // shared with N03, N05
      'Aurora Bank Correspondents',// shared with all neighbours
      'Granite Wealth Mgmt',       // shared with N04, N06
      'Iron Mountain Storage',     // shared with N05, N06
      'Silvercrest Holdings'       // shared with N01, N06
    ]
  }
};

const HUB = {
  focus: { id: 'CUS-FX-HUB-001', name: 'Pinnacle Holdings Group', segment: 'Conglomerate', risk: 'High' },
  // 12 neighbour customers all transacting through the same hub counterparty.
  neighbours: Array.from({ length: 12 }, (_, i) => ({
    id: `CUS-FX-HUB-N${String(i + 1).padStart(2, '0')}`,
    name: `Pinnacle Subsidiary ${String.fromCharCode(65 + i)}`,
    segment: 'Subsidiary Treasury'
  })),
  // 26 counterparties; the first is the hub (shared with every neighbour).
  counterparties: {
    hub: 'Pinnacle Group Treasury',
    leaves: [
      'Westshore Logistics Ltd', 'Northbeam Construction', 'Eastlight Energy',
      'Southport Cargo Co', 'Mainstream Insurance', 'Cornerstone Materials',
      'Brightline Pharma', 'Clearwater Capital', 'Deltawing Aerospace',
      'Edgemoor Imports', 'Frostpeak Refrigeration', 'Greenleaf Agritech',
      'Headland Mining', 'Ironcrest Foundries', 'Jadewood Furnishings',
      'Keystone Beverages', 'Linden Apparel', 'Marshfield Hardware',
      'Nightingale Health', 'Oakridge Plastics', 'Pinewood Lumber',
      'Quarrydale Cement', 'Redbank Steel', 'Sandcastle Resorts',
      'Tidemark Transport'  // 25 leaves
    ]
  }
};

const CHAIN = {
  focus: { id: 'CUS-FX-CHAIN-001', name: 'Cascade Logistics Inc', segment: 'Trade Finance', risk: 'Medium' },
  // 10 neighbour customers; each shares exactly one counterparty with the
  // PREVIOUS customer in the chain, forming a sequence:
  //   focus ─ A1 ─ N01 ─ A2 ─ N02 ─ A3 ─ N03 ─ … ─ A10 ─ N10
  neighbours: Array.from({ length: 10 }, (_, i) => ({
    id: `CUS-FX-CHAIN-N${String(i + 1).padStart(2, '0')}`,
    name: `Chain Customer ${i + 1}`,
    segment: 'Trade Finance'
  })),
  // 12 counterparties: 11 chain links + 1 private (focus-only) for visual density.
  counterparties: {
    private: ['Cascade Internal Settlements'],
    chainLinks: [
      'Anchor Bond Trustees',     // focus ⟷ N01
      'Beacon Customs Clearance', // N01   ⟷ N02
      'Citadel Inspection Svcs',  // N02   ⟷ N03
      'Driftnet Shipping Co',     // N03   ⟷ N04
      'Endeavour Marine Stores',  // N04   ⟷ N05
      'Foundry Bills Discount',   // N05   ⟷ N06
      'Gateway Port Authority',   // N06   ⟷ N07
      'Harbour Surveyors LLP',    // N07   ⟷ N08
      'Ironside Hedge Brokers',   // N08   ⟷ N09
      'Jetstream Reinsurance',    // N09   ⟷ N10
      'Kelvin Storage Bonded'     // N10   ⟷ (terminal)
    ]
  }
};

// ─── Seeder ─────────────────────────────────────────────────────────────────

async function seedCcegFixtures(client, rngFactory, helpers) {
  const { iso, addDays, REFERENCE_DATE } = helpers;
  console.log('[seed] cceg fixtures — dense / hub / chain');

  let txnCounter = 90_000_000;   // reserve a high range so it doesn't collide
                                  // with the main loop's TXN id counter.

  // ─── Helper: insert a customer + an account ──────────────────────────────
  async function insertCustomer(spec) {
    const c = customerShell(spec, REFERENCE_DATE, addDays);
    await client.query(`
      INSERT INTO customers (
        customer_id, customer_name, customer_type, segment, customer_risk_rating,
        pep_match, sanctions_match, kyc_review_status,
        date_of_birth, nationality, government_id_type, government_id_number, customer_since_date,
        residential_address, mailing_address, country_of_residence, phone_number, email_address,
        last_kyc_review_date, next_kyc_due_date, cdd_level,
        trading_name, registration_number, date_of_incorporation, country_of_incorporation,
        business_type, industry, naics_code, annual_turnover_range, number_of_employees,
        beneficial_owners, directors,
        employer_name, job_title, employment_type, annual_income_range,
        source_of_funds, source_of_wealth,
        expected_monthly_volume, expected_monthly_value, expected_transaction_types,
        primary_countries, onboarding_notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43
      )
    `, [
      c.customer_id, c.customer_name, c.customer_type, c.segment, c.customer_risk_rating,
      c.pep_match, c.sanctions_match, c.kyc_review_status,
      c.date_of_birth, c.nationality, c.government_id_type, c.government_id_number, c.customer_since_date,
      c.residential_address, c.mailing_address, c.country_of_residence, c.phone_number, c.email_address,
      c.last_kyc_review_date, c.next_kyc_due_date, c.cdd_level,
      c.trading_name, c.registration_number, c.date_of_incorporation, c.country_of_incorporation,
      c.business_type, c.industry, c.naics_code, c.annual_turnover_range, c.number_of_employees,
      c.beneficial_owners, c.directors,
      c.employer_name, c.job_title, c.employment_type, c.annual_income_range,
      c.source_of_funds, c.source_of_wealth,
      c.expected_monthly_volume, c.expected_monthly_value, c.expected_transaction_types,
      c.primary_countries, c.onboarding_notes
    ]);
    const acct = accountShell(spec.id);
    await client.query(
      `INSERT INTO accounts (account_number, customer_id, account_type, currency, status, opened_date, current_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [acct.account_number, c.customer_id, acct.account_type, acct.currency, acct.status, c.date_of_incorporation, acct.current_balance]
    );
    return acct.account_number;
  }

  // ─── Helper: insert N transactions for a customer ────────────────────────
  async function insertTxns(customerId, accountNumber, counterparties, r) {
    let running = 500_000;
    for (let i = 0; i < counterparties.length; i++) {
      const cp = counterparties[i];
      const days = Math.floor(r() * 90);
      const t = txn({
        idn: ++txnCounter,
        account_number: accountNumber,
        customer_id: customerId,
        txn_date: iso(addDays(new Date(REFERENCE_DATE), -days)),
        amount: Math.round(20_000 + r() * 480_000),
        is_credit: r() > 0.5,
        counterparty: cp
      });
      running += t.txn_type === 'Credit' ? t.amount : -t.amount;
      await client.query(`
        INSERT INTO transactions (
          transaction_id, account_number, customer_id, txn_date, txn_time,
          txn_type, channel, description, counterparty, counterparty_country,
          amount, running_balance, is_alerted, alert_id,
          scenario_triggered, rule_breached, risk_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        t.transaction_id, t.account_number, t.customer_id, t.txn_date, t.txn_time,
        t.txn_type, t.channel, t.description, t.counterparty, t.counterparty_country,
        t.amount, running, 0, null, null, null, null
      ]);
    }
  }

  // ─── DENSE ───────────────────────────────────────────────────────────────
  {
    const focusAcct = await insertCustomer(DENSE.focus);
    const focusCps = [
      ...DENSE.counterparties.unique,
      ...DENSE.counterparties.shared,
      // Volume — each shared CP gets 3 txns from the focus to make it a hub.
      ...DENSE.counterparties.shared,
      ...DENSE.counterparties.shared
    ];
    await insertTxns(DENSE.focus.id, focusAcct, focusCps, rngFactory('dense-focus'));

    // Each neighbour customer shares a curated subset of the 8 shared CPs.
    const neighbourCps = {
      'CUS-FX-DENSE-N01': ['Pacific Holdings Group', 'Crimson Trade Services', 'Aurora Bank Correspondents', 'Silvercrest Holdings'],
      'CUS-FX-DENSE-N02': ['Pacific Holdings Group', 'Sapphire Logistics',     'Aurora Bank Correspondents'],
      'CUS-FX-DENSE-N03': ['Crimson Trade Services', 'Onyx Customs Brokers',   'Aurora Bank Correspondents'],
      'CUS-FX-DENSE-N04': ['Sapphire Logistics',     'Granite Wealth Mgmt',    'Aurora Bank Correspondents'],
      'CUS-FX-DENSE-N05': ['Onyx Customs Brokers',   'Iron Mountain Storage',  'Aurora Bank Correspondents'],
      'CUS-FX-DENSE-N06': ['Granite Wealth Mgmt',    'Iron Mountain Storage',  'Silvercrest Holdings', 'Aurora Bank Correspondents']
    };
    for (const n of DENSE.neighbours) {
      const acct = await insertCustomer(n);
      const cps = [...neighbourCps[n.id], ...neighbourCps[n.id], ...neighbourCps[n.id]]; // 3 txns each
      await insertTxns(n.id, acct, cps, rngFactory('dense-' + n.id));
    }
  }

  // ─── HUB ─────────────────────────────────────────────────────────────────
  {
    const focusAcct = await insertCustomer(HUB.focus);
    // Focus customer: 25 leaf CPs (one txn each) + 40 txns through the hub.
    const focusCps = [
      ...HUB.counterparties.leaves,
      ...Array(40).fill(HUB.counterparties.hub)
    ];
    await insertTxns(HUB.focus.id, focusAcct, focusCps, rngFactory('hub-focus'));

    // Every neighbour customer transacts ONLY through the hub.
    for (const n of HUB.neighbours) {
      const acct = await insertCustomer(n);
      const cps = Array(5).fill(HUB.counterparties.hub);
      await insertTxns(n.id, acct, cps, rngFactory('hub-' + n.id));
    }
  }

  // ─── CHAIN ───────────────────────────────────────────────────────────────
  {
    const focusAcct = await insertCustomer(CHAIN.focus);
    // Focus customer: the first chain link CP (Anchor Bond Trustees) +
    // a few private internal-settlement entries for visual density.
    const focusCps = [
      ...Array(8).fill(CHAIN.counterparties.chainLinks[0]),  // Anchor — shared with N01
      ...Array(6).fill(CHAIN.counterparties.private[0])       // Cascade Internal Settlements
    ];
    await insertTxns(CHAIN.focus.id, focusAcct, focusCps, rngFactory('chain-focus'));

    // Each neighbour Nk shares chainLinks[k-1] with the previous customer
    // and chainLinks[k] with the next. The last neighbour (N10) also
    // touches Kelvin Storage Bonded (chainLinks[10]) as its terminal CP.
    for (let k = 0; k < CHAIN.neighbours.length; k++) {
      const n = CHAIN.neighbours[k];
      const acct = await insertCustomer(n);
      const prev = CHAIN.counterparties.chainLinks[k];       // shared with Nk-1 (or focus)
      const next = CHAIN.counterparties.chainLinks[k + 1];   // shared with Nk+1
      const cps = [
        ...Array(5).fill(prev),
        ...Array(5).fill(next)
      ];
      await insertTxns(n.id, acct, cps, rngFactory('chain-' + n.id));
    }
  }

  console.log('[seed] cceg fixtures complete — 3 focus + 28 neighbour customers');
}

module.exports = { seedCcegFixtures };
