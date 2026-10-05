import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { metrics } from "../src/semantics/metrics.ts";

test("cash net reconciles to collected gross less payment VAT, not list price", async () => {
  const db = await DuckDBInstance.create(":memory:"); const c = await db.connect();
  try {
    const result=await c.runAndReadAll(`SELECT ${metrics.net_revenue.sql({rate:1200,today:'2026-10-05'})} AS value FROM (VALUES (100.0,5.0,500.0),(200.0,10.0,900.0)) t(revenue,vat,net)`);
    assert.equal(result.getRowObjectsJS()[0].value,285);
  } finally {c.closeSync();db.closeSync();}
});
test("attendance revenue excludes no-shows and matches per-checkin numerator", async () => {
  const db=await DuckDBInstance.create(":memory:");const c=await db.connect();
  try {
    const result=await c.runAndReadAll(`SELECT ${metrics.checkin_revenue.sql({rate:1200,today:'2026-10-05'})} AS revenue, ${metrics.revenue_per_checkin.sql({rate:1200,today:'2026-10-05'})} AS per_visit FROM (VALUES (true,100.0),(true,200.0),(false,900.0)) t(attended,revenue)`);
    const row=result.getRowObjectsJS()[0];assert.equal(row.revenue,300);assert.equal(row.per_visit,150);
  }finally{c.closeSync();db.closeSync();}
});
test("newcomer retention excludes non-new members from the cohort", async () => {
  const db=await DuckDBInstance.create(":memory:");const c=await db.connect();
  try {const result=await c.runAndReadAll(`SELECT ${metrics.retention_rate.sql({rate:1200,today:'2026-10-05'})} AS rate FROM (VALUES (true,'Retained'),(true,'Not Retained'),(false,'Not New')) t(is_new,retention)`);assert.equal(result.getRowObjectsJS()[0].rate,.5);}finally{c.closeSync();db.closeSync();}
});
test("teaching time counts sessions once and revenue shares duration coverage", async () => {
 const db=await DuckDBInstance.create(":memory:");const c=await db.connect();
 try {const result=await c.runAndReadAll(`SELECT ${metrics.teaching_hours.sql({rate:1200,today:'2026-10-05'})} AS hours, ${metrics.revenue_per_hour.sql({rate:1200,today:'2026-10-05'})} AS yield FROM (VALUES (1,60.0,true,100.0),(2,60.0,true,200.0),(NULL,NULL,true,900.0)) t(teaching_session_rank,duration,attended,revenue)`);const row=result.getRowObjectsJS()[0];assert.equal(row.hours,1);assert.equal(row.yield,300);}finally{c.closeSync();db.closeSync();}
});

import { comparisonDates } from "../src/data/periods.ts";
test("complete calendar months compare to complete prior months", () => {
 assert.deepEqual(comparisonDates('2026-09-01','2026-09-30','prior'),{from:'2026-08-01',to:'2026-08-31'});
 assert.deepEqual(comparisonDates('2026-01-01','2026-03-31','prior'),{from:'2025-10-01',to:'2025-12-31'});
 assert.deepEqual(comparisonDates('2024-02-01','2024-02-29','year'),{from:'2023-02-01',to:'2023-02-28'});
 assert.deepEqual(comparisonDates('2026-09-05','2026-09-07','prior'),{from:'2026-09-02',to:'2026-09-04'});
});

import { normalise } from "../src/data/normalise.ts";
test("sales discounts use item amounts rather than repeating sale totals", () => {
 const result=normalise({key:'sales',title:'Sales',id:'test',columns:['Payment Value','Discount Value In Currency','Sale Item Unit Discount Value','Sale Item Quantity'],rows:[[500,900,20,2],[1000,900,50,1]],status:'ok',fetchedAt:1,loadMs:0});
 assert.equal(result.rows.reduce((sum,r)=>sum+Number(r.discount),0),90);
});

test("time and location filters use the same identities across sheets", () => {
 const data=(key:string,columns:string[],rows:any[])=>({key,title:key,id:'test',columns,rows,status:'ok',fetchedAt:1,loadMs:0});
 const session=normalise(data('sessions',['Date','Time','Location'],[['2026-09-01','07:15:00','the Studio By Copper + Cloves']])).rows[0];
 const booking=normalise(data('bookings',['Session Date','Time Slot','Location Name'],[['2026-09-01 07:15','Morning','The Studio by Copper + Cloves']])).rows[0];
 assert.equal(session.time,'07:15');assert.equal(booking.time,session.time);assert.equal(booking.location,session.location);
});

import { bookingOutcomeCase } from "../src/semantics/booking-outcomes.ts";
test("booking chart outcomes assign overlapping flags to one category", async () => {
 const db=await DuckDBInstance.create(":memory:");const c=await db.connect();
 try {const result=await c.runAndReadAll(`SELECT outcome, COUNT(*)::INTEGER AS n FROM (SELECT ${bookingOutcomeCase} AS outcome FROM (VALUES (true,true,1,true),(false,true,0,true),(false,false,0,true),(true,false,0,false),(NULL,NULL,NULL,NULL)) t(attended,cancelled,late_cancelled,no_show)) GROUP BY outcome`);const counts=Object.fromEntries(result.getRowObjectsJS().map(r=>[r.outcome,r.n]));assert.deepEqual(counts,{late:1,cancelled:1,no_show:1,attended:1,pending:1});}finally{c.closeSync();db.closeSync();}
});

test("active access excludes future starts, expired access and frozen memberships", async () => {
 const db=await DuckDBInstance.create(":memory:");const c=await db.connect();
 try {const result=await c.runAndReadAll(`SELECT ${metrics.active_memberships.sql({rate:1200,today:'2026-10-05'})}::INTEGER AS active FROM (VALUES ('Active','2026-10-01','2026-11-01'),('Active','2026-10-10','2026-11-01'),('Active','2026-09-01','2026-09-30'),('Frozen','2026-10-01','2026-11-01')) t(status,start_date,end_date)`);assert.equal(result.getRowObjectsJS()[0].active,1);}finally{c.closeSync();db.closeSync();}
});
