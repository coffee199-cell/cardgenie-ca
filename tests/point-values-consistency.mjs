// Every page that turns points into dollars must use the same valuation per
// program. This test reads /js/point-values.js as the single source of truth
// and fails if the homepage calculator, the all-programs calculator, a program
// calculator or a comparison page states a different number.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const shared = read('js/point-values.js');
const context = {};
vm.runInNewContext(shared, context);
const PV = context.CardGeniePointValues;
const cents = Object.fromEntries(PV.programs.map(p => [p.k, p.c]));

// 1. Existing valuations are unchanged; Aventura is the only addition.
assert.deepEqual(
  JSON.parse(JSON.stringify(PV.fractionsByUnit())),
  {
    'Aeroplan': 0.015, 'Scene+ points': 0.01, 'MR points': 0.01, 'Avion points': 0.01,
    'Aventura points': 0.01, 'BMO Rewards': 0.007, 'TD Rewards': 0.005, 'PC Optimum': 0.001,
    'À la carte': 0.01, 'cash_back_pct': 0.01,
  },
  'Shared valuations match the values the homepage used before extraction, plus Aventura',
);
assert.deepEqual(JSON.parse(JSON.stringify(PV.cardOverrideFractions())), { 'rbc-ion-visa': 0.008 });

// Every earn_unit in the card database has a valuation.
const raw = JSON.parse(read('data/cards.json'));
for (const unit of new Set(raw.flatMap(c => (c.rewards || []).map(r => r.earn_unit)))) {
  assert.ok(unit in PV.fractionsByUnit(), `earn_unit "${unit}" has a shared valuation`);
}

// 2. Homepage: loads the shared file and keeps no table of its own.
const home = read('index.html');
assert.ok(home.indexOf('<script src="js/point-values.js"></script>') !== -1, 'Homepage loads js/point-values.js');
assert.ok(home.indexOf('js/point-values.js') < home.lastIndexOf('<script>'), 'Shared file loads before the calculator script');
assert.ok(!/POINT_VALUE\s*=\s*\{/.test(home), 'Homepage has no inline POINT_VALUE table');
assert.ok(!/PV_OVERRIDE\s*=\s*\{/.test(home), 'Homepage has no inline PV_OVERRIDE table');

// The homepage calculator really values each program's cards at the shared figure.
const script = home.slice(home.lastIndexOf('<script>') + 8, home.lastIndexOf('</script>'));
const homeCtx = { console, Date, setTimeout, clearTimeout };
vm.runInNewContext(shared, homeCtx);
vm.runInNewContext(`${script.slice(0, script.indexOf('// ── Sliders'))}\nglobalThis.mapCard = mapCard;`, homeCtx);
for (const card of raw.filter(c => c.is_active === 1)) {
  const unit = card.rewards[0].earn_unit;
  const expected = PV.cardOverrideFractions()[card.card_slug] ?? PV.fractionsByUnit()[unit];
  assert.equal(homeCtx.mapCard(card).pv, expected, `Homepage values ${card.card_slug} at the shared figure`);
}

// 3. All-programs calculator: shared script, and its visible table agrees.
const pvPage = read('tools/points-value-calculator/index.html');
assert.ok(pvPage.includes('<script src="../../js/point-values.js"></script>'), 'Points value calculator loads the shared file');
assert.ok(!/var PROGRAMS\s*=\s*\[/.test(pvPage), 'Points value calculator has no inline program table');
const tableRows = [...pvPage.matchAll(/<tr><td>([^<]+)<\/td><td>([\d.]+)&cent;<\/td>/g)]
  .map(m => [m[1].replace('&Agrave;', 'À'), Number(m[2])]);
assert.equal(tableRows.length, PV.programs.length, 'Baseline table lists every program');
for (const [name, value] of tableRows) {
  const program = PV.programs.find(p => p.n === name);
  assert.ok(program, `Table row "${name}" is a shared program`);
  assert.equal(value, program.c, `Table value for ${name} matches the shared file`);
}
for (const m of pvPage.matchAll(/<h3 id="(\w+)">[^<]*?([\d.]+) cents per point<\/h3>/g)) {
  assert.equal(Number(m[2]), cents[m[1]], `Section heading for ${m[1]} matches the shared file`);
}

// 4. Program calculators: every stated baseline matches the shared file.
const programPages = readdirSync(resolve(root, 'tools'))
  .filter(d => d.endsWith('-points-value-calculator') && d !== 'points-value-calculator');
assert.equal(programPages.length, 7, 'Seven program calculators exist');
for (const dir of programPages) {
  const html = read(`tools/${dir}/index.html`);
  const key = html.match(/data-program="(\w+)"/)[1];
  const c = cents[key];
  assert.ok(c != null, `${dir} names a shared program`);
  assert.ok(html.indexOf('../../js/point-values.js') < html.indexOf('../../js/program-calculator.js'), `${dir} loads the shared valuations first`);
  assert.equal(Number(html.match(/id="pgc-cpp" value="([\d.]+)"/)[1]), c, `${dir} value field starts at the baseline`);
  assert.equal(Number(html.match(/id="pgc-baseline" value="([\d.]+)"/)[1]), c, `${dir} comparison field starts at the baseline`);
  const firstOption = html.match(/<select id="pgc-route">\s*<option [^>]*data-cents="([\d.]+)"/);
  if (firstOption) assert.equal(Number(firstOption[1]), c, `${dir} first redemption option is the baseline`);
  const stated = [...html.matchAll(/CardGenie values (?:an? )?[A-Za-z+ ]*? points? (?:at|is) ([\d.]+) cents?/g)];
  assert.ok(stated.length >= 2, `${dir} states its baseline in the lead and FAQ`);
  for (const m of stated) assert.equal(Number(m[1]), c, `${dir} states ${m[1]} cents, shared file says ${c}`);
  assert.ok(existsSync(resolve(root, `tools/${dir}/index.html`)));
}

// 5. Comparison pages quote the standard valuations in prose.
for (const dir of readdirSync(resolve(root, 'compare')).filter(d => !d.includes('.'))) {
  const html = read(`compare/${dir}/index.html`);
  const m = html.match(/Aeroplan at ([\d.]+) cents per point, Membership Rewards and Scene\+ at ([\d.]+) cent per point/);
  if (!m) continue;
  assert.equal(Number(m[1]), cents.aeroplan, `${dir} Aeroplan figure`);
  assert.equal(Number(m[2]), cents.mr, `${dir} Membership Rewards figure`);
  assert.equal(Number(m[2]), cents.scene, `${dir} Scene+ figure`);
}

console.log('Point value consistency checks passed.');
