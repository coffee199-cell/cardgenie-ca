/* CardGenie point valuations: the single source of truth.
   Every page that turns points into dollars reads from this file: the homepage
   card calculator, /tools/points-value-calculator/ and each program-specific
   calculator under /tools/. Change a value here and every page changes with it;
   tests/point-values-consistency.mjs fails if any page drifts from it.

   Values are conservative cents per point that a typical cardholder can reach
   without specialised booking knowledge, not guaranteed redemption values. */
(function (root) {
  var PROGRAMS = [
    { k: 'aeroplan',  n: 'Aeroplan',                  unit: 'Aeroplan',       c: 1.5 },
    { k: 'scene',     n: 'Scene+',                    unit: 'Scene+ points',  c: 1.0 },
    { k: 'mr',        n: 'Amex Membership Rewards',   unit: 'MR points',      c: 1.0 },
    { k: 'avion',     n: 'RBC Avion',                 unit: 'Avion points',   c: 1.0 },
    { k: 'aventura',  n: 'CIBC Aventura',             unit: 'Aventura points', c: 1.0 },
    { k: 'bmo',       n: 'BMO Rewards',               unit: 'BMO Rewards',    c: 0.7 },
    { k: 'td',        n: 'TD Rewards',                unit: 'TD Rewards',     c: 0.5 },
    { k: 'pcoptimum', n: 'PC Optimum',                unit: 'PC Optimum',     c: 0.1 },
    { k: 'alacarte',  n: 'National Bank À la carte', unit: 'À la carte', c: 1.0 },
    { k: 'cashback',  n: 'Cash back',                 unit: 'cash_back_pct',  c: 1.0 }
  ];

  // Cards where standalone point value is lower than the earn_unit suggests.
  // ION+ points do not reach the airline transfers of an Avion card on their own.
  var CARD_OVERRIDES = {
    'rbc-ion-visa': { c: 0.8, note: 'standalone value; pairs with Avion for full transfer access' }
  };

  // cents -> fraction of a dollar, rounded so 0.7 becomes 0.007 rather than
  // 0.006999999999999999 and calculator totals stay exact.
  function toFraction(cents) { return Math.round(cents * 1e6) / 1e8; }

  function byKey(k) {
    for (var i = 0; i < PROGRAMS.length; i++) if (PROGRAMS[i].k === k) return PROGRAMS[i];
    return null;
  }

  function fractionsByUnit() {
    var out = {};
    PROGRAMS.forEach(function (p) { out[p.unit] = toFraction(p.c); });
    return out;
  }

  function cardOverrideFractions() {
    var out = {};
    Object.keys(CARD_OVERRIDES).forEach(function (slug) { out[slug] = toFraction(CARD_OVERRIDES[slug].c); });
    return out;
  }

  root.CardGeniePointValues = {
    programs: PROGRAMS,
    cardOverrides: CARD_OVERRIDES,
    byKey: byKey,
    toFraction: toFraction,
    fractionsByUnit: fractionsByUnit,
    cardOverrideFractions: cardOverrideFractions
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
