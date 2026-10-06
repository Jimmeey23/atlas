// Team training sessions delivered in the KRA period, taken from the calendar record.
// Dated delivery evidence for the Team Training KRA; the soft-skills milestone checks remain separate.
const schedule = [
  ['2026-08-19','12:00','15:30','Team Training - In Person','Team training','In person'],
  ['2026-09-02','13:45','15:00','Admin Operations Training','Admin operations','In person'],
  ['2026-09-07','15:00','16:30','Full training + ops meet','Team training','In person'],
  ['2026-09-09','14:00','15:30','Admin Operations Training','Admin operations','In person'],
  ['2026-09-16','13:30','15:30','Team Training - with Mitali (IRL)','Team training','In person'],
  ['2026-09-23','13:00','15:00','Team Training - IRL','Team training','In person'],
];
const minutes = (from,to) => (Number(to.slice(0,2))-Number(from.slice(0,2)))*60+Number(to.slice(3))-Number(from.slice(3));
export const trainingRecords = schedule.map(([date,from,to,session,category,mode],index)=>({
  source_row:index+1,date,start:from,end:to,session,category,mode,minutes:minutes(from,to),state:'Completed',
}));
export function trainingSummary(records,from,to) {
  const held=records.filter(row=>row.date>=from&&row.date<=to);
  const byCategory=category=>held.filter(row=>row.category===category).length;
  return {
    from,to,sessions:held.length,teamTraining:byCategory('Team training'),adminOperations:byCategory('Admin operations'),
    inPerson:held.filter(row=>row.mode==='In person').length,
    minutes:held.reduce((total,row)=>total+row.minutes,0),
    months:[...new Set(held.map(row=>row.date.slice(0,7)))].sort(),
    lastSession:held.map(row=>row.date).sort().at(-1)??null,
    rows:held,
  };
}
