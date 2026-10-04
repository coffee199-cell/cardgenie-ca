// Program-specific points calculators: maths, the "cards that earn" list,
// and the page rules (SEO, accessibility, links, copy).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const context = {};
vm.runInNewContext(read('js/point-values.js'), context);
vm.runInNewContext(read('js/program-calculator.js'), context);
const PV = context.CardGeniePointValues;
const calc = context.CardGenieProgramCalc;
const raw = JSON.parse(read('data/cards.json'));

// ── Balance to dollars ─────────────────────────────────────────────────────
assert.equal(calc.balanceValue(50000, 1.5), 750, '50,000 Aeroplan points at 1.5 cents');
assert.equal(calc.balanceValue(50000, 0.1), 50, '50,000 PC Optimum points at 0.1 cents');
assert.equal(calc.balanceValue(120000, 0.5), 600, '120,000 TD Rewards points at 0.5 cents');
assert.equal(calc.balanceValue(30000, 0.7), 210, '30,000 BMO Rewards points at 0.7 cents');
assert.equal(calc.balanceValue(10000, 0.58), 58, '10,000 Avion points through Avion Rewards Pay');
assert.equal(calc.balanceValue(4000, 0.625), 25, '4,000 Aventura points through Payment with Points');
assert.equal(calc.balanceValue(0, 1.5), 0, 'Empty balance');
assert.equal(calc.balanceValue(-5, 1.5), 0, 'Negative balance is treated as empty');

// ── Cents per point on a redemption ───────────────────────────────────────
assert.equal(calc.centsPerPoint(25000, 375), 1.5, '$375 for 25,000 points');
assert.equal(calc.centsPerPoint(60000, 480), 0.8, '$480 for 60,000 points');
assert.equal(calc.centsPerPoint(25000, 520, 80), 1.76, 'Taxes and fees paid on the reward are subtracted');
assert.equal(calc.centsPerPoint(35000, 700, 0), 2, 'Avion schedule flight near its maximum');
assert.equal(calc.centsPerPoint(20000, 250), 1.25, 'Aventura chart flight below its maximum');
assert.equal(calc.centsPerPoint(0, 100), null, 'No points entered');
assert.equal(calc.centsPerPoint(10000, 0), null, 'No cash price entered');
assert.equal(calc.centsPerPoint(10000, 100, 100), null, 'Fees equal to the cash price leave nothing to value');

// ── Verdict against the baseline ──────────────────────────────────────────
assert.equal(calc.verdict(1.8, 1.5), 'good', '20 percent above baseline is good');
assert.equal(calc.verdict(1.79, 1.5), 'typical');
assert.equal(calc.verdict(1.2, 1.5), 'typical', 'Exactly 20 percent below is still typical');
assert.equal(calc.verdict(1.19, 1.5), 'poor');
assert.equal(calc.verdict(0.67, 1), 'poor', 'Scene+ Points for Credit is poor against 1 cent');
assert.equal(calc.verdict(1.5, 0), null, 'No baseline, no verdict');
assert.equal(calc.verdict(null, 1.5), null);

// ── PC Optimum minimum ────────────────────────────────────────────────────
assert.deepEqual({ ...calc.pcOptimumMinimum(9500) }, { eligible: false, toMinimum: 500 });
assert.deepEqual({ ...calc.pcOptimumMinimum(10000) }, { eligible: true, toMinimum: 0 });
assert.deepEqual({ ...calc.pcOptimumMinimum(0) }, { eligible: false, toMinimum: 10000 });

// ── Cards that earn each program ──────────────────────────────────────────
const pageDirs = readdirSync(resolve(root, 'tools'))
  .filter(d => d.endsWith('-points-value-calculator') && d !== 'points-value-calculator');
assert.equal(pageDirs.length, 7);

for (const dir of pageDirs) {
  const html = read(`tools/${dir}/index.html`);
  const program = PV.byKey(html.match(/data-program="(\w+)"/)[1]);
  const listed = calc.cardsEarning(raw, program.unit);
  const expected = raw.filter(c => c.is_active === 1 && c.rewards.some(r => r.earn_unit === program.unit));
  assert.deepEqual(listed.map(c => c.card_slug).sort(), expected.map(c => c.card_slug).sort(), `${dir} lists every active ${program.n} card`);
  const table = calc.cardsTableHTML(listed, program);
  const slugs = [...table.matchAll(/data-slug="([^"]+)"/g)].map(m => m[1]);
  assert.equal(slugs.length, listed.length, `${dir} renders one row per card`);
  for (const slug of slugs) {
    const card = raw.find(c => c.card_slug === slug);
    assert.ok(card && card.is_active === 1, `${slug} is an active card`);
    assert.ok(card.rewards.some(r => r.earn_unit === program.unit), `${slug} really earns ${program.n}`);
  }
  for (const m of table.matchAll(/href="(\/cards\/[^"]+\/)"/g)) {
    assert.ok(existsSync(resolve(root, `.${m[1]}index.html`)), `${m[1]} card page exists`);
  }
  if (!listed.length) assert.ok(/data-empty="[^"]+"/.test(html), `${dir} explains an empty card list`);
}

// Effective return per category = multiplier x cents per point.
const card = slug => raw.find(c => c.card_slug === slug);
const tdAero = calc.effectiveRates(card('td-aeroplan-visa-infinite'), 'Aeroplan', 1.5);
assert.equal(tdAero.main.groceries.pct, 2.25, 'TD Aeroplan groceries 1.5x at 1.5 cents');
assert.equal(tdAero.main.groceries.cap, 'to $80,000/yr spend', 'Cap is shown');
assert.equal(tdAero.main.dining.pct, 1.5);
assert.equal(tdAero.main.other.pct, 1.5);
assert.ok(tdAero.extras.some(x => x.label === 'Air Canada' && x.pct === 2.25), 'Air Canada bonus shown as an extra');
const tdFirst = calc.effectiveRates(card('td-first-class-travel-visa-infinite'), 'TD Rewards', 0.5);
assert.equal(tdFirst.main.groceries.pct, 3, 'TD First Class groceries 6x at 0.5 cents');
assert.equal(tdFirst.main.travel.pct, 1, 'TD First Class broad travel uses the 2x base rate');
const eclipse = calc.effectiveRates(card('bmo-eclipse-rise-visa'), 'BMO Rewards', 0.7);
assert.equal(eclipse.main.groceries.pct, 3.5, 'BMO eclipse rise groceries 5x at 0.7 cents');
assert.equal(eclipse.main.gas.pct, 0.7, 'Uncovered category falls back to everything else');
const ion = calc.effectiveRates(card('rbc-ion-visa'), 'Avion points', PV.cardOverrides['rbc-ion-visa'].c);
assert.equal(ion.main.groceries.pct, 2.4, 'ION+ is valued at its override, 3x at 0.8 cents');
const pcWe = calc.effectiveRates(card('pc-financial-world-elite-mastercard'), 'PC Optimum', 0.1);
assert.equal(pcWe.main.other.pct, 1, 'PC World Elite 10 points per dollar is 1 percent');
const esso = pcWe.extras.find(x => x.label === 'Esso and Mobil');
assert.ok(esso && esso.perLitre && esso.pct === null, 'Per-litre earn is not turned into a percentage');
const ionRow = calc.cardsTableHTML([card('rbc-ion-visa')], PV.byKey('avion'));
assert.ok(ionRow.includes('Valued at 0.8 cents per point'), 'Override is disclosed in the table');

console.log('Program calculator checks passed.');
