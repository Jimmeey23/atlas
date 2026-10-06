import {kraDefinitions} from './kra-metrics.mjs';
export const overrideFields=['current','lastYear','preceding','yoy','previousGrowth','status','explanation'];
export function validateKraEdit(period,id,body) {
 if(!/^(review|2026-(0[6-9]|1[01]))$/.test(period)||!kraDefinitions.some(kra=>kra.id===id))return 'Invalid KRA or period.';
 const info=body?.info,data=body?.data;
 if(!info||!data||typeof info.area!=='string'||!info.area.trim()||info.area.length>200||typeof info.target!=='string'||info.target.length>2000||typeof info.weight!=='number'||!Number.isFinite(info.weight)||info.weight<0||info.weight>100)return 'Provide a KRA name, target and weight between 0 and 100.';
 for(const field of ['current','lastYear','preceding','status','explanation'])if(data[field]!==null&&(typeof data[field]!=='string'||data[field].length>(field==='explanation'?6000:500)))return 'Invalid achievement or explanation.';
 for(const field of ['yoy','previousGrowth'])if(data[field]!==null&&(typeof data[field]!=='number'||!Number.isFinite(data[field])||Math.abs(data[field])>1e6))return 'Invalid growth percentage.';
 if(typeof data.note!=='string'||data.note.length>10000||typeof data.annotation!=='string'||data.annotation.length>10000)return 'Notes and annotations must be at most 10,000 characters.';
 if(body.expectedUpdatedAt!==null&&(typeof body.expectedUpdatedAt!=='string'||body.expectedUpdatedAt.length>100))return 'Invalid saved version.';
 return null;
}
