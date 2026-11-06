const test=require('node:test'),assert=require('node:assert/strict');
const {preparationEnabled,storageReady}=require('../src/services/zermattBenefitPreparationReadiness');
test('benefit preparation flag is explicit and independent of payroll activation',()=>{
 assert.equal(preparationEnabled({}),false);
 assert.equal(preparationEnabled({CHRIS_ZERMATT_BENEFIT_PREPARATION_ENABLED:'false'}),false);
 assert.equal(preparationEnabled({CHRIS_ZERMATT_BENEFIT_PREPARATION_ENABLED:'true'}),true);
 assert.equal(preparationEnabled({CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY:'true'}),false);
});
test('storage check is read-only and fails closed for missing table or uniqueness',async()=>{
 let queries=0;
 assert.equal(await storageReady({$queryRawUnsafe:async(sql)=>{assert.match(sql,/^SELECT/);queries++;return [{ready:true}];}}),true);
 assert.equal(queries,2);
 assert.equal(await storageReady({$queryRawUnsafe:async()=>{throw new Error('missing table');}}),false);
 assert.equal(await storageReady({$queryRawUnsafe:async()=>[{ready:false}]}),false);
});
