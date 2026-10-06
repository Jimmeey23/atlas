import test from 'node:test';import assert from 'node:assert/strict';
import {recordedChurn,eligibleMembership} from '../server/kra-churn.mjs';
import {normalise} from '../src/data/normalise';
test('zero-value complimentary and open-class samples are excluded from the churn cohort',()=>{
 const columns=['Member ID','Status','Membership Name','Sessions Limit','Purchase Date','Start Date','End Date','Churned Date','Amount Paid','Total Sessions Completed'];
 const raw={key:'lapsed',columns,rows:[['1','New','Studio Complimentary Referral Class','','05/08/2026 08:02:02','07/08/2026 09:00:00','14/08/2026 09:00:00','',0,0],['2','New','Studio Open Barre Class','','27/07/2026 11:25:08','29/07/2026 19:15:00','12/08/2026 19:15:00','',0,0]]};
 const rows=normalise(raw,false).rows;assert.equal(rows[0].end_date,'2026-08-14');assert.equal(rows[0].churned_date??null,null);
 const result=recordedChurn(rows,'2026-08-01','2026-08-31','2026-10-06');assert.equal(result.due,0);assert.equal(result.lapsed,0);assert.equal(result.rate,null);
});
test('churn cohort excludes zero value, frozen and excluded membership names',()=>{
 const rows=[
 {member_id:'a',source_row:2,end_date:'2026-06-02',churned_date:'2026-06-02',revenue:0,status:'Lapsed',product:'Unlimited Monthly'},
 {member_id:'b',source_row:3,end_date:'2026-06-03',churned_date:'2026-06-03',revenue:5000,status:'Frozen',product:'Unlimited Monthly'},
 {member_id:'c',source_row:4,end_date:'2026-06-04',churned_date:'2026-06-04',revenue:2000,status:'Lapsed',product:'Studio Intro Offer'},
 {member_id:'d',source_row:5,end_date:'2026-06-04',churned_date:'2026-06-04',revenue:2000,status:'Lapsed',product:'2 For 1 Pack'},
 {member_id:'e',source_row:6,end_date:'2026-06-04',churned_date:'2026-06-04',revenue:2000,status:'Lapsed',product:'Studio Single Class'},
 {member_id:'f',source_row:7,end_date:'2026-06-04',churned_date:'2026-06-04',revenue:2000,status:'Lapsed',product:'Studio Private Session'},
 {member_id:'g',source_row:8,end_date:'2026-06-04',churned_date:'2026-06-04',revenue:2000,status:'Lapsed',product:'Class Credit 10'},
 {member_id:'h',source_row:9,end_date:'2026-06-04',churned_date:'2026-06-04',revenue:2000,status:'Lapsed',product:'Copper & Cloves Single Class'},
 {member_id:'i',source_row:10,end_date:'2026-06-05',churned_date:'2026-06-05',revenue:9000,status:'Lapsed',product:'Studio 4 Class Package'},
 {member_id:'j',source_row:11,end_date:'2026-06-06',churned_date:null,revenue:9000,status:'Renewed',product:'Unlimited Monthly'},
 {member_id:'k',source_row:12,end_date:'2026-06-06',churned_date:null,revenue:9000,status:'Lapsed',product:'Unlimited Monthly'},
 ];
 const result=recordedChurn(rows,'2026-06-01','2026-06-06','2026-10-06');
 assert.equal(result.due,3);assert.equal(result.lapsed,1);assert.equal(result.renewed,1);assert.equal(result.missingDates,1);
 assert.equal(result.rate,1/3);assert.equal(result.rows.filter(row=>row.churn_included).length,1);
 assert.equal(recordedChurn(rows,'2026-08-01','2026-08-31','2026-10-06').rate,null);
});
test('eligibility rule matches names case-insensitively',()=>{
 assert.equal(eligibleMembership({revenue:100,product:'STUDIO INTRO PACK'}),false);
 assert.equal(eligibleMembership({revenue:100,product:'Unlimited Monthly',status:'Active'}),true);
 assert.equal(eligibleMembership({revenue:null,product:'Unlimited Monthly'}),false);
});
