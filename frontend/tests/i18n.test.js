import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translate, localizedElement, LanguageProvider } from '../src/i18n.js';
import { BEACHES, destinationName } from '../src/beaches.js';
import { shops } from '../src/nearby.js';

test('all destinations and descriptions have English translations', () => {
  for (const beach of BEACHES) {
    assert.doesNotMatch(translate(destinationName(beach.id)), /[가-힣]/);
    assert.doesNotMatch(translate(beach.description), /[가-힣]/);
  }
});
test('original shop names and addresses remain intact for local maps', () => {
  for (const [name,,address] of Object.values(shops).flat()) {
    assert.ok(translate(name));
    assert.equal(translate(address), address);
  }
});
test('safety statements are translated as complete messages', () => {
  const message = '공식 특보와 현장 통제·안내판을 먼저 확인하세요. 이 서비스는 입수 가능 여부를 판단하지 않습니다.';
  assert.match(translate(message), /does not determine/);
  assert.doesNotMatch(translate(message), /[가-힣]/);
  assert.equal(translate(message, 'ko'), message);
  assert.equal(translate(3), 3);
  assert.equal(translate('7건'), '7 records');
});
test('localization translates display text without changing form values, links or analytics IDs', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {getItem:()=> 'en'};
  try {
    const html = renderToStaticMarkup(React.createElement(LanguageProvider, null,
      localizedElement('a', {href:'/search?q=망상해변', 'data-place-name':'망상해변', 'aria-label':'망상해변'}, '망상해변'),
      localizedElement('input', {value:'망상해변', readOnly:true}),
      localizedElement('select', {defaultValue:'차량 이용'}, localizedElement('option', {value:'차량 이용'}, '차량 이용')),
    ));
    assert.match(html, /aria-label="Mangsang Beach"/);
    assert.match(html, /data-place-name="망상해변"/);
    assert.match(html, /href="\/search\?q=망상해변"/);
    assert.match(html, /value="망상해변"/);
    assert.match(html, />By car<\/option>/);
    assert.match(html, /value="차량 이용"/);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
