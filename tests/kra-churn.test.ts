import test from 'node:test';import assert from 'node:assert/strict';
import {recordedChurn,eligibleMembership} from '../server/kra-churn.mjs';
import {normalise} from '../src/data/normalise';
test('zero-value complimentary and open-class samples are excluded from the churn cohort',()=>{
 const columns=['Member ID','Status','Membership Name','Sessions Limit','Purchase Date','Start Date','End Date','Churned Date','Amount Paid','Total Sessions Completed'];
 const raw={key:'lapsed',columns,rows:[['1','New','Studio Complimentary Referral Class','','05/08/2026 08:02:02','07/08/2026 09:00:00','14/08/2026 09:00:00','',0,0],['2','New','Studio Open Barre Class','','27/07/2026 11:25:08','29/07/2026 19:15:00','12/08/2026 19:15:00','',0,0]]};
 const rows=normalise(raw,false).rows;assert.equal(rows[0].end_date,'2026-08-14');assert.equal(rows[0].churned_date??null,null);
 const result=recordedChurn(rows,'2026-08-01','2026-08-31','2026-10-06');assert.equal(result.due,0);assert.equal(result.lapsed,0);assert.equal(result.rate,null);
});
test('churn cohort uses Status with a 30-day grace after the Churned Date and excludes zero value, frozen, not activated and excluded names',()=>{
 const row=(member_id,source_row,end_date,revenue,status,product,churned_date=status==='Lapsed'?end_date:null)=>({member_id,source_row,start_date:'2026-05-01',end_date,churned_date,revenue,status,product});
 const rows=[
 row('a',2,'2026-06-02',0,'Lapsed','Unlimited Monthly'),
 row('b',3,'2026-06-03',5000,'Frozen','Unlimited Monthly'),
 row('c',4,'2026-06-04',2000,'Lapsed','Studio Intro Offer'),
 row('d',5,'2026-06-04',2000,'Lapsed','2 For 1 Pack'),
 row('e',6,'2026-06-04',2000,'Lapsed','Studio Single Class'),
 row('f',7,'2026-06-04',2000,'Lapsed','Studio Private Session'),
 row('g',8,'2026-06-04',2000,'Lapsed','Class Credit 10'),
 row('h',9,'2026-06-04',2000,'Lapsed','Copper & Cloves Single Class'),
 row('i',10,'2026-06-05',9000,'Lapsed','Studio 4 Class Package'),
 row('j',11,'2026-06-06',9000,'Renewed','Unlimited Monthly'),
 row('k',12,'2026-06-06',9000,'Lapsed','Unlimited Monthly','2026-09-20'),
 row('l',13,'2026-06-06',9000,'Not Activated','Unlimited Monthly'),
 row('m',14,'2026-06-06',9000,'Active','Unlimited Monthly'),
 row('n',15,'2026-06-06',9000,'Lapsed','Unlimited Monthly',null),
 ];
 const result=recordedChurn(rows,'2026-06-01','2026-06-06','2026-10-06');
 // k churned 16 days before the observation date: still in grace. n has no Churned Date: End Date decides.
 assert.equal(result.due,4);assert.equal(result.lapsed,2);assert.equal(result.renewed,1);assert.equal(result.grace,1);
 assert.equal(result.rate,2/4);assert.deepEqual(result.rows.filter(row=>row.churn_included).map(row=>row.member_id),['i','n']);
 // Exactly 30 days after the Churned Date is lapsed; 29 days is grace.
 assert.equal(recordedChurn([row('p',20,'2026-06-06',9000,'Lapsed','Unlimited Monthly','2026-09-06')],'2026-06-01','2026-06-30','2026-10-06').lapsed,1);
 assert.equal(recordedChurn([row('q',21,'2026-06-06',9000,'Lapsed','Unlimited Monthly','2026-09-07')],'2026-06-01','2026-06-30','2026-10-06').grace,1);
 assert.equal(recordedChurn(rows,'2026-08-01','2026-08-31','2026-10-06').rate,null);
});
test('eligibility rule matches names case-insensitively',()=>{
 assert.equal(eligibleMembership({revenue:100,product:'STUDIO INTRO PACK'}),false);
 assert.equal(eligibleMembership({revenue:100,product:'Unlimited Monthly',status:'Lapsed'}),true);
 assert.equal(eligibleMembership({revenue:100,product:'Unlimited Monthly',status:'Not Activated'}),false);
 assert.equal(eligibleMembership({revenue:null,product:'Unlimited Monthly'}),false);
});
