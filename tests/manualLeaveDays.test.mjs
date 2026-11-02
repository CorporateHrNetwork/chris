import test from 'node:test';
import assert from 'node:assert/strict';
import {manualUsageDelta,previewManualUsage} from '../backend/src/domain/leaveDaysTaken.mjs';
const balance={hasEntitlement:true,used:4,available:14,committed:2,maximumRequestable:14,unit:'WORKING_DAYS'};
test('manual total replaces the usage total and preserves pending reservations without double deduction',()=>{
 const p=previewManualUsage(balance,{},9);assert.equal(p.available,9);assert.equal(p.maximumRequestable,9);assert.equal(p.used,9);assert.equal(p.committed,2);assert.equal(balance.used,4);
 assert.equal(previewManualUsage(balance,{},4).maximumRequestable,14);assert.equal(previewManualUsage(balance,{},'').maximumRequestable,14);
});
test('policy cap and negative balance allowance are recalculated from available balance',()=>{
 assert.equal(previewManualUsage({...balance,available:30},{requestRules:{maximumDuration:10}},9).maximumRequestable,10);
 assert.equal(previewManualUsage({...balance,available:1},{allowNegativeBalance:true,maxNegativeDays:3},6).maximumRequestable,2);
 assert.equal(previewManualUsage(balance,{},25).maximumRequestable,0);
 assert.equal(previewManualUsage(balance,{},4.5).maximumRequestable,13.5);
});
test('invalid manual totals and reductions of recorded leave are rejected',()=>{
 for(const v of [-1,NaN,Infinity,'invalid',3,4.001])assert.throws(()=>manualUsageDelta(v,4));
 assert.equal(manualUsageDelta('',4),null);assert.deepEqual(manualUsageDelta('9',4),{total:9,additional:5});
});
