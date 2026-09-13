import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceLoopProgress} from './reference-loop';

test('the authored loop covers the full range and returns with a smooth seam',()=>{
  assert.equal(referenceLoopProgress(0),0);
  assert.equal(referenceLoopProgress(2000),1);
  assert.equal(referenceLoopProgress(4000),0);
  assert.ok(Math.abs(referenceLoopProgress(1000)-0.5)<1e-8);
  for(let t=0;t<4000;t+=17) {
    const p=referenceLoopProgress(t);
    assert.ok(p>=0&&p<=1);
    assert.equal(p,referenceLoopProgress(t+4000));
    assert.ok(Math.abs(referenceLoopProgress(t+17)-p)<0.014);
  }
  assert.ok(Math.abs(referenceLoopProgress(3999)-referenceLoopProgress(4001))<1e-8);
});
