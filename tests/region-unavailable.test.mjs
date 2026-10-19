import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Ozon_SKU_Image_Crawler.user.js', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function createResolver(elements, pageText = '') {
  const regionFns = sliceBetween('  function normalizeProductId(value) {', '  async function processRegionUnavailableSearchResult(sku) {');
  const context = {
    URL,
    URLSearchParams,
    location: { href: 'https://www.ozon.ru/search/?product_id=5874488973' },
    document: {
      body: { innerText: pageText },
      querySelectorAll(selector) {
        if (selector.startsWith('[id^="state-webOutOfStock-"]')) return elements;
        if (selector === 'h1,h2,h3,h4,div,span,p') {
          return pageText.split('|').filter(Boolean).map(text => ({ innerText: text, textContent: text }));
        }
        return [];
      },
    },
    isVisible: () => true,
    cleanSku: value => String(value || '').trim(),
    log: () => {},
  };
  vm.createContext(context);
  vm.runInContext(regionFns, context);
  return context;
}

const exactState = JSON.stringify({
  common: { action: { behavior: 'BEHAVIOR_TYPE_REDIRECT', link: '/product/5874488973/?oos_search=false' } },
});
const recommendedState = JSON.stringify({
  common: { action: { behavior: 'BEHAVIOR_TYPE_REDIRECT', link: '/product/5752492839/?oos_search=false' } },
});
const widget = dataState => ({ id: 'state-webOutOfStock-test', getAttribute: name => name === 'data-state' ? dataState : null });

test('visible region marker is sufficient without recommendation heading', () => {
  const ctx = createResolver([], 'Не доставляется\u00a0 в ваш регион');
  const result = ctx.inspectRegionUnavailableEvidence();
  assert.equal(result.markerVisible, true);
  assert.equal(result.confirmed, true);
});

test('region marker tolerates repeated Unicode whitespace and recommended heading is optional', () => {
  const ctx = createResolver([], 'Не доставляется   в ваш регион');
  const result = ctx.inspectRegionUnavailableEvidence();
  assert.equal(result.confirmed, true);
  assert.equal(result.similarLayoutVisible, false);
});

test('English region-unavailable wording is recognized', () => {
  const ctx = createResolver([], 'Not delivered to your region');
  assert.equal(ctx.inspectRegionUnavailableEvidence().confirmed, true);
});

test('native widget returns only exact SKU identity from data-state', () => {
  const ctx = createResolver([widget(recommendedState), widget(exactState)]);
  const result = ctx.findRegionUnavailableNativeTarget('5874488973');
  assert.equal(result.productId, '5874488973');
  assert.match(result.url, /\/product\/5874488973\//);
  assert.equal(result.method, 'native-webOutOfStock');
});

test('recommended widget SKU is never accepted as the target', () => {
  const ctx = createResolver([widget(recommendedState)]);
  assert.equal(ctx.findRegionUnavailableNativeTarget('5874488973'), null);
});

test('malformed and missing data-state values are ignored safely', () => {
  const ctx = createResolver([
    widget('{malformed'),
    { id: 'state-webOutOfStock-no-state', getAttribute: () => null },
  ]);
  assert.equal(ctx.findRegionUnavailableNativeTarget('5874488973'), null);
});

test('normal exact href is checked before region fallback in search flow', () => {
  const fn = sliceBetween('  async function processSearchPage(sku) {', '\n  async function processProductPage');
  const exactIndex = fn.indexOf('const exactUrl = findExactProductLink(sku)');
  const regionIndex = fn.indexOf('const regionEvidence = inspectRegionUnavailableEvidence()');
  assert.notEqual(exactIndex, -1);
  assert.notEqual(regionIndex, -1);
  assert.ok(exactIndex < regionIndex, 'normal exact href must have priority');
});

test('region recovery never constructs an unverified direct product URL', () => {
  const fn = sliceBetween('  async function processRegionUnavailableSearchResult(sku) {', '\n  async function waitUntil');
  assert.match(fn, /findRegionUnavailableNativeTarget\(targetId\)/);
  assert.match(fn, /REGION_EXACT_PRODUCT_NOT_FOUND/);
  assert.doesNotMatch(fn, /region-safe-fallback/);
  assert.doesNotMatch(fn, /targetUrl\s*=\s*'https:\/\/www\.ozon\.ru\/product\//);
});
