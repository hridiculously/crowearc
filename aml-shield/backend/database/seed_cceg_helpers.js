// ═══════════════════════════════════════════════════════════════════════════
// Small shape factories shared by seed_cceg_fixtures.js. Kept separate so
// the fixture data file reads as a topology spec rather than as a wall of
// column-padding code.
// ═══════════════════════════════════════════════════════════════════════════

function customerShell(spec, referenceDate, addDays) {
  const incorp = '2018-01-15';
  const lastKyc = addDays(new Date(referenceDate), -120).toISOString().slice(0, 10);
  const nextKyc = addDays(new Date(lastKyc), 730).toISOString().slice(0, 10);
  return {
    customer_id: spec.id,
    customer_name: spec.name,
    customer_type: 'Corporate',
    segment: spec.segment,
    customer_risk_rating: spec.risk || 'Medium',
    pep_match: 0,
    sanctions_match: 0,
    kyc_review_status: 'Up to date',
    date_of_birth: null,
    nationality: 'United States',
    government_id_type: 'EIN',
    government_id_number: `00-${spec.id.replace(/\D/g, '').slice(-7).padStart(7, '0')}`,
    customer_since_date: incorp,
    residential_address: `100 Trade Center, New York, NY, United States`,
    mailing_address: null,
    country_of_residence: 'United States',
    phone_number: '+1 212 555 0100',
    email_address: `compliance@${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example`,
    last_kyc_review_date: lastKyc,
    next_kyc_due_date: nextKyc,
    cdd_level: spec.risk === 'High' ? 'Enhanced' : 'Standard',
    trading_name: spec.name,
    registration_number: `US-${spec.id.replace(/\D/g, '').slice(-6).padStart(6, '0')}`,
    date_of_incorporation: incorp,
    country_of_incorporation: 'United States',
    business_type: 'Corporation',
    industry: spec.segment,
    naics_code: '5239',
    annual_turnover_range: '$25M – $100M',
    number_of_employees: 250,
    beneficial_owners: JSON.stringify([
      { name: 'Pat Anderson', pct: 60, nationality: 'United States' },
      { name: 'Drew Beckett',  pct: 25, nationality: 'United States' }
    ]),
    directors: JSON.stringify(['Pat Anderson', 'Drew Beckett']),
    employer_name: null,
    job_title: null,
    employment_type: null,
    annual_income_range: null,
    source_of_funds: 'Business revenue',
    source_of_wealth: 'Operating profits',
    expected_monthly_volume: 200,
    expected_monthly_value: 5_000_000,
    expected_transaction_types: JSON.stringify(['Wire transfer (outbound)', 'Wire transfer (inbound)']),
    primary_countries: JSON.stringify(['United States', 'United Kingdom', 'Singapore']),
    onboarding_notes: `CCEG demo fixture: ${spec.name} (${spec.segment}).`
  };
}

function accountShell(customerId) {
  return {
    account_number: `ACC${customerId.replace(/[^A-Z0-9]/g, '')}001`,
    account_type: 'Current Account',
    currency: 'USD',
    status: 'Active',
    current_balance: 1_500_000
  };
}

function txn({ idn, account_number, customer_id, txn_date, amount, is_credit, counterparty }) {
  return {
    transaction_id: `TXN${String(idn).padStart(8, '0')}`,
    account_number,
    customer_id,
    txn_date,
    txn_time: '10:30',
    txn_type: is_credit ? 'Credit' : 'Debit',
    channel: 'Wire',
    description: `${is_credit ? 'Inbound' : 'Outbound'} wire — ${counterparty}`,
    counterparty,
    counterparty_country: 'United States',
    amount
  };
}

module.exports = { customerShell, accountShell, txn };
