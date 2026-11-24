import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJsonLd, findRecipe, minutes, normalise, recipeFromHtml, parseIngredient, scaleIngredient, formatQty, steps, slug, bookmarklet, cleanText} from '../assets/js/kitchen/recipe.mjs';

const page = ld => `<!doctype html><html><head><title>x</title><script type="application/ld+json">${typeof ld === 'string' ? ld : JSON.stringify(ld)}</script></head><body><p>hello</p></body></html>`;
const NOW = new Date('2026-11-24T20:00:00Z');

// Italian-style: quantity after the name, plain recipe object, HowToStep list.
const italian = {
  '@context': 'https://schema.org', '@type': 'Recipe', name: 'Pasta e fagioli', recipeYield: '4 persone',
  prepTime: 'PT20M', cookTime: 'PT1H10M', totalTime: 'PT1H30M', recipeCategory: 'Primi piatti', keywords: 'pasta, legumi, cucina povera',
  image: ['https://example.it/img/pasta-fagioli.jpg'],
  recipeIngredient: ['Fagioli borlotti secchi 250 g', 'Ditalini rigati 200 g', 'Sedano 1 costa', 'Olio extravergine d&#39;oliva q.b.', 'Rosmarino 1 rametto', 'Farina 00 50 g'],
  recipeInstructions: [{'@type': 'HowToStep', text: 'Mettete in ammollo i fagioli per 12 ore.'}, {'@type': 'HowToStep', text: 'Cuocete i fagioli con il sedano &amp; il rosmarino.'}],
  suitableForDiet: 'https://schema.org/VegetarianDiet',
};

// British-style: @graph, author object, sections, HTML in steps.
const british = {
  '@context': 'https://schema.org',
  '@graph': [
    {'@type': 'WebPage', name: 'Vegetarian chilli'},
    {'@type': ['Recipe', 'NewsArticle'], name: 'Easy vegetarian chilli', author: {'@type': 'Person', name: 'Test Cook'}, recipeYield: 4, totalTime: 'P0DT0H45M',
      recipeIngredient: ['1 tbsp olive oil', '2 onions, chopped', '400g can kidney beans', '½ tsp chilli powder', '1 ½ tsp ground cumin', '2-3 garlic cloves'],
      recipeInstructions: [{'@type': 'HowToSection', name: 'Base', itemListElement: [{'@type': 'HowToStep', text: '<p>Heat the oil.</p>'}, {'@type': 'HowToStep', text: 'Fry the onions for <b>10 mins</b>.'}]}, {'@type': 'HowToSection', name: 'Finish', itemListElement: [{'@type': 'HowToStep', text: 'Add the beans and simmer.'}]}],
      suitableForDiet: [{'@id': 'https://schema.org/VeganDiet'}]},
  ],
};

test('reads an Italian-style recipe page', () => {
  const r = recipeFromHtml(page(italian), 'https://www.example.it/ricette/pasta-e-fagioli.html', NOW);
  assert.equal(r.title, 'Pasta e fagioli');
  assert.equal(r.source, 'example.it');
  assert.equal(r.serves, 4);
  assert.deepEqual(r.times, {prep: 20, cook: 70, total: 90});
  assert.equal(r.ingredients[3], "Olio extravergine d'oliva q.b.");
  assert.equal(r.steps[1].text, 'Cuocete i fagioli con il sedano & il rosmarino.');
  assert.ok(r.tags.includes('vegetarian') && r.tags.includes('cucina povera'));
  assert.equal(r.image, 'https://example.it/img/pasta-fagioli.jpg');
  assert.match(r.id, /^pasta-e-fagioli-[a-z0-9]+$/);
  assert.equal(r.addedAt, '2026-11-24T20:00:00.000Z');
});

test('reads a @graph page with step sections and a multi-type node', () => {
  const r = recipeFromHtml(page(british), 'https://www.example.co.uk/recipes/vegetarian-chilli', NOW);
  assert.equal(r.title, 'Easy vegetarian chilli');
  assert.equal(r.author, 'Test Cook');
  assert.equal(r.serves, 4);
  assert.equal(r.times.total, 45);
  assert.deepEqual(r.steps, [{section: 'Base', text: 'Heat the oil.'}, {section: 'Base', text: 'Fry the onions for 10 mins.'}, {section: 'Finish', text: 'Add the beans and simmer.'}]);
  assert.ok(r.tags.includes('vegan') && r.tags.includes('vegetarian'));
});

test('handles several ld+json blocks, broken JSON and entity-encoded JSON', () => {
  const html = '<script type="application/ld+json">{broken</script>' + page({'@type': 'Organization', name: 'Site'}) + `<script type='application/ld+json'>${JSON.stringify(italian).replace(/"/g, '&quot;')}</script>`;
  assert.equal(extractJsonLd(html).length, 2);
  assert.equal(findRecipe(extractJsonLd(html)).name, 'Pasta e fagioli');
});

test('a page without a recipe gives a clear message', () => {
  assert.throws(() => recipeFromHtml(page({'@type': 'Article', name: 'News'})), /no recipe/i);
  assert.throws(() => recipeFromHtml('<html></html>'), /bookmarklet/);
  assert.throws(() => normalise({'@type': 'Recipe', name: 'Empty'}), /ingredient/);
});

test('ISO durations become minutes', () => {
  assert.equal(minutes('PT1H30M'), 90);
  assert.equal(minutes('P0DT0H20M'), 20);
  assert.equal(minutes('PT45S'), 1);
  assert.equal(minutes('P1D'), 1440);
  assert.equal(minutes('nonsense'), null);
  assert.equal(minutes(undefined), null);
});

test('plain-text instructions split into steps without their numbers', () => {
  assert.deepEqual(steps('1. Mix.\n2. Rest.\nStep 3: Bake.'), [{text: 'Mix.'}, {text: 'Rest.'}, {text: 'Bake.'}]);
  assert.deepEqual(steps(['Mix.', {text: 'Bake.'}]), [{text: 'Mix.'}, {text: 'Bake.'}]);
});

test('ingredient quantities are found at the start or the end', () => {
  assert.deepEqual(['qty', 'unit', 'at'].map(k => parseIngredient('400g can kidney beans')[k]), [400, 'g', 'lead']);
  assert.deepEqual(['qty', 'unit', 'at'].map(k => parseIngredient('1 ½ tsp ground cumin')[k]), [1.5, 'tsp', 'lead']);
  assert.deepEqual(['qty', 'max'].map(k => parseIngredient('2-3 garlic cloves')[k]), [2, 3]);
  assert.deepEqual(['qty', 'unit', 'at'].map(k => parseIngredient('Fagioli borlotti secchi 250 g')[k]), [250, 'g', 'trail']);
  assert.equal(parseIngredient('Farina 00 50 g').qty, 50);
  assert.equal(parseIngredient('Farina tipo 00').qty, null);
  assert.equal(parseIngredient("Olio extravergine d'oliva q.b.").qty, null);
  assert.equal(parseIngredient('Uova medie 2').qty, 2);
  assert.equal(parseIngredient('salt and pepper').qty, null);
});

test('scaling keeps the wording and rounds sensibly', () => {
  assert.equal(scaleIngredient('400g can kidney beans', 2), '800g can kidney beans');
  assert.equal(scaleIngredient('1 tbsp olive oil', 1.5), '1 ½ tbsp olive oil');
  assert.equal(scaleIngredient('½ tsp chilli powder', 0.5), '¼ tsp chilli powder');
  assert.equal(scaleIngredient('2 onions, chopped', 1.5), '3 onions, chopped');
  assert.equal(scaleIngredient('2-3 garlic cloves', 2), '4–6 garlic cloves');
  assert.equal(scaleIngredient('Fagioli borlotti secchi 250 g', 1.5), 'Fagioli borlotti secchi 375 g');
  assert.equal(scaleIngredient('Farina 00 50 g', 0.5), 'Farina 00 25 g');
  assert.equal(scaleIngredient('Sale q.b.', 3), 'Sale q.b.');
  assert.equal(scaleIngredient('1 egg', 1), '1 egg');
  assert.equal(formatQty(1234, 'g'), '1235');
  assert.equal(formatQty(3.33, 'g'), '3.3');
  assert.equal(formatQty(0.1, 'tsp'), '¼');
});

test('slugs are ASCII and safe for Dropbox paths', () => {
  assert.equal(slug('Pâte brisée & più'), 'pate-brisee-piu');
  assert.equal(slug(''), 'recipe');
});

test('cleanText strips tags and decodes entities', () => {
  assert.equal(cleanText('<p>Heat&nbsp;the oil &amp; fry.</p><p>Done&#8217;s</p>'), 'Heat the oil & fry.\nDone’s');
});

test('the bookmarklet finds recipe data in a page and hands it to the app', () => {
  const href = bookmarklet('https://cardopoli.github.io/enricopolicardo.com/tools/cookbook.html');
  assert.ok(href.startsWith('javascript:'));
  const code = decodeURIComponent(href.slice('javascript:'.length));
  let opened = null, alerted = null;
  const scripts = [{textContent: '{nope'}, {textContent: JSON.stringify(british)}];
  const fn = new Function('document', 'location', 'window', 'alert', code);
  fn({querySelectorAll: () => scripts}, {href: 'https://www.example.co.uk/recipes/vegetarian-chilli'}, {open: u => (opened = u, {})}, m => (alerted = m));
  assert.equal(alerted, null);
  const payload = JSON.parse(decodeURIComponent(opened.split('#add=')[1]));
  assert.equal(payload.url, 'https://www.example.co.uk/recipes/vegetarian-chilli');
  assert.equal(normalise(payload.recipe, payload.url, NOW).title, 'Easy vegetarian chilli');
  fn({querySelectorAll: () => []}, {href: 'https://x.test'}, {open: () => { throw Error('should not open'); }}, m => (alerted = m));
  assert.match(alerted, /No recipe/);
});
