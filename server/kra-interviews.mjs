// Systems Executive (Automation Analyst) hiring interviews, taken from the calendar record for the KRA period.
// Recorded evidence of hiring activity; it does not certify a completed hire.
const schedule = [
  ['2026-06-02','13:00','13:30','Abhishek Bagate',2,'Virtual'],
  ['2026-06-04','12:00','12:30','Hershall Prasahar',2,'Virtual'],
  ['2026-06-09','12:15','12:35','Devansh Makwana',1,'Virtual'],
  ['2026-07-03','15:15','15:30','Vishal Patil',1,'Virtual'],
  ['2026-07-03','15:30','15:45','Sajid Khan',1,'Virtual'],
  ['2026-07-03','15:45','16:00','Akansh Rajpoot',1,'Virtual'],
  ['2026-07-07','14:45','15:00','Sachin Gupta',1,'Virtual'],
  ['2026-07-08','12:00','12:15','Sonal Marthak',1,'Virtual'],
  ['2026-07-14','15:00','15:15','Rohit Jain',1,'Virtual'],
  ['2026-07-14','15:15','15:30','Kaushal Thapa',1,'Virtual'],
  ['2026-07-21','12:00','12:15','Aniket Jadhav',1,'Virtual'],
  ['2026-08-26','14:00','14:30','Mayank Kumar',2,'Virtual'],
  ['2026-08-26','14:30','15:00','Aditya Singh',2,'Virtual'],
  ['2026-08-28','12:00','12:30','Drashti Chovatiya',2,'Virtual'],
  ['2026-09-01','12:00','12:30','Shruti Gurav',2,'Virtual'],
  ['2026-09-04','15:00','15:15','Chinmay Kadam',2,'Virtual'],
  ['2026-09-11','14:00','14:15','Zaid Khan',2,'Virtual'],
  ['2026-09-11','14:20','14:35','Mayur Chaudhari',2,'Virtual'],
  ['2026-09-11','14:40','14:55','Adithya V',2,'Virtual'],
  ['2026-10-02','15:00','15:15','Mayuri Parkhe',2,'Virtual'],
  ['2026-10-02','15:15','15:30','Saif Shirgaonkar',2,'Virtual'],
  ['2026-10-02','15:30','15:45','Pranjal Shukla',2,'Virtual'],
  ['2026-10-02','15:45','16:00','Saumitra Chaubey',2,'Virtual'],
  ['2026-10-02','16:20','16:35','Noor Ansari',2,'Virtual'],
  ['2026-10-09','12:00','12:30','Saumitra Chaubey',3,'In person'],
];
const minutes = (from,to) => (Number(to.slice(0,2))-Number(from.slice(0,2)))*60+Number(to.slice(3))-Number(from.slice(3));
export const interviewRecords = schedule.map(([date,from,to,candidate,level,mode],index)=>({
  source_row:index+1,date,start:from,end:to,candidate,level,mode,role:'Systems Executive · Automation Analyst',minutes:minutes(from,to),
}));
export function interviewSummary(records,from,to,horizon=to) {
  const held=records.filter(row=>row.date>=from&&row.date<=to);
  const scheduled=records.filter(row=>row.date>to&&row.date<=horizon);
  const byLevel=level=>held.filter(row=>row.level===level).length;
  return {
    from,to,horizon,interviews:held.length,candidates:new Set(held.map(row=>row.candidate)).size,
    level1:byLevel(1),level2:byLevel(2),level3:byLevel(3),inPerson:held.filter(row=>row.mode==='In person').length,
    minutes:held.reduce((total,row)=>total+row.minutes,0),upcoming:scheduled.length,
    months:[...new Set(held.map(row=>row.date.slice(0,7)))].sort(),
    rows:[...held.map(row=>({...row,state:'Held'})),...scheduled.map(row=>({...row,state:'Scheduled'}))],
  };
}
