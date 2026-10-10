import test from 'node:test';
import assert from 'node:assert/strict';
import {groupable,groupColumn,groupValueSQL,groupLabel,sortGroupFields,withChosen,groupCandidates} from '../src/data/group-fields';
test('group-by registry offers real columns only and never sensitive or injectable identifiers',()=>{
 for(const f of ['location','trainer','nf_first_visit_type','utm_campaign','is_new','capacity','class_no']) assert.ok(groupable(f),f);
 for(const f of ['email','phone','nf_email','nf_phone_number','member_id','row_id','raw_json','revenue','not_a_column','location"; DROP TABLE x;--','Location']) assert.ok(!groupable(f),f);
 assert.ok(groupCandidates().every(groupable));
 assert.throws(()=>groupColumn('email'));
});
test('group-by expressions keep text columns untouched and label typed columns as text',()=>{
 assert.equal(groupColumn('location'),'"location"');
 assert.equal(groupColumn('capacity'),'CAST("capacity" AS VARCHAR)');
 assert.equal(groupValueSQL('is_new',"Not o'set"),`COALESCE(CAST("is_new" AS VARCHAR),'Not o''set')`);
});
test('group-by labels prefer sheet headers and keep chosen fields visible',()=>{
 assert.equal(groupLabel('nf_first_visit_type'),'New sheet · First Visit Type');
 assert.equal(groupLabel('trainer'),'Instructor');
 assert.equal(groupLabel('payment_method'),'Payment method');
 const sorted=sortGroupFields(['nf_source','zebra_field','location','trainer']);
 assert.deepEqual(sorted.map(f=>f.field),['location','trainer','zebra_field','nf_source']);
 assert.deepEqual(withChosen(sorted,['month']).at(-1),{field:'month',label:'Month'});
 assert.equal(withChosen(sorted,['location']),sorted);
});
