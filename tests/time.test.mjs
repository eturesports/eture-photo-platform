function offsetAt(instant, tz){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
    .formatToParts(instant).reduce((a,x)=>(a[x.type]=x.value,a),{});
  return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute,+p.second)-instant.valueOf();
}
function wallClockToInstant(naive, tz='Europe/Madrid'){
  const first=new Date(naive.valueOf()-offsetAt(naive,tz));
  return new Date(naive.valueOf()-offsetAt(first,tz));
}
function localDateISO(i,tz='Europe/Madrid'){
  return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(i);
}
// exifr gives a Date whose UTC fields are the camera's wall-clock digits.
const naive = s => new Date(s+'Z');
const results=[];
const check=(n,p,d)=>results.push({n,p,d});

// Summer (CEST, UTC+2): 18:04 local == 16:04Z
const summer = wallClockToInstant(naive('2026-07-14T18:04:11'));
check('summer 18:04 Madrid -> 16:04Z', summer.toISOString()==='2026-07-14T16:04:11.000Z', summer.toISOString());

// Winter (CET, UTC+1): 18:04 local == 17:04Z
const winter = wallClockToInstant(naive('2026-01-14T18:04:11'));
check('winter 18:04 Madrid -> 17:04Z', winter.toISOString()==='2026-01-14T17:04:11.000Z', winter.toISOString());

// The bug this fixes: a late training that UTC pushes into the next day.
const late = wallClockToInstant(naive('2026-07-14T23:30:00'));
check('late session keeps its local date', localDateISO(late)==='2026-07-14', `${late.toISOString()} -> ${localDateISO(late)}`);
const uncorrected = naive('2026-07-14T23:30:00');
check('...which the naive reading got wrong', uncorrected.toISOString().slice(0,10)==='2026-07-14' && localDateISO(uncorrected)==='2026-07-15', 'naive drifts to the 15th locally');

// DST boundary: clocks go forward 29 Mar 2026 at 02:00 -> 03:00
const dst = wallClockToInstant(naive('2026-03-29T03:30:00'));
check('just after DST jump resolves', localDateISO(dst)==='2026-03-29', `${dst.toISOString()} -> ${localDateISO(dst)}`);

// Two sessions in one day stay an hour apart, not skewed.
const morning=wallClockToInstant(naive('2026-07-14T10:00:00'));
const evening=wallClockToInstant(naive('2026-07-14T19:00:00'));
check('same-day gap preserved', (evening-morning)/3600000===9, `${(evening-morning)/3600000}h`);

for(const r of results) console.log(`${r.p?'PASS':'FAIL'}  ${r.n}${r.d?`  (${r.d})`:''}`);
const f=results.filter(r=>!r.p).length;
console.log(`\n${results.length-f}/${results.length} passed`);
process.exit(f?1:0);
