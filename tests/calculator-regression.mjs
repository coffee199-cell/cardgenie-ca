import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const raw = JSON.parse(readFileSync(resolve(root, 'data/cards.json'), 'utf8'));
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const calculationOnly = script.slice(0, script.indexOf('// ── Sliders'));
const context = { console, Date, setTimeout, clearTimeout };

vm.runInNewContext(`${calculationOnly}\nglobalThis.calculator = {
  mapCard, scoreCard, rewardBreakdown,
  makeStacks(cards) { CARDS = cards; return buildStacks(); },
  setWelcome(value) { includeWelcome = value; },
};`, context);

const cards = new Map(raw.map(card => [card.card_slug, context.calculator.mapCard(card)]));
const spend = values => ({ groceries:0, gas:0, dining:0, travel:0, bills:0, other:0, ...values });
const closeTo = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, received ${actual}`);

closeTo(
  context.calculator.scoreCard(cards.get('bmo-cashback-world-elite-mastercard'), spend({ groceries:2000 })),
  360,
  'BMO grocery statement cap is applied',
);

closeTo(
  context.calculator.scoreCard(cards.get('td-first-class-travel-visa-infinite'), spend({ travel:1000 })),
  -19,
  'TD broad travel does not assume Expedia for TD',
);

closeTo(
  context.calculator.scoreCard(cards.get('td-cash-back-visa-infinite'), spend({ bills:2000 })),
  401,
  'TD recurring-bill annual cap is applied',
);

closeTo(
  context.calculator.scoreCard(cards.get('scotiabank-momentum-visa-infinite'), spend({ groceries:2000, bills:2000 })),
  1110,
  'Scotia Momentum shared 4% cap is applied',
);

// groceries+gas+bills share ONE $15k/yr 3% cap, not three separate caps.
// 60k combined spend => 15k@3% + 45k@1% = $900 reward (buggy per-category = $1500).
closeTo(
  context.calculator.rewardBreakdown(
    cards.get('td-cash-back-visa-infinite'),
    spend({ groceries:2000, gas:1000, bills:2000 }),
  ).value,
  900,
  'TD Cash Back groceries/gas/bills share one combined 3% cap',
);

const cobalt = context.calculator.rewardBreakdown(
  cards.get('american-express-cobalt-card'),
  spend({ groceries:2000, dining:1000 }),
);
closeTo(cobalt.unitsByProgram['MR points'], 156000, 'Cobalt shared monthly food-and-drink cap is applied');

const pc = context.calculator.rewardBreakdown(
  cards.get('pc-financial-world-elite-mastercard'),
  spend({ groceries:2000 }),
);
closeTo(pc.unitsByProgram['PC Optimum'], 240000, 'Broad groceries do not assume a Loblaw-banner merchant');

const stacks = context.calculator.makeStacks([...cards.values()]);
assert.equal(stacks.length, 5, 'Only same-program card stacks are offered');
assert.ok(
  !stacks.some(stack => stack.slug.includes('td-aeroplan') && stack.slug.includes('american-express-cobalt')),
  'Aeroplan and Membership Rewards are not merged into one points balance',
);

context.calculator.setWelcome(true);
closeTo(
  context.calculator.scoreCard(cards.get('td-cash-back-visa-infinite'), spend({ bills:100 })),
  -103,
  'Welcome bonus is excluded when entered spend cannot meet its requirement',
);
context.calculator.setWelcome(false);

console.log('Calculator regression checks passed.');
