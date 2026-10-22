/* Doula's House — doula coverage data.
   HONESTY RULES: coverage for doula services changes often and differs by state, employer and plan.
   Everything here is compiled from public reporting (see SOURCES), is marked with a review date,
   and is never a promise of coverage. Always confirm with the plan before a visit is booked.
   Status values:  yes = a published benefit / rollout exists   some = select states or plans
                   varies = no standard benefit found; depends on the plan   */
(function (root) {
  const REVIEWED = '2026-10-15';

  const SOURCES = {
    /* Only nhelp has a verified deep link; the rest are citations to look up — add exact URLs before launch. */
    nhelp: { t: 'National Health Law Program — state doula Medicaid efforts', u: 'https://healthlaw.org/current-state-doula-medicaid-efforts/' },
    mhe: { t: 'Managed Healthcare Executive — Medicaid doula coverage, March 2026', u: null },
    nhelp_private: { t: 'NHeLP — private-insurance doula mandates, April 2025', u: null },
    uhc: { t: 'UnitedHealthcare — doula benefit announcement', u: null },
    elevance: { t: 'Elevance Health — Medicaid doula benefits', u: null },
    emblem: { t: 'EmblemHealth — doula coverage (NY)', u: null }
  };

  const INSURERS = [
    { id: 'medicaid', name: 'Medicaid (state programs)', short: 'MC', kind: 'Public', status: 'yes',
      headline: 'The main route to coverage today',
      detail: 'Public reporting in March 2026 counts 33 states plus DC that cover doula services or are implementing a benefit. Rules, rates and credentialing differ by state — and many require a provider recommendation.',
      src: ['mhe', 'nhelp'], ask: 'Does my state Medicaid plan cover doula services, and which doulas are enrolled?' },
    { id: 'uhc', name: 'UnitedHealthcare', short: 'UH', kind: 'National · commercial + Medicaid', status: 'yes',
      headline: 'Rolling out to employer plans',
      detail: 'Reported to be extending a doula benefit to employer-sponsored plans, reaching about 7.2 million members by January 1, 2027. Its Medicaid plans follow each state’s benefit. Whether your own employer plan includes it depends on the employer.',
      src: ['uhc'], ask: 'Does my employer’s UnitedHealthcare plan include the doula benefit, and from what date?' },
    { id: 'anthem', name: 'Anthem / Elevance Health', short: 'AN', kind: 'National · commercial + Medicaid', status: 'some',
      headline: 'Medicaid in about 10 states, plus select commercial plans',
      detail: 'Elevance reports doula benefits in Medicaid in roughly ten states, plus some commercial plans. Coverage is not uniform across its Blue Cross Blue Shield–branded markets.',
      src: ['elevance'], ask: 'Is a doula benefit included in my specific Anthem plan and state?' },
    { id: 'emblem', name: 'EmblemHealth (New York)', short: 'EM', kind: 'Regional · Medicaid + Essential Plan', status: 'yes',
      headline: 'Medicaid, HARP and Essential Plan — since April 1, 2025',
      detail: 'EmblemHealth added doula coverage across its New York Medicaid, HARP and Essential Plan products on April 1, 2025.',
      src: ['emblem'], ask: 'Which Emblem doulas are in network, and is a referral needed?' },
    { id: 'bcbs', name: 'Blue Cross Blue Shield', short: 'BC', kind: '33 independent companies', status: 'varies',
      headline: 'Varies by company and plan',
      detail: 'BCBS is a federation of independent companies, so there is no single national answer. Anthem (above) is one of them; others may cover doulas in some plans or states. We have not verified each one.',
      src: [], ask: 'Does my Blue Cross plan list doula services as a covered benefit?' },
    { id: 'aetna', name: 'Aetna (CVS Health)', short: 'AE', kind: 'National · commercial + Medicaid', status: 'varies',
      headline: 'No standard national benefit found',
      detail: 'We found no standard commercial doula benefit. Aetna’s Medicaid plans follow the state Medicaid benefit, so they can cover doulas where the state does.',
      src: [], ask: 'Does my Aetna plan cover doula services (CPT / HCPCS billing codes) — and is a referral required?' },
    { id: 'cigna', name: 'Cigna', short: 'CI', kind: 'National · commercial', status: 'varies',
      headline: 'No standard national benefit found',
      detail: 'We found no standard doula benefit. Some employer plans may add maternity-support benefits — ask your benefits team.',
      src: [], ask: 'Does my Cigna plan include doula or maternity-support benefits?' },
    { id: 'humana', name: 'Humana', short: 'HU', kind: 'National · Medicare + Medicaid', status: 'varies',
      headline: 'No standard national benefit found',
      detail: 'Mostly Medicare Advantage, so less relevant to pregnancy. Its Medicaid plans follow state benefits where they operate.',
      src: [], ask: 'Does my Humana Medicaid plan follow the state doula benefit?' },
    { id: 'kaiser', name: 'Kaiser Permanente', short: 'KP', kind: 'Regional · integrated', status: 'varies',
      headline: 'Varies by region; often delivered in-house',
      detail: 'Kaiser is an integrated system, so doula support is often arranged within its own maternity programs rather than billed by outside doulas. Ask your Kaiser region.',
      src: [], ask: 'Can I use an independent doula with my Kaiser plan, and is any doula support covered?' }
  ];

  /* Private-insurance state mandates (NHeLP, April 2025). */
  const PRIVATE_STATES = {
    RI: { s: 'in effect', note: 'Rhode Island requires some private plans to cover doula services.' },
    LA: { s: 'in effect', note: 'Louisiana requires some private plans to cover doula services.' },
    CO: { s: 'enacted · pending', note: 'Colorado has enacted a requirement that is not yet fully in effect.' },
    VA: { s: 'enacted · pending', note: 'Virginia has enacted a requirement that is not yet fully in effect.' },
    IL: { s: 'enacted · pending', note: 'Illinois has enacted a requirement that is not yet fully in effect.' },
    DE: { s: 'enacted · pending', note: 'Delaware has enacted a requirement that is not yet fully in effect.' }
  };

  /* States whose Medicaid doula benefits are long-standing and widely documented.
     This is NOT the full list — the count above is higher. Absence here means "unconfirmed", not "no". */
  const MEDICAID_WIDELY_REPORTED = ['CA', 'IL', 'MD', 'MI', 'MN', 'NJ', 'NY', 'OR', 'VA', 'WA'];

  const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

  const LABEL = {
    yes: { t: 'Supports doula services', cls: 'ok' },
    some: { t: 'Select plans or states', cls: 'info' },
    varies: { t: 'Varies · ask your plan', cls: 'warn' }
  };

  const DISCLAIMER = 'Coverage changes often and differs by state, employer and plan. This is a guide compiled from public reporting, not a guarantee of coverage or a determination of benefits. Confirm with your plan before booking.';

  /* check({insurer, state}) → { level: 'likely'|'possible'|'unknown', title, body, ask, src } */
  function check(q) {
    q = q || {};
    const ins = INSURERS.find((i) => i.id === q.insurer);
    const st = q.state || '';
    const stName = STATES[st] || '';
    const priv = PRIVATE_STATES[st];
    if (!ins) return { level: 'unknown', title: 'Choose a plan', body: 'Pick your insurer to see what we know.', ask: '', src: [] };
    const base = { ask: ins.ask, src: ins.src.slice() };

    if (ins.id === 'medicaid') {
      if (!st) return { ...base, level: 'possible', title: 'Choose a state', body: 'Medicaid doula coverage is decided state by state.' };
      if (MEDICAID_WIDELY_REPORTED.includes(st)) return { ...base, level: 'likely', title: `Likely covered in ${stName}`, body: `${stName} Medicaid has a widely reported doula benefit. Most programs require a credentialed doula and many ask for a recommendation from a licensed provider.`, src: ['nhelp', 'mhe'] };
      return { ...base, level: 'possible', title: `Not confirmed for ${stName}`, body: `33 states plus DC cover or are implementing a benefit, so ${stName} may be among them — we have not confirmed it. Check the state tracker or call your plan.`, src: ['nhelp', 'mhe'] };
    }
    if (priv && priv.s === 'in effect') return { ...base, level: 'likely', title: `Likely — ${stName} requires coverage`, body: `${priv.note} Applies to state-regulated plans; employer self-funded plans can be exempt.`, src: ['nhelp_private'].concat(ins.src) };
    if (priv) return { ...base, level: 'possible', title: `Coming in ${stName}`, body: `${priv.note} Ask your plan about the effective date.`, src: ['nhelp_private'].concat(ins.src) };
    if (ins.status === 'yes') return { ...base, level: 'likely', title: `${ins.name} supports doula services`, body: `${ins.detail} Confirm it applies to your specific plan${stName ? ' in ' + stName : ''}.` };
    if (ins.status === 'some') return { ...base, level: 'possible', title: `Possible with ${ins.name}`, body: `${ins.detail}${stName ? ' Ask about ' + stName + ' specifically.' : ''}` };
    return { ...base, level: 'unknown', title: `Unconfirmed with ${ins.name}`, body: `${ins.detail} Consider a scholarship while you check.` };
  }

  const api = { REVIEWED, SOURCES, INSURERS, STATES, PRIVATE_STATES, MEDICAID_WIDELY_REPORTED, LABEL, DISCLAIMER, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DHCoverage = api;
})(typeof self !== 'undefined' ? self : this);
