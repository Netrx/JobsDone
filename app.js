const STORAGE_KEY = "furniture-income-app-v1";
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WEEKDAYS = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

let state = migrateState(loadState());
let deferredInstallPrompt = null;
let pauseTimerInterval = null;
let pauseTimerStart = null;
let activePauseData = null;

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function loadState(){
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return clone(window.APP_SEED);
}
function migrateState(data){
  const next=data&&typeof data==="object"?data:clone(window.APP_SEED);
  next.orders=Array.isArray(next.orders)?next.orders:[];
  next.settings=next.settings||{standardStart:"10:00",standardEnd:"18:00"};
  next.dailyHours=next.dailyHours||{};
  next.weekendHours=next.weekendHours||{};
  next.workDays=next.workDays&&typeof next.workDays==="object"?next.workDays:{};
  next.orders=next.orders.map(o=>({
    ...o,
    status:o.status||(!o.endDate?"in_progress":"completed")
  }));
  if (!next.orderPauses) next.orderPauses = {};
  return next;
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}
function toast(message){
  const el=document.getElementById("toast");
  el.textContent=message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}
function money(value){ return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(Number(value)||0)+" ₽"; }
function number(value,digits=1){ return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:digits}).format(Number(value)||0); }
function formatHoursMinutes(hoursDecimal) {
  const h = Math.floor(hoursDecimal);
  const m = Math.round((hoursDecimal - h) * 60);
  if (h === 0 && m === 0) return "0 ч 0 м";
  if (h === 0) return `${m} м`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} м`;
}
function parseTime(value){
  if(!value) return 0;
  const [h,m]=value.split(":").map(Number);
  return h+m/60;
}
function toISODate(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseDate(s){ return new Date(`${s}T12:00:00`); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function todayISO(){ return toISODate(new Date()); }
function nowHHMM(){const d=new Date();return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
function mondayISO(date){
  const d=new Date(date),day=(d.getDay()+6)%7;
  return toISODate(addDays(d,-day));
}
function standardHours(){ return Math.max(0,parseTime(state.settings.standardEnd)-parseTime(state.settings.standardStart)); }
function legacyWeekendHours(date){
  const cfg=state.weekendHours[mondayISO(date)]||{sat:0,sun:0};
  return date.getDay()===6?Number(cfg.sat)||0:Number(cfg.sun)||0;
}
function scheduledHours(date){
  const key=toISODate(date);
  if(Object.prototype.hasOwnProperty.call(state.dailyHours,key)) return Math.max(0,Number(state.dailyHours[key])||0);
  const dow=date.getDay();
  if(dow===0||dow===6) return legacyWeekendHours(date);
  return standardHours();
}
function getWorkStartEndForDate(date){
  const key=typeof date==="string"?date:toISODate(date);
  const wd=state.workDays?.[key];
  if(wd&&wd.start){
    const start=parseTime(wd.start);
    const end=wd.end?parseTime(wd.end):parseTime(wd.currentEnd||"");
    if(end>start) return {start,end};
    return null;
  }
  const d=parseDate(key), hours=scheduledHours(d);
  if(hours>0){
    const start=parseTime(state.settings.standardStart);
    return {start,end:start+hours};
  }
  return null;
}
function workIntervalsForDate(date){
  const key=typeof date==="string"?date:toISODate(date);
  const wd=state.workDays?.[key];
  if(wd&&wd.start){
    const start=parseTime(wd.start);
    const end=wd.end?parseTime(wd.end):parseTime(wd.currentEnd||"");
    if(end>start){
      const pauses=Array.isArray(wd.pauses)?wd.pauses:[];
      const intervals=[];
      let cursor=start;
      pauses.forEach(p=>{
        const ps=parseTime(p.start), pe=parseTime(p.end);
        if(ps>cursor) intervals.push([cursor,Math.min(ps,end)]);
        if(pe>cursor) cursor=Math.max(cursor,pe);
      });
      if(cursor<end) intervals.push([cursor,end]);
      return intervals.filter(x=>x[1]>x[0]);
    }
    if(!wd.end && wd.pausedAt){
      return [[start,parseTime(wd.pausedAt)]].filter(x=>x[1]>x[0]);
    }
    return [];
  }
  const d=parseDate(key), hours=scheduledHours(d);
  return hours>0?[[parseTime(state.settings.standardStart),parseTime(state.settings.standardStart)+hours]]:[];
}
function isCompleted(order){ return (order.status||"completed")==="completed"; }
function overlapHours(a,b,start,end){
  return Math.max(0,Math.min(b,end)-Math.max(a,start));
}
function getOrderPauses(orderId, date) {
  const key = `${orderId}_${date}`;
  return state.orderPauses?.[key] || [];
}
function saveOrderPauses(orderId, date, pauses) {
  if (!state.orderPauses) state.orderPauses = {};
  const key = `${orderId}_${date}`;
  if (pauses.length === 0) {
    delete state.orderPauses[key];
  } else {
    state.orderPauses[key] = pauses;
  }
  saveState();
}
function orderPauseHoursOnDate(order, iso){
  const workRange = getWorkStartEndForDate(iso);
  if(!workRange) return 0;
  const {start:workStart, end:workEnd} = workRange;
  const pauses = getOrderPauses(order.id, iso);
  let totalPauseHours = 0;
  for (const pause of pauses) {
    const pauseStart = parseTime(pause.start);
    const pauseEnd = parseTime(pause.end);
    if(pauseEnd > pauseStart){
      const overlap = overlapHours(pauseStart, pauseEnd, workStart, workEnd);
      totalPauseHours += Math.max(0, overlap);
    }
  }
  return totalPauseHours;
}
function orderHoursOnDate(order, iso){
  const dayStart=parseDate(iso);
  const isFirst=iso===order.startDate;
  const isLast=iso===order.endDate || (order.status==="in_progress" && iso===todayISO());
  const orderStart=isFirst?parseTime(order.startTime):0;
  const now=new Date();
  const currentHour=now.getHours()+now.getMinutes()/60;
  const orderEnd=(order.status==="in_progress" && iso===todayISO())?currentHour:(isLast?parseTime(order.endTime):24);
  if(order.status==="in_progress" && iso>todayISO()) return 0;
  const workIntervals = workIntervalsForDate(iso);
  if (workIntervals.length === 0) return 0;
  const pauses = getOrderPauses(order.id, iso);
  let totalHours = 0;
  for (const [start, end] of workIntervals) {
    let intervalHours = overlapHours(start, end, orderStart, orderEnd);
    for (const pause of pauses) {
      const pauseStart = parseTime(pause.start);
      const pauseEnd = parseTime(pause.end);
      if (pauseEnd > pauseStart) {
        const pauseOverlap = overlapHours(start, end, Math.max(orderStart, pauseStart), Math.min(orderEnd, pauseEnd));
        intervalHours -= pauseOverlap;
      }
    }
    totalHours += Math.max(0, intervalHours);
  }
  return totalHours;
}
function dailyBreakdown(order,{pastOnly=false}={}){
  if(!order.startDate) return [];
  const endIso=order.endDate||todayISO();
  const start=parseDate(order.startDate),end=parseDate(endIso);
  if(end<start) return [];
  const out=[],today=todayISO();
  for(let d=new Date(start);d<=end;d=addDays(d,1)){
    const iso=toISODate(d);
    if(pastOnly&&iso>today) continue;
    const hours=orderHoursOnDate(order,iso);
    if(hours>0) out.push({date:iso,hours});
  }
  return out;
}
function orderHours(order,options){ return dailyBreakdown(order,options).reduce((s,x)=>s+x.hours,0); }

function analytics(year){
  const months=Array.from({length:12},(_,i)=>({month:i,hours:0,income:0,dates:new Set()}));
  for(const order of state.orders.filter(isCompleted)){
    const days=dailyBreakdown(order,{pastOnly:true}).filter(x=>x.hours>0);
    const total=days.reduce((s,x)=>s+x.hours,0);
    if(total<=0) continue;
    const byMonth={};
    for(const day of days){
      const d=parseDate(day.date);
      if(d.getFullYear()!==year) continue;
      const m=d.getMonth();
      byMonth[m]=(byMonth[m]||0)+day.hours;
      months[m].dates.add(day.date);
    }
    for(const [m,h] of Object.entries(byMonth)){
      months[Number(m)].hours+=h;
      months[Number(m)].income+=(Number(order.income)||0)*h/total;
    }
  }
  return months.map(m=>({...m,days:m.dates.size}));
}
function availableYears(){
  const years=new Set([new Date().getFullYear()]);
  state.orders.forEach(o=>{
    if(o.startDate) years.add(parseDate(o.startDate).getFullYear());
    if(o.endDate) years.add(parseDate(o.endDate).getFullYear());
  });
  Object.keys(state.dailyHours).forEach(k=>years.add(parseDate(k).getFullYear()));
  return [...years].sort((a,b)=>b-a);
}
function fillYearSelects(){
  const years=availableYears();
  for(const id of ["yearSelect","calendarYearSelect"]){
    const el=document.getElementById(id),current=Number(el.value)||new Date().getFullYear();
    el.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");
    el.value=years.includes(current)?current:years[0];
  }
}
function renderDashboard(){
  const year=Number(document.getElementById("yearSelect").value)||new Date().getFullYear();
  const data=analytics(year);
  const total=data.reduce((a,m)=>({hours:a.hours+m.hours,income:a.income+m.income,days:a.days+m.days}),{hours:0,income:0,days:0});
  const completedCount=state.orders.filter(o=>isCompleted(o)&&o.endDate&&parseDate(o.endDate).getFullYear()===year).length;
  document.getElementById("yearIncome").textContent=money(total.income);
  document.getElementById("yearHours").textContent=formatHoursMinutes(total.hours);
  document.getElementById("avgHour").textContent=money(total.hours?total.income/total.hours:0);
  document.getElementById("avgDay").textContent=money(total.days?total.income/total.days:0);
  document.getElementById("elapsedDays").textContent=total.days;
  document.getElementById("yearMeta").textContent=`${completedCount} завершённых заказов · ${formatHoursMinutes(total.hours)}`;
  const maxIncome=Math.max(1,...data.map(m=>m.income));
  document.getElementById("monthsList").innerHTML=data.map(m=>`
    <div class="month-row">
      <div class="month-name">${MONTHS[m.month]}</div>
      <div><div><strong>${money(m.income)}</strong></div><div class="month-bar"><i style="width:${Math.max(0,m.income/maxIncome*100)}%"></i></div></div>
      <div class="month-stats"><strong>${formatHoursMinutes(m.hours)}</strong><span>${money(m.days?m.income/m.days:0)} / день · ${m.days} дн.</span></div>
    </div>`).join("");
}
function filteredOrders(status){
  const q=(document.getElementById(status==="completed"?"orderSearch":"progressSearch")?.value||"").trim().toLowerCase();
  return [...state.orders].filter(o=>(isCompleted(o)?"completed":"in_progress")===status)
    .sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""))
    .filter(o=>`${o.number} ${o.work} ${o.comment}`.toLowerCase().includes(q));
}
function orderCard(o,inProgress=false){
  const h=orderHours(o,{pastOnly:true}),per=!inProgress&&h?(Number(o.income)||0)/h:0;
  const status=inProgress?'<span class="status-badge">В процессе</span>':"";
  const completion=o.endDate?`${formatDate(o.endDate)}${o.endTime?` в ${o.endTime}`:""}`:"Не указано";
  return `<article class="order-card ${inProgress?"in-progress-card":""}" data-id="${o.id}">
    <div><div class="order-title">Заказ ${escapeHtml(o.number)} ${status}</div>
    <div class="order-work">${escapeHtml(o.work||"Без описания")}</div>
    <div class="order-meta"><span>${formatDate(o.startDate)} → ${completion}</span><span>${formatHoursMinutes(h)} на сегодня</span>${inProgress?"":`<span>${money(per)}/ч</span>`}</div></div>
    <div class="order-money">${inProgress?"Не учтён":money(o.income)}<small>${escapeHtml(o.comment||"")}</small></div>
  </article>`;
}
function renderOrders(){
  const rows=filteredOrders("completed"),list=document.getElementById("ordersList");
  list.innerHTML=rows.map(o=>orderCard(o,false)).join("");
  document.getElementById("ordersEmpty").classList.toggle("hidden",rows.length>0);
  list.querySelectorAll(".order-card").forEach(el=>el.onclick=()=>openOrder(el.dataset.id));
}
function renderProgress(){
  const rows=filteredOrders("in_progress"),list=document.getElementById("progressList");
  list.innerHTML=rows.map(o=>orderCard(o,true)).join("");
  document.getElementById("progressEmpty").classList.toggle("hidden",rows.length>0);
  document.getElementById("progressCount").textContent=rows.length;
  list.querySelectorAll(".order-card").forEach(el=>el.onclick=()=>openOrder(el.dataset.id));
}
function renderCalendar(){
  const year=Number(document.getElementById("calendarYearSelect").value)||new Date().getFullYear();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const todayISOStr = todayISO();
  
  const monthsData = [];
  for(let m=0;m<12;m++){
    const days=[];
    for(let d=new Date(year,m,1,12);d.getMonth()===m;d=addDays(d,1)){
      const key=toISODate(d), wd=state.workDays?.[key]||{};
      const intervals=workIntervalsForDate(key);
      const worked=intervals.reduce((s,[a,b])=>s+b-a,0);
      const pauseActive=!!wd.pausedAt&&!wd.end;
      const pauseText=(wd.pauses||[]).map((p,i)=>`<div class="pause-row"><span>Пауза ${i+1}</span><input type="text" class="work-pause-start-edit" data-date="${key}" data-index="${i}" value="${p.start||""}" placeholder="12:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5"><span>–</span><input type="text" class="work-pause-end-edit" data-date="${key}" data-index="${i}" value="${p.end||""}" placeholder="13:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5"><button type="button" class="small danger pause-delete" data-date="${key}" data-index="${i}">×</button></div>`).join("");
      days.push(`<article class="workday-card ${pauseActive?"on-pause":""}" data-date="${key}">
        <div class="workday-head"><strong>${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}.${String(m+1).padStart(2,"0")}</strong><span>${formatHoursMinutes(worked)}</span></div>
        <div class="workday-actions">
          <button type="button" class="primary work-start" data-date="${key}">▶ Начало рабочего дня</button>
          <button type="button" class="secondary work-pause" data-date="${key}" ${!wd.start||!!wd.end?"disabled":""}>${pauseActive?"▶ Продолжить":"Ⅱ Пауза"}</button>
          <button type="button" class="secondary work-end" data-date="${key}" ${!wd.start||!!wd.end?"disabled":""}>■ Конец рабочего дня</button>
        </div>
        <div class="workday-times">
          <label>Начало<input type="text" class="work-edit-start" data-date="${key}" value="${wd.start||""}" placeholder="10:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5"></label>
          <label>Конец<input type="text" class="work-edit-end" data-date="${key}" value="${wd.end||""}" placeholder="18:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5"></label>
        </div>
        <div class="pause-list">${pauseText}</div>
        <button type="button" class="secondary add-pause" data-date="${key}" ${!wd.start||!!wd.end?"disabled":""}>+ Добавить паузу</button>
      </article>`);
    }
    
    if (year === currentYear && m === currentMonth) {
      days.sort((a, b) => {
        const dateA = a.match(/data-date="([^"]+)"/)?.[1] || '';
        const dateB = b.match(/data-date="([^"]+)"/)?.[1] || '';
        if (dateA === todayISOStr) return -1;
        if (dateB === todayISOStr) return 1;
        return dateA.localeCompare(dateB);
      });
    }
    
    monthsData.push({
      month: m,
      isCurrent: year === currentYear && m === currentMonth,
      days: days,
      html: `<details class="month-hours" ${year === currentYear && m === currentMonth ? "open" : ""}><summary>${MONTHS[m]}</summary><div class="workdays-grid">${days.join("")}</div></details>`
    });
  }
  
  monthsData.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.month - b.month;
  });
  
  const list=document.getElementById("weeksList");
  list.innerHTML=monthsData.map(m => m.html).join("");

  list.querySelectorAll(".work-start").forEach(btn=>btn.onclick=()=>{
    const date=btn.dataset.date, t=nowHHMM(), old=state.workDays[date]||{};
    state.workDays[date]={...old,start:t,end:"",pausedAt:"",pauses:Array.isArray(old.pauses)?old.pauses:[]};
    saveState(); toast(`Начало: ${date} ${t}`);
  });
  list.querySelectorAll(".work-pause").forEach(btn=>btn.onclick=()=>{
    const date=btn.dataset.date, wd=state.workDays[date]||{};
    if(wd.pausedAt){
      const t=nowHHMM(), ps=parseTime(wd.pausedAt), pe=parseTime(t);
      if(pe<=ps){toast("Время продолжения должно быть позже паузы");return;}
      wd.pauses=[...(wd.pauses||[]),{start:wd.pausedAt,end:t}]; wd.pausedAt="";
      state.workDays[date]=wd; saveState(); toast("Работа продолжена");
    }else{
      wd.pausedAt=nowHHMM(); state.workDays[date]=wd; saveState(); toast("Пауза начата");
    }
  });
  list.querySelectorAll(".work-end").forEach(btn=>btn.onclick=()=>{
    const date=btn.dataset.date, wd=state.workDays[date]||{}, t=nowHHMM();
    if(wd.pausedAt){
      const ps=parseTime(wd.pausedAt),pe=parseTime(t);
      if(pe>ps) wd.pauses=[...(wd.pauses||[]),{start:wd.pausedAt,end:t}];
      wd.pausedAt="";
    }
    if(parseTime(t)<=parseTime(wd.start)){toast("Конец должен быть позже начала");return;}
    wd.end=t; state.workDays[date]=wd; saveState(); toast(`Конец смены: ${t}`);
  });
  list.querySelectorAll(".work-edit-start,.work-edit-end").forEach(input=>input.onchange=()=>{
    const date=input.dataset.date,wd=state.workDays[date]||{};
    wd.start=document.querySelector(`.work-edit-start[data-date="${date}"]`).value;
    wd.end=document.querySelector(`.work-edit-end[data-date="${date}"]`).value;
    if(wd.start&&wd.end&&parseTime(wd.end)<=parseTime(wd.start)){toast("Конец должен быть позже начала");return;}
    state.workDays[date]=wd;saveState();toast("Рабочий день изменён");
  });
  list.querySelectorAll(".add-pause").forEach(btn=>btn.onclick=()=>{
    const date=btn.dataset.date,wd=state.workDays[date]||{};
    wd.pauses=[...(wd.pauses||[]),{start:"",end:""}];state.workDays[date]=wd;saveState();toast("Пауза добавлена");
  });
  list.querySelectorAll(".pause-delete").forEach(btn=>btn.onclick=()=>{
    const date=btn.dataset.date,i=Number(btn.dataset.index),wd=state.workDays[date]||{};
    wd.pauses=(wd.pauses||[]).filter((_,idx)=>idx!==i);state.workDays[date]=wd;saveState();toast("Пауза удалена");
  });
  list.querySelectorAll(".work-pause-start-edit,.work-pause-end-edit").forEach(input=>input.onchange=()=>{
    const date=input.dataset.date,i=Number(input.dataset.index),wd=state.workDays[date]||{};
    wd.pauses=wd.pauses||[];wd.pauses[i]=wd.pauses[i]||{};
    if(input.classList.contains("work-pause-start-edit")) wd.pauses[i].start=input.value; else wd.pauses[i].end=input.value;
    state.workDays[date]=wd;saveState();toast("Пауза изменена");
  });
}
function renderSettings(){
  document.getElementById("standardStart").value=state.settings.standardStart;
  document.getElementById("standardEnd").value=state.settings.standardEnd;
}
function renderAll(){ fillYearSelects(); renderDashboard(); renderOrders(); renderProgress(); renderCalendar(); renderSettings(); }
function escapeHtml(value){ return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function formatDate(s){
  if(!s) return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"2-digit"}).format(parseDate(s));
}
function syncStatusFields(){
  const inProgress=document.getElementById("orderInProgress").checked;
  document.getElementById("completionFields").classList.toggle("hidden",inProgress);
  document.getElementById("income").required=!inProgress;
  document.getElementById("incomeHelp").classList.toggle("hidden",!inProgress);
  updateOrderPreview();
}
function renderOrderPauses(order) {
  const container = document.getElementById("orderPausesList");
  if (!order) {
    container.innerHTML = '';
    document.getElementById("orderPauseCount").textContent = '0';
    return;
  }
  const startDate = order.startDate || todayISO();
  const endDate = order.endDate || todayISO();
  const dates = [];
  let d = parseDate(startDate);
  const end = parseDate(endDate);
  while (d <= end) {
    dates.push(toISODate(d));
    d = addDays(d, 1);
  }
  let allPauses = [];
  let hasActivePause = false;
  for (const date of dates) {
    const pauses = getOrderPauses(order.id, date);
    for (const pause of pauses) {
      allPauses.push({ ...pause, date });
      if (pause.start && !pause.end) hasActivePause = true;
    }
  }
  document.getElementById("orderPauseCount").textContent = allPauses.length;
  
  const timerElement = document.getElementById("activePauseTimer");
  if (hasActivePause) {
    timerElement.style.display = 'block';
    if (!pauseTimerInterval) {
      startPauseTimer();
    }
  } else {
    timerElement.style.display = 'none';
    stopPauseTimer();
    activePauseData = null;
  }
  
  let html = '';
  if (allPauses.length === 0) {
    html = '<div class="muted" style="padding: 8px 0;">Нет пауз</div>';
  } else {
    html = allPauses.map((pause, index) => `
      <div class="pause-row" data-pause-index="${index}">
        <input type="date" class="pause-date-edit" data-order-id="${order.id}" data-old-date="${pause.date}" data-pause-start="${pause.start}" value="${pause.date}" style="width: 130px;">
        <input type="text" class="pause-start-edit" data-order-id="${order.id}" data-date="${pause.date}" data-pause-start="${pause.start}" value="${pause.start || ''}" placeholder="12:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5" style="width: 90px;">
        <span>–</span>
        <input type="text" class="pause-end-edit" data-order-id="${order.id}" data-date="${pause.date}" data-pause-start="${pause.start}" value="${pause.end || ''}" placeholder="13:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5" style="width: 90px;">
        <button type="button" class="small danger delete-order-pause" data-order-id="${order.id}" data-date="${pause.date}" data-start="${pause.start}">×</button>
      </div>
    `).join('');
  }
  
  html += `
    <div style="margin-top: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
      <input type="date" id="manualPauseDate" value="${todayISO()}" style="width: 130px;">
      <input type="text" id="manualPauseStart" placeholder="12:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5" style="width: 80px;">
      <span>–</span>
      <input type="date" id="manualPauseEndDate" value="${todayISO()}" style="width: 130px;">
      <input type="text" id="manualPauseEnd" placeholder="13:00" pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" maxlength="5" style="width: 80px;">
      <button type="button" id="addManualPauseBtn" class="secondary small">+ Добавить паузу</button>
    </div>
  `;
  
  container.innerHTML = html;
  
  container.querySelectorAll('.pause-date-edit').forEach(input => {
    input.onchange = function() {
      const orderId = this.dataset.orderId;
      const oldDate = this.dataset.oldDate;
      const start = this.dataset.pauseStart;
      const newDate = this.value;
      
      const order = state.orders.find(o => o.id === orderId);
      if (!order) return;
      const orderStart = order.startDate || todayISO();
      const orderEnd = order.endDate || todayISO();
      if (newDate < orderStart || newDate > orderEnd) {
        toast("Дата паузы должна быть в пределах дат заказа");
        this.value = oldDate;
        return;
      }
      
      const oldPauses = getOrderPauses(orderId, oldDate);
      const pauseIndex = oldPauses.findIndex(p => p.start === start);
      if (pauseIndex === -1) return;
      
      const pause = oldPauses[pauseIndex];
      const newPauses = getOrderPauses(orderId, newDate);
      
      for (const np of newPauses) {
        if (np.start === pause.start && np.date === newDate) {
          toast("Пауза с таким временем уже существует на этой дате");
          this.value = oldDate;
          return;
        }
      }
      
      const filteredOld = oldPauses.filter((_, i) => i !== pauseIndex);
      saveOrderPauses(orderId, oldDate, filteredOld);
      
      newPauses.push(pause);
      saveOrderPauses(orderId, newDate, newPauses);
      
      const orderObj = state.orders.find(o => o.id === orderId);
      if (orderObj) renderOrderPauses(orderObj);
      updateOrderPreview();
      toast("Дата паузы обновлена");
    };
  });
  
  container.querySelectorAll('.pause-start-edit').forEach(input => {
    input.onchange = function() {
      const orderId = this.dataset.orderId;
      const date = this.dataset.date;
      const oldStart = this.dataset.pauseStart;
      const newStart = this.value;
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newStart)) {
        toast("Введите время в формате ЧЧ:ММ (например, 14:30)");
        this.value = oldStart;
        return;
      }
      const pauses = getOrderPauses(orderId, date);
      const pauseIndex = pauses.findIndex(p => p.start === oldStart);
      if (pauseIndex !== -1) {
        pauses[pauseIndex].start = newStart;
        saveOrderPauses(orderId, date, pauses);
        const order = state.orders.find(o => o.id === orderId);
        if (order) renderOrderPauses(order);
        updateOrderPreview();
        toast("Время начала паузы обновлено");
      }
    };
  });
  
  container.querySelectorAll('.pause-end-edit').forEach(input => {
    input.onchange = function() {
      const orderId = this.dataset.orderId;
      const date = this.dataset.date;
      const start = this.dataset.pauseStart;
      const newEnd = this.value;
      if (newEnd && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newEnd)) {
        toast("Введите время в формате ЧЧ:ММ (например, 14:30)");
        this.value = '';
        return;
      }
      const pauses = getOrderPauses(orderId, date);
      const pauseIndex = pauses.findIndex(p => p.start === start);
      if (pauseIndex !== -1) {
        if (newEnd && parseTime(newEnd) <= parseTime(pauses[pauseIndex].start)) {
          toast("Время окончания должно быть позже начала");
          return;
        }
        pauses[pauseIndex].end = newEnd;
        saveOrderPauses(orderId, date, pauses);
        const order = state.orders.find(o => o.id === orderId);
        if (order) renderOrderPauses(order);
        updateOrderPreview();
        toast("Время окончания паузы обновлено");
      }
    };
  });
  
  container.querySelectorAll('.delete-order-pause').forEach(btn => {
    btn.onclick = () => {
      const orderId = btn.dataset.orderId;
      const date = btn.dataset.date;
      const start = btn.dataset.start;
      const pauses = getOrderPauses(orderId, date);
      const filtered = pauses.filter(p => p.start !== start);
      saveOrderPauses(orderId, date, filtered);
      const order = state.orders.find(o => o.id === orderId);
      if (order) renderOrderPauses(order);
      updateOrderPreview();
      toast("Пауза удалена");
    };
  });
  
  const addBtn = document.getElementById("addManualPauseBtn");
  if (addBtn) {
    addBtn.onclick = function() {
      const date = document.getElementById("manualPauseDate").value;
      const start = document.getElementById("manualPauseStart").value;
      const endDate = document.getElementById("manualPauseEndDate").value;
      const end = document.getElementById("manualPauseEnd").value;
      
      if (!date || !start || !endDate || !end) {
        toast("Укажите дату и время начала и окончания паузы");
        return;
      }
      
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(start)) {
        toast("Введите время начала в формате ЧЧ:ММ (например, 14:30)");
        return;
      }
      
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(end)) {
        toast("Введите время окончания в формате ЧЧ:ММ (например, 15:30)");
        return;
      }
      
      const startDateTime = new Date(`${date}T${start}:00`);
      const endDateTime = new Date(`${endDate}T${end}:00`);
      
      if (endDateTime <= startDateTime) {
        toast("Время окончания должно быть позже времени начала");
        return;
      }
      
      const orderId = order.id;
      
      const pauses = getOrderPauses(orderId, date);
      if (pauses.some(p => p.start === start && p.date === date)) {
        toast("Пауза с таким временем начала уже существует на этой дате");
        return;
      }
      
      if (date === endDate) {
        pauses.push({ start: start, end: end });
        saveOrderPauses(orderId, date, pauses);
      } else {
        const workRange = getWorkStartEndForDate(date);
        const endWorkRange = getWorkStartEndForDate(endDate);
        
        if (workRange) {
          const endOfDay = workRange.end;
          pauses.push({ start: start, end: formatTime(endOfDay) });
          saveOrderPauses(orderId, date, pauses);
        }
        
        const endPauses = getOrderPauses(orderId, endDate);
        if (endWorkRange) {
          const startOfDay = endWorkRange.start;
          endPauses.push({ start: formatTime(startOfDay), end: end });
          saveOrderPauses(orderId, endDate, endPauses);
        }
      }
      
      renderOrderPauses(order);
      updateOrderPreview();
      toast("Пауза добавлена");
    };
  }
}
function formatTime(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function openOrder(id=null){
  document.getElementById("orderForm").reset();
  const order=id?state.orders.find(o=>o.id===id):null;
  document.getElementById("orderDialogTitle").textContent=order?"Редактировать заказ":"Новый заказ";
  document.getElementById("deleteOrderBtn").classList.toggle("hidden",!order);
  document.getElementById("orderId").value=order?.id||"";
  document.getElementById("orderInProgress").checked=(order?.status||"completed")==="in_progress";
  document.getElementById("orderNumber").value=order?.number||"";
  document.getElementById("startDate").value=order?.startDate||todayISO();
  document.getElementById("endDate").value=order?.endDate||todayISO();
  document.getElementById("startTime").value=order?.startTime||state.settings.standardStart;
  document.getElementById("endTime").value=order?.endTime||state.settings.standardEnd;
  document.getElementById("workDone").value=order?.work||"";
  document.getElementById("income").value=order?.income??"";
  document.getElementById("comment").value=order?.comment||"";
  syncStatusFields();
  if (order) {
    renderOrderPauses(order);
  } else {
    document.getElementById("orderPausesList").innerHTML = '';
    document.getElementById("orderPauseCount").textContent = '0';
    document.getElementById("activePauseTimer").style.display = 'none';
    stopPauseTimer();
  }
  document.getElementById("orderDialog").showModal();
}
function formOrder(){
  return {
    id:document.getElementById("orderId").value||crypto.randomUUID(),
    status:document.getElementById("orderInProgress").checked?"in_progress":"completed",
    number:document.getElementById("orderNumber").value.trim(),
    startDate:document.getElementById("startDate").value,
    startTime:document.getElementById("startTime").value,
    endDate:document.getElementById("endDate").value,
    endTime:document.getElementById("endTime").value,
    work:document.getElementById("workDone").value.trim(),
    income:Number(document.getElementById("income").value)||0,
    comment:document.getElementById("comment").value.trim(),
    createdAt:new Date().toISOString()
  };
}
function updateOrderPreview(){
  const o=formOrder();
  const h=orderHours(o,{pastOnly:o.status==="in_progress"});
  const per=h?o.income/h:0;
  let totalPauseHours = 0;
  if (o.id) {
    const startDate = o.startDate || todayISO();
    const endDate = o.endDate || todayISO();
    let d = parseDate(startDate);
    const end = parseDate(endDate);
    while (d <= end) {
      const date = toISODate(d);
      const pauseHours = orderPauseHoursOnDate(o, date);
      totalPauseHours += pauseHours;
      d = addDays(d, 1);
    }
  }
  const previewEl = document.getElementById("orderPreview");
  if (o.status==="in_progress") {
    previewEl.innerHTML = `В процессе: ${formatHoursMinutes(h)} на сегодня. Паузы: ${formatHoursMinutes(totalPauseHours)}. В итогах не учитывается.`;
  } else {
    previewEl.innerHTML = `Расчёт: ${formatHoursMinutes(h)} · ${money(per)} в час. Паузы: ${formatHoursMinutes(totalPauseHours)}.`;
  }
}
document.querySelectorAll(".nav-btn").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".nav-btn").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); document.getElementById(btn.dataset.view).classList.add("active");
  scrollTo({top:0,behavior:"smooth"});
});
document.getElementById("addOrderBtn").onclick=()=>openOrder();
document.getElementById("addProgressBtn").onclick=()=>{openOrder();document.getElementById("orderInProgress").checked=true;syncStatusFields();};
document.getElementById("closeOrderDialog").onclick=()=>document.getElementById("orderDialog").close();
document.querySelectorAll(".set-now").forEach(btn=>btn.onclick=()=>{
  const target=document.getElementById(btn.dataset.target);
  if(target){target.value=nowHHMM();target.dispatchEvent(new Event("input",{bubbles:true}));}
});
document.getElementById("orderForm").onsubmit=e=>{
  e.preventDefault();
  const o=formOrder();
  if(parseDate(o.endDate)<parseDate(o.startDate)){toast("Дата выполнения раньше даты начала");return;}
  const idx=state.orders.findIndex(x=>x.id===o.id);
  if(idx>=0) state.orders[idx]={...state.orders[idx],...o}; else state.orders.push(o);
  saveState();document.getElementById("orderDialog").close();toast("Заказ сохранён");
};
document.getElementById("deleteOrderBtn").onclick=()=>{
  const id=document.getElementById("orderId").value;
  if(!id||!confirm("Удалить заказ?"))return;
  state.orders=state.orders.filter(o=>o.id!==id);saveState();document.getElementById("orderDialog").close();toast("Заказ удалён");
};
["startDate","endDate","startTime","endTime","income"].forEach(id=>document.getElementById(id).addEventListener("input",updateOrderPreview));
document.getElementById("orderInProgress").addEventListener("change",syncStatusFields);
document.getElementById("orderSearch").oninput=renderOrders;
document.getElementById("progressSearch").oninput=renderProgress;
document.getElementById("yearSelect").onchange=renderDashboard;
document.getElementById("calendarYearSelect").onchange=renderCalendar;
document.getElementById("saveSettingsBtn").onclick=()=>{
  const start=document.getElementById("standardStart").value,end=document.getElementById("standardEnd").value;
  if(parseTime(end)<=parseTime(start)){toast("Конец дня должен быть позже начала");return;}
  state.settings={standardStart:start,standardEnd:end};saveState();toast("График сохранён");
};
function download(name,text,type){
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
document.getElementById("exportBackupBtn").onclick=()=>download(`мебельщик_backup_${todayISO()}.json`,JSON.stringify(state,null,2),"application/json");
document.getElementById("exportCsvBtn").onclick=()=>{
  const rows=[["Статус","Номер заказа","Дата начала","Время начала","Дата выполнения","Время выполнения","Что сделано","Доход","Часы на сегодня","Доход в час","Комментарий"]];
  state.orders.forEach(o=>{const h=orderHours(o,{pastOnly:true});rows.push([isCompleted(o)?"Завершён":"В процессе",o.number,o.startDate,o.startTime,o.endDate,o.endTime,o.work,o.income,h,isCompleted(o)&&h?o.income/h:0,o.comment]);});
  const csv="\uFEFF"+rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");
  download(`заказы_${todayISO()}.csv`,csv,"text/csv;charset=utf-8");
};
document.getElementById("importBackupInput").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());if(!Array.isArray(data.orders)||!data.settings)throw new Error();
    state=migrateState(data);saveState();toast("Резервная копия загружена");
  }catch(err){toast("Не удалось прочитать резервную копию");}
  e.target.value="";
};
document.getElementById("resetBtn").onclick=()=>{
  if(!confirm("Сбросить все изменения и вернуть исходные данные?"))return;
  state=migrateState(clone(window.APP_SEED));saveState();toast("Исходные данные восстановлены");
};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;document.getElementById("installBtn").classList.remove("hidden");});
document.getElementById("installBtn").onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;document.getElementById("installBtn").classList.add("hidden");};
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("sw.js");

function startPauseTimer() {
  if (pauseTimerInterval) {
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;
  }
  pauseTimerStart = new Date();
  pauseTimerInterval = setInterval(() => {
    const now = new Date();
    const diff = Math.floor((now - pauseTimerStart) / 1000);
    const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const seconds = String(diff % 60).padStart(2, '0');
    document.getElementById('pauseTimerDisplay').textContent = `${hours}:${minutes}:${seconds}`;
  }, 1000);
}

function stopPauseTimer() {
  if (pauseTimerInterval) {
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;
    pauseTimerStart = null;
    document.getElementById('pauseTimerDisplay').textContent = '00:00:00';
  }
}

function getOrderDates(order) {
  const startDate = order.startDate || todayISO();
  const endDate = order.endDate || todayISO();
  const dates = [];
  let d = parseDate(startDate);
  const end = parseDate(endDate);
  while (d <= end) {
    dates.push(toISODate(d));
    d = addDays(d, 1);
  }
  return dates;
}

document.getElementById("startOrderPauseBtn").onclick = () => {
  const orderId = document.getElementById("orderId").value;
  if (!orderId) {
    toast("Сначала сохраните заказ");
    return;
  }
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  
  const startDate = document.getElementById("startDate").value || todayISO();
  const pauses = getOrderPauses(orderId, startDate);
  const activePause = pauses.find(p => p.start && !p.end);
  if (activePause) {
    toast("Уже есть активная пауза. Сначала завершите её.");
    return;
  }
  
  const allDates = getOrderDates(order);
  let hasActivePause = false;
  for (const date of allDates) {
    const p = getOrderPauses(orderId, date);
    if (p.some(pause => pause.start && !pause.end)) {
      hasActivePause = true;
      break;
    }
  }
  if (hasActivePause) {
    toast("Уже есть активная пауза в другом дне. Завершите её.");
    return;
  }
  
  const nowTime = nowHHMM();
  const nowDate = todayISO();
  pauses.push({ start: nowTime, end: "" });
  saveOrderPauses(orderId, startDate, pauses);
  activePauseData = { orderId, startDate, startTime: nowTime };
  
  renderOrderPauses(order);
  updateOrderPreview();
  
  stopPauseTimer();
  startPauseTimer();
  
  toast(`Пауза начата ${nowDate} в ${nowTime}`);
};

document.getElementById("endOrderPauseBtn").onclick = () => {
  const orderId = document.getElementById("orderId").value;
  if (!orderId) {
    toast("Сначала сохраните заказ");
    return;
  }
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  
  const allDates = getOrderDates(order);
  let foundDate = null;
  let foundPause = null;
  let foundIndex = -1;
  
  for (const date of allDates) {
    const pauses = getOrderPauses(orderId, date);
    const idx = pauses.findIndex(p => p.start && !p.end);
    if (idx !== -1) {
      foundDate = date;
      foundPause = pauses[idx];
      foundIndex = idx;
      break;
    }
  }
  
  if (!foundPause) {
    toast("Нет активной паузы для завершения");
    return;
  }
  
  const nowTime = nowHHMM();
  const nowDate = todayISO();
  
  if (foundDate === nowDate) {
    if (parseTime(nowTime) <= parseTime(foundPause.start)) {
      toast("Время окончания должно быть позже начала");
      return;
    }
    const pauses = getOrderPauses(orderId, foundDate);
    pauses[foundIndex].end = nowTime;
    saveOrderPauses(orderId, foundDate, pauses);
  } else {
    const workRange = getWorkStartEndForDate(foundDate);
    const endWorkRange = getWorkStartEndForDate(nowDate);
    
    const pausesStart = getOrderPauses(orderId, foundDate);
    if (workRange) {
      pausesStart[foundIndex].end = formatTime(workRange.end);
      saveOrderPauses(orderId, foundDate, pausesStart);
    }
    
    const pausesEnd = getOrderPauses(orderId, nowDate);
    if (endWorkRange) {
      pausesEnd.push({ start: formatTime(endWorkRange.start), end: nowTime });
      saveOrderPauses(orderId, nowDate, pausesEnd);
    }
  }
  
  activePauseData = null;
  renderOrderPauses(order);
  updateOrderPreview();
  stopPauseTimer();
  toast(`Пауза завершена в ${nowDate} ${nowTime}`);
};

document.getElementById("clearOrderPausesBtn").onclick = () => {
  const orderId = document.getElementById("orderId").value;
  if (!orderId) return;
  if (!confirm("Удалить все паузы для этого заказа?")) return;
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const startDate = order.startDate || todayISO();
  const endDate = order.endDate || todayISO();
  let d = parseDate(startDate);
  const end = parseDate(endDate);
  while (d <= end) {
    const date = toISODate(d);
    saveOrderPauses(orderId, date, []);
    d = addDays(d, 1);
  }
  activePauseData = null;
  renderOrderPauses(order);
  updateOrderPreview();
  toast("Все паузы удалены");
};

function setupTimeInputMask(input) {
  input.addEventListener('input', function(e) {
    let value = this.value.replace(/[^0-9]/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    if (value.length > 2) {
      value = value.slice(0, 2) + ':' + value.slice(2);
    }
    this.value = value;
  });
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('input[type="text"][pattern*="[0-9]:[0-9]"]').forEach(setupTimeInputMask);
});

renderAll();