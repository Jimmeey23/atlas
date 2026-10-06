import test from 'node:test';import assert from 'node:assert/strict';
import {recordedChurn} from '../server/kra-churn.mjs';
import {normalise} from '../src/data/normalise';
test('provided Lapsed samples have no churn despite expired complimentary access',()=>{
 const columns=['Member ID','Status','Membership Name','Sessions Limit','Purchase Date','Start Date','End Date','Churned Date','Amount Paid','Total Sessions Completed'];
 const raw={key:'lapsed',columns,rows:[['1','New','Studio Complimentary Referral Class','','05/08/2026 08:02:02','07/08/2026 09:00:00','14/08/2026 09:00:00','',0,0],['2','New','Studio Open Barre Class','','27/07/2026 11:25:08','29/07/2026 19:15:00','12/08/2026 19:15:00','',0,0]]};
 const rows=normalise(raw,false).rows;assert.equal(rows[0].end_date,'2026-08-14');assert.equal(rows[0].churned_date??null,null);
 const result=recordedChurn(rows,'2026-08-01','2026-08-31','2026-10-06');assert.equal(result.due,2);assert.equal(result.lapsed,0);assert.equal(result.rate,0);
});
test('recorded churn includes free and single sessions, counts source records and respects date cutoffs',()=>{
 const rows=[
 {member_id:'a',source_row:2,end_date:'2026-06-02',churned_date:'2026-06-02',revenue:0,status:'Lapsed'},
 {member_id:'a',source_row:3,end_date:'2026-06-03',churned_date:null,revenue:100,status:'Renewed'},
 {member_id:'b',source_row:4,end_date:'2026-06-04',churned_date:null,status:'Lapsed'},
 {member_id:null,source_row:5,end_date:'2026-06-05',churned_date:'2026-06-05',revenue:100,product:'Single Class'},
 {source_row:6,end_date:'2026-06-06',churned_date:'2026-06-12'},
 {source_row:7,end_date:'2026-06-10',churned_date:'2026-06-10'},
 ];
 const result=recordedChurn(rows,'2026-06-01','2026-06-06','2026-10-06');assert.equal(result.due,5);assert.equal(result.lapsed,2);assert.equal(result.rate,.4);assert.equal(result.renewed,1);assert.equal(result.missingDates,1);assert.equal(result.rows.filter(row=>row.churn_included).length,2);
 assert.equal(recordedChurn(rows,'2026-08-01','2026-08-31','2026-10-06').rate,null);
});
