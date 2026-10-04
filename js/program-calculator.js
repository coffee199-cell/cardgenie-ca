/* Program-specific points value calculators (/tools/*-points-value-calculator/).
   One script drives all of them. Each page declares its program on the
   calculator element (data-program="td") and this file supplies the maths,
   the program-specific options and the "cards that earn" list.
   Valuations come from /js/point-values.js, loaded first. */
(function (root) {
  var PV = root.CardGeniePointValues;

  // Card pages that exist under /cards/. Cards without one are listed unlinked.
  var CARD_PAGES = ['american-express-cobalt-card', 'scotiabank-gold-american-express'];

  // The six spending categories the homepage calculator uses, and how the
  // database's categories map onto them (same mapping as the homepage).
  var MAIN_CATS = [
    { k: 'groceries', n: 'Groceries' },
    { k: 'gas',       n: 'Gas' },
    { k: 'dining',    n: 'Dining' },
    { k: 'travel',    n: 'Travel' },
    { k: 'bills',     n: 'Recurring bills' },
    { k: 'other',     n: 'Everything else' }
  ];
  var CAT_MAP = {
    groceries: 'groceries', gas: 'gas', dining: 'dining', restaurants: 'dining', bars: 'dining',
    travel: 'travel', recurring_bills: 'bills', all_other: 'other'
  };
  var EXTRA_LABELS = {
    air_canada: 'Air Canada', aeroplan_partner: 'Aeroplan partners', entertainment: 'Entertainment',
    transit: 'Transit', streaming: 'Streaming', loblaws_stores: 'Loblaw banner stores',
    shoppers: 'Shoppers Drug Mart', esso: 'Esso and Mobil', drugstore: 'Drugstores',
    transportation: 'Transportation', usd_spend: 'US dollar spending'
  };

  // ── Pure maths (also exercised by tests/program-calculators.mjs) ─────────
  function round(n, dp) { var f = Math.pow(10, dp); return Math.round(n * f) / f; }

  function balanceValue(points, cents) {
    if (!(points > 0) || !(cents >= 0)) return 0;
    return round(points * cents / 100, 2);
  }

  // Cents per point for a redemption: the cash you avoided paying, less any
  // taxes and fees the reward still charges, divided by the points spent.
  function centsPerPoint(points, cashPrice, feesPaid) {
    var fees = feesPaid > 0 ? feesPaid : 0;
    if (!(points > 0) || !(cashPrice > 0) || fees >= cashPrice) return null;
    return round((cashPrice - fees) / points * 100, 2);
  }

  // Within 20 percent of the baseline either way is typical.
  function verdict(cpp, baseline) {
    if (cpp == null || !(baseline > 0)) return null;
    var ratio = round(cpp / baseline, 4);
    if (ratio >= 1.2) return 'good';
    if (ratio < 0.8) return 'poor';
    return 'typical';
  }

  // PC Optimum needs at least 10,000 points before any redemption.
  var PC_OPTIMUM_MINIMUM = 10000;
  function pcOptimumMinimum(points) {
    var bal = points > 0 ? Math.floor(points) : 0;
    return { eligible: bal >= PC_OPTIMUM_MINIMUM, toMinimum: Math.max(0, PC_OPTIMUM_MINIMUM - bal) };
  }

  function cardsEarning(raw, unit) {
    return (raw || []).filter(function (c) {
      return c && c.is_active === 1 && (c.rewards || []).some(function (r) { return r.earn_unit === unit; });
    });
  }

  function capText(r) {
    if (r.earn_cap == null) return '';
    var period = r.cap_period === 'monthly' ? '/mo' : '/yr';
    return 'to $' + Number(r.earn_cap).toLocaleString('en-CA') + period + ' spend';
  }

  // Effective return per category: multiplier x cents per point, as a percent.
  function effectiveRates(card, unit, cents) {
    var rewards = (card.rewards || []).filter(function (r) { return r.earn_unit === unit; });
    var fallback = 0;
    rewards.forEach(function (r) { if (r.category === 'all_other') fallback = r.earn_rate; });
    var main = {};
    MAIN_CATS.forEach(function (m) { main[m.k] = { rate: fallback, cap: '' }; });
    var extras = [];
    rewards.forEach(function (r) {
      var key = CAT_MAP[r.category];
      if (key) {
        if (r.earn_rate > main[key].rate || (r.category === 'all_other' && key === 'other')) {
          main[key] = { rate: r.earn_rate, cap: capText(r) };
        }
      } else if (r.earn_rate > fallback) {
        var perLitre = /pts\/L\b/.test(r.notes || '');
        extras.push({
          label: EXTRA_LABELS[r.category] || r.category.replace(/_/g, ' '),
          rate: r.earn_rate,
          pct: perLitre ? null : round(r.earn_rate * cents, 2),
          perLitre: perLitre
        });
      }
    });
    var out = {};
    MAIN_CATS.forEach(function (m) {
      out[m.k] = { rate: main[m.k].rate, pct: round(main[m.k].rate * cents, 2), cap: main[m.k].cap };
    });
    return { main: out, extras: extras };
  }

  function centsFor(card, program) {
    var o = PV.cardOverrides[card.card_slug];
    return o ? o.c : program.c;
  }

  // ── Formatting ───────────────────────────────────────────────────────────
  function money(n) {
    return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) { return n.toLocaleString('en-CA'); }
  function pct(n) { return String(round(n, 2)) + '%'; }
  function cents(n) { var r = round(n, 3); return String(r) + (r === 1 ? ' cent' : ' cents'); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function cardName(c) {
    return c.name.toLowerCase().indexOf(c.issuer.toLowerCase()) === 0 ? c.name : c.issuer + ' ' + c.name;
  }

  function cardsTableHTML(list, program) {
    if (!list.length) return '';
    var head = '<thead><tr><th scope="col">Card</th><th scope="col">Annual fee</th>' +
      MAIN_CATS.map(function (m) { return '<th scope="col">' + m.n + '</th>'; }).join('') +
      '<th scope="col">Other bonus categories</th></tr></thead>';
    var rows = list.map(function (c) {
      var cpp = centsFor(c, program);
      var er = effectiveRates(c, program.unit, cpp);
      var name = esc(cardName(c));
      var link = CARD_PAGES.indexOf(c.card_slug) !== -1
        ? '<a href="/cards/' + c.card_slug + '/">' + name + '</a>' : name;
      var override = PV.cardOverrides[c.card_slug];
      if (override) link += '<span class="pgc-cards__note">Valued at ' + cents(override.c) + ' per point: ' + esc(override.note) + '</span>';
      var fee = c.annual_fee > 0 ? money(c.annual_fee) : '$0';
      var cells = MAIN_CATS.map(function (m) {
        var v = er.main[m.k];
        return '<td>' + pct(v.pct) + '<span class="pgc-cards__mult">' + v.rate + 'x' +
          (v.cap ? ', ' + esc(v.cap) : '') + '</span></td>';
      }).join('');
      var extras = er.extras.length ? er.extras.map(function (x) {
        return esc(x.label) + ': ' + (x.perLitre ? x.rate + ' points per litre' : pct(x.pct) + ' (' + x.rate + 'x)');
      }).join('<br>') : 'None';
      return '<tr data-slug="' + c.card_slug + '"><th scope="row">' + link + '</th><td>' + fee + '</td>' + cells + '<td>' + extras + '</td></tr>';
    }).join('');
    return '<div class="compare-table-wrap pgc-cards__wrap" tabindex="0" role="region" aria-label="Cards that earn ' +
      esc(program.n) + ', scrollable table"><table class="compare-table pgc-cards">' + head + '<tbody>' + rows + '</tbody></table></div>';
  }

  // ── Page wiring ──────────────────────────────────────────────────────────
  function init(doc) {
    var el = doc.getElementById('pgc');
    if (!el) return;
    var program = PV.byKey(el.getAttribute('data-program'));
    if (!program) return;
    var $ = function (id) { return doc.getElementById(id); };
    var balanceEl = $('pgc-balance'), cppEl = $('pgc-cpp'), routeEl = $('pgc-route');
    var balanceOut = $('pgc-balance-result');
    var costEl = $('pgc-cost'), cashEl = $('pgc-cash'), feesEl = $('pgc-fees'), checkOut = $('pgc-check-result');
    var baselineEl = $('pgc-baseline');

    cppEl.value = program.c;
    baselineEl.value = program.c;

    function val(input) { var v = parseFloat(input.value); return isFinite(v) ? v : NaN; }

    function renderBalance() {
      var bal = val(balanceEl), c = val(cppEl);
      if (!(bal >= 0) || !(c >= 0)) { balanceOut.innerHTML = '<p>Enter a points balance and a value per point.</p>'; return; }
      var html = '<p class="pgc-result__big">' + money(balanceValue(bal, c)) + '</p>' +
        '<p>' + num(bal) + ' ' + esc(program.n) + ' points at ' + cents(c) + ' per point.</p>';
      if (program.k === 'pcoptimum') {
        var m = pcOptimumMinimum(bal);
        html += m.eligible
          ? '<p>Your balance clears the 10,000-point minimum, so it can be redeemed now.</p>'
          : '<p>You need ' + num(m.toMinimum) + ' more points to reach the 10,000-point minimum for a redemption.</p>';
      }
      balanceOut.innerHTML = html;
    }

    function renderCheck() {
      var pts = val(costEl), cash = val(cashEl), fees = feesEl ? val(feesEl) : 0, base = val(baselineEl);
      var cpp = centsPerPoint(pts, cash, isFinite(fees) ? fees : 0);
      if (cpp == null) {
        checkOut.innerHTML = '<p>Enter the points price and the cash price of the same thing' +
          (feesEl ? ', and any taxes and fees still charged on the reward,' : '') + ' to see what each point is worth.</p>';
        return;
      }
      var v = verdict(cpp, base);
      var words = {
        good: 'Good redemption. That beats the ' + cents(base) + ' baseline by at least 20 percent.',
        typical: 'Typical redemption. That is within 20 percent of the ' + cents(base) + ' baseline.',
        poor: 'Poor redemption. That is more than 20 percent below the ' + cents(base) + ' baseline.'
      };
      checkOut.innerHTML = '<p class="pgc-result__big">' + cents(cpp) + ' per point</p>' +
        (v ? '<p class="pgc-verdict pgc-verdict--' + v + '">' + words[v] + '</p>' : '<p>Enter a baseline above zero to compare.</p>');
    }

    if (routeEl) {
      routeEl.addEventListener('change', function () {
        var opt = routeEl.options[routeEl.selectedIndex];
        cppEl.value = opt.getAttribute('data-cents');
        renderBalance();
      });
    }
    balanceEl.addEventListener('input', renderBalance);
    cppEl.addEventListener('input', renderBalance);
    [costEl, cashEl, feesEl, baselineEl].forEach(function (i) { if (i) i.addEventListener('input', renderCheck); });
    $('pgc-reset').addEventListener('click', function () {
      cppEl.value = program.c;
      baselineEl.value = program.c;
      if (routeEl) routeEl.selectedIndex = 0;
      renderBalance(); renderCheck();
    });
    renderBalance(); renderCheck();

    var cardsOut = $('pgc-cards');
    if (cardsOut && root.fetch) {
      root.fetch('/data/cards.json').then(function (r) { return r.json(); }).then(function (raw) {
        var list = cardsEarning(raw, program.unit).sort(function (a, b) {
          return a.annual_fee - b.annual_fee || cardName(a).localeCompare(cardName(b));
        });
        cardsOut.innerHTML = list.length
          ? cardsTableHTML(list, program)
          : '<p class="pgc-cards__empty">' + esc(cardsOut.getAttribute('data-empty') || 'No cards in the CardGenie database earn this program yet.') + '</p>';
        var countEl = $('pgc-cards-count');
        if (countEl) countEl.textContent = String(list.length);
      }).catch(function () {
        cardsOut.innerHTML = '<p class="pgc-cards__empty">The card list could not be loaded. Try refreshing the page.</p>';
      });
    }
  }

  root.CardGenieProgramCalc = {
    balanceValue: balanceValue,
    centsPerPoint: centsPerPoint,
    verdict: verdict,
    pcOptimumMinimum: pcOptimumMinimum,
    cardsEarning: cardsEarning,
    effectiveRates: effectiveRates,
    cardsTableHTML: cardsTableHTML,
    CARD_PAGES: CARD_PAGES
  };

  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', function () { init(root.document); });
    } else {
      init(root.document);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
