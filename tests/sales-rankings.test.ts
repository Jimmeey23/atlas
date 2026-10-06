import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSalesRankings,salesRankingCriteria} from '../src/data/sales-rankings';
test('sales rankings respect metric direction, exclude missing measures and never duplicate groups',()=>{
 const rows=Array.from({length:12},(_,i)=>({entity:String(i),gross_revenue:i*100,discount_rate:i/100}));
 const cash=splitSalesRankings([...rows,{entity:'missing',gross_revenue:null,discount_rate:null}],'gross_revenue',5);
 assert.deepEqual(cash.top.map(r=>r.entity),['11','10','9','8','7']);assert.deepEqual(cash.bottom.map(r=>r.entity),['0','1','2','3','4']);
 assert.ok(!cash.bottom.some(r=>cash.top.some(t=>t.entity===r.entity)));
 const discount=splitSalesRankings(rows,'discount_rate',5);assert.equal(discount.top[0].entity,'0');assert.equal(discount.bottom[0].entity,'11');assert.equal(salesRankingCriteria.length,7);
 const sparse=splitSalesRankings(rows.slice(0,1),'gross_revenue',5);assert.equal(sparse.top.length,1);assert.equal(sparse.bottom.length,0);
});
