import test from 'node:test';
import assert from 'node:assert/strict';
import {metrics} from '../src/semantics/metrics.ts';
import {fmt,formatField} from '../src/semantics/formats.ts';
test('numeric display fields have at most one decimal without changing identifiers or dates',()=>{
 for(const field of ['Payment Value','gross_sales','revenue','lifetime_value','value','utilisation','days_absent','unknown_numeric','booking_lead_time_days']) assert.doesNotMatch(formatField(field,123456.12345678),/\.\d{2,}/,field);
 assert.equal(formatField('Payment VAT','1,234.5678'),'₹1,235');
 assert.equal(formatField('payment_value',1234.5678),'₹1,235');
 assert.equal(formatField('missing_vat',2),'2');
 assert.equal(formatField('member_id','000012345678'),'000012345678');
 assert.equal(formatField('date','2026-04-01'),'2026-04-01');
 assert.equal(formatField('member_phone','0987654321'),'0987654321');
 assert.equal(fmt('ltv_cac_ratio',1.23456789).match(/\.\d{2,}/),null);
});

test('every registered metric uses its metric formatter in generic tables',()=>{
 for(const id of Object.keys(metrics)) assert.equal(formatField(id,1.23456789),fmt(id,1.23456789,true),id);
});
