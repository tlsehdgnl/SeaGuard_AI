import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestShelters, distanceMeters } from '../src/shelters.js';
import dataset from '../src/shelters.json' with { type:'json' };
test('distance uses metres and ranks the closest registered place without changing source order',()=>{
  const rows=[{id:'far',point:[37.51,129.1]},{id:'near',point:[37.5,129.1]}];
  assert.equal(nearestShelters([37.5,129.1],rows)[0].id,'near');
  assert.equal(rows[0].id,'far');
  assert.ok(Math.abs(distanceMeters([37.5,129.1],[37.51,129.1])-1112)<2);
});
test('invalid coordinates and outside-coverage positions do not produce a misleading nearest result',()=>{
  for(const p of [undefined,[NaN,129],[91,129],['37.5',129],[0,0]]) assert.deepEqual(nearestShelters(p,dataset.items),[]);
});
test('official snapshot has unique records and exact self-location resolves to that shelter',()=>{
  assert.equal(dataset.kind,'tsunami');
  assert.equal(new Set(dataset.items.map(x=>x.id)).size,dataset.items.length);
  for(const item of dataset.items) {
    assert.match(item.address,/동해시/);
    assert.equal(nearestShelters(item.point,dataset.items)[0].id,item.id);
  }
});
