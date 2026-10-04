// Page rules for the program calculators: SEO, structured data, accessibility,
// copy rules, and links. Also checks every internal link on the pages this
// work touched resolves to a file in the repository.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const text = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

const PRIMARY = {
  'aeroplan-points-value-calculator': 'aeroplan points value',
  'scene-plus-points-value-calculator': 'scene points value',
  'td-points-value-calculator': 'td points value',
  'rbc-avion-points-value-calculator': 'rbc avion points value',
  'pc-optimum-points-value-calculator': 'pc optimum points value',
  'bmo-points-value-calculator': 'bmo rewards points value',
  'cibc-aventura-points-value-calculator': 'cibc aventura points value',
};

const sitemap = read('sitemap.xml');
const hub = read('tools/index.html');
const general = read('tools/points-value-calculator/index.html');
const FILLER = /it's worth noting|it is worth noting|when it comes to|in today's world|in conclusion|game.?changer|unlock|seamless/i;

for (const [slug, keyword] of Object.entries(PRIMARY)) {
  const path = `tools/${slug}/index.html`;
  assert.ok(existsSync(resolve(root, path)), `${path} exists`);
  const html = read(path);
  const url = `https://cardgenie.ca/tools/${slug}/`;

  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(title.length < 60, `${slug} title under 60 characters (${title.length})`);
  assert.ok(title.toLowerCase().startsWith(keyword), `${slug} title starts with "${keyword}"`);
  const desc = html.match(/<meta name="description" content="([^"]+)">/)[1];
  assert.ok(desc.length >= 140 && desc.length <= 158, `${slug} description 140-158 characters (${desc.length})`);
  assert.ok(desc.toLowerCase().startsWith(keyword), `${slug} description starts with "${keyword}"`);
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${slug} canonical`);
  for (const og of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name']) {
    assert.ok(html.includes(`property="${og}"`), `${slug} has ${og}`);
  }
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${slug} has one H1`);
  assert.ok((html.match(/<h2\b/g) || []).length >= 5, `${slug} has section H2s`);

  // FAQPage JSON-LD must match the visible FAQ exactly.
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faqLd = ld['@graph'].find(n => n['@type'] === 'FAQPage').mainEntity;
  const visible = [...html.matchAll(/<div class="faq-item">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)]
    .map(m => [text(m[1]), text(m[2])]);
  assert.ok(visible.length >= 3 && visible.length <= 5, `${slug} has 3-5 FAQs`);
  assert.deepEqual(faqLd.map(q => [q.name, q.acceptedAnswer.text]), visible, `${slug} FAQ JSON-LD matches the visible FAQ`);
  const app = ld['@graph'].find(n => n['@type'] === 'WebApplication');
  assert.equal(app.author.name, 'Ryan Billings', `${slug} author`);
  assert.equal(app.url, url);

  // Accessibility: every input and select has a label; results are live regions.
  for (const m of html.matchAll(/<(input|select)\b[^>]*\bid="([^"]+)"/g)) {
    assert.ok(html.includes(`<label for="${m[2]}">`), `${slug} #${m[2]} has a label`);
  }
  assert.ok(/id="pgc-balance-result"[^>]*aria-live="polite"/.test(html), `${slug} balance result is aria-live`);
  assert.ok(/id="pgc-check-result"[^>]*aria-live="polite"/.test(html), `${slug} redemption result is aria-live`);
  assert.ok(!/<style\b|\sstyle="/.test(html), `${slug} has no inline styles`);

  // Copy rules.
  const body = text(html.slice(html.indexOf('<body>')));
  assert.ok(!/[–—]|&mdash;|&ndash;/.test(html), `${slug} has no em or en dashes`);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), `${slug} has no emojis`);
  assert.ok(!FILLER.test(body), `${slug} has no filler phrases`);
  assert.ok(!/we (tested|redeemed|tried)|our test/i.test(body), `${slug} does not claim testing`);
  for (const m of html.matchAll(/<a\b[^>]*>/g)) {
    assert.ok(!/sponsored|affiliate|utm_|[?&](ref|aff|aid|clickid)=/i.test(m[0]), `${slug} has no affiliate links: ${m[0]}`);
  }
  assert.ok(body.includes('not financial advice'), `${slug} has the not-financial-advice line`);
  const content = html.slice(html.indexOf('<main'), html.indexOf('id="sources"'));
  const words = text(content.slice(content.indexOf('</div>', content.indexOf('id="pgc-cards"')))).split(' ').length;
  assert.ok(words >= 400 && words <= 800, `${slug} explanatory content is about 400-700 words (${words})`);

  // Links out to the rest of the site and to the other program calculators.
  assert.ok(html.includes('href="https://cardgenie.ca/tools/points-value-calculator/"'), `${slug} links the general calculator`);
  assert.ok(html.includes('href="https://cardgenie.ca/"'), `${slug} links the homepage calculator`);
  assert.ok(/href="https:\/\/cardgenie\.ca\/(cards|compare|best)\//.test(html), `${slug} links a cards, compare or best page`);
  for (const other of Object.keys(PRIMARY).filter(s => s !== slug)) {
    assert.ok(html.includes(`href="https://cardgenie.ca/tools/${other}/"`), `${slug} links ${other}`);
  }

  // Sources are official program pages over HTTPS.
  const sources = html.slice(html.indexOf('id="sources"'), html.indexOf('id="faq"'));
  const hrefs = [...sources.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 4, `${slug} cites its sources`);
  for (const h of hrefs) {
    assert.ok(/^https:\/\/([a-z.]+\.)?(aircanada\.com|sceneplus\.ca|scotiabank\.com|td\.com|expediafortd\.com|avionrewards\.com|rbcroyalbank\.com|rbc\.com|cibc\.com|cibcrewards\.com|pcoptimum\.ca|pcfinancial\.ca|bmo\.com|bmorewards\.com)\//.test(h), `${slug} source ${h} is an official program page`);
  }

  // Site integration.
  assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${slug} is in sitemap.xml`);
  assert.ok(new RegExp(`<loc>${url}</loc>\\s*<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`).test(sitemap), `${slug} has a lastmod`);
  assert.ok(hub.includes(`href="${url}"`), `${slug} is on the tools hub`);
  assert.ok(general.includes(`href="${url}"`), `${slug} is linked from the general points calculator`);
}

// Every internal link on the touched pages resolves to a file in the repo.
const pages = ['index.html', 'tools/index.html', 'tools/points-value-calculator/index.html',
  ...Object.keys(PRIMARY).map(s => `tools/${s}/index.html`)];
for (const page of pages) {
  const html = read(page);
  for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    let target = m[1];
    if (/^https?:\/\//.test(target) && !target.startsWith('https://cardgenie.ca/')) continue;
    if (/^(mailto:|tel:|data:)/.test(target) || /\$\{|' ?\+/.test(target)) continue; // skip JS-built URLs
    let path;
    if (target.startsWith('https://cardgenie.ca/')) path = target.slice('https://cardgenie.ca/'.length);
    else if (target.startsWith('/')) path = target.slice(1);
    else path = resolve(root, dirname(page), target).slice(root.length + 1);
    path = path.split('?')[0];
    if (path === '' || path.endsWith('/')) path += 'index.html';
    assert.ok(existsSync(resolve(root, path)), `${page}: ${m[1]} resolves to ${path}`);
  }
}

// The card list loads the database from the absolute path used by the homepage.
assert.ok(read('js/program-calculator.js').includes("fetch('/data/cards.json')"));
assert.ok(readdirSync(resolve(root, 'data')).includes('cards.json'));

console.log('Program page checks passed.');
