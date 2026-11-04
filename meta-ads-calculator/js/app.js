/* Meta Ads Business Calculator - app logic.
   Sections: helpers, motion helpers, hero receipt, MODELS (formulas), state, shell/render, copy summary, scroll reveals. */
(function(){
'use strict';

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const IN=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
const cl=x=>Math.min(100,Math.max(0,+x||0));
const P=x=>cl(x)/100;
const div=(a,b)=>b>0?a/b:Infinity;
function inr(n){
  if(!isFinite(n))return 'n/a';
  const s=n<0&&Math.abs(n)>=0.5?'-':'',a=Math.abs(n);
  if(a>=1e7)return s+'₹'+(a/1e7).toFixed(2)+' Cr';
  if(a>=1e5)return s+'₹'+(a/1e5).toFixed(2)+' L';
  return s+'₹'+IN.format(Math.round(a));
}
function num(n){
  if(!isFinite(n))return 'n/a';
  const a=Math.abs(n);
  if(a>=100)return IN.format(Math.round(n));
  if(a>=10)return n.toFixed(1).replace(/\.0$/,'');
  return n.toFixed(2).replace(/\.?0+$/,'')||'0';
}
const pct=n=>isFinite(n)?n.toFixed(1).replace(/\.0$/,'')+'%':'n/a';
const xx=n=>isFinite(n)?(Math.abs(n)<0.005?0:n).toFixed(2)+'x':'n/a';
/* people and orders: whole numbers, never negative or fractional */
const cnt=n=>!isFinite(n)?'n/a':n<=0?'0':n<1?'under 1':IN.format(Math.round(n));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2400)}

/* ---------- assets, motion helpers ---------- */
const ASSETS={bee:'assets/bee.png',badge:'assets/badge.png'};
$$('img[data-asset]').forEach(i=>{i.src=ASSETS[i.dataset.asset]});
const RM=window.matchMedia?matchMedia('(prefers-reduced-motion:reduce)'):{matches:false};
function splitNum(t){
  const m=/^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(t||'');
  if(!m)return null;
  const n=m[2];return{pre:m[1],v:parseFloat(n.replace(/,/g,'')),dec:(n.split('.')[1]||'').length,com:n.indexOf(',')>-1,suf:m[3]};
}
function fmtNum(v,dec,com){return com?new Intl.NumberFormat('en-IN',{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(v):v.toFixed(dec)}
function zeroOf(t){const a=splitNum(t);return a?a.pre+fmtNum(0,a.dec,a.com)+a.suf:undefined}
function tweenText(el,to,from){
  if(from===undefined)from=el.textContent;
  cancelAnimationFrame(el._r);
  el.textContent=to;
  if(RM.matches||from===to)return;
  const a=splitNum(from),b=splitNum(to);
  if(!a||!b||a.pre!==b.pre||a.suf!==b.suf)return;
  const t0=performance.now(),D=550;
  el.textContent=from;
  const step=t=>{
    const p=Math.min(1,(t-t0)/D),e=1-Math.pow(1-p,3);
    if(p<1){el.textContent=b.pre+fmtNum(a.v+(b.v-a.v)*e,b.dec,b.com)+b.suf;el._r=requestAnimationFrame(step)}
    else el.textContent=to;
  };
  el._r=requestAnimationFrame(step);
}

/* ---------- hero receipt ---------- */
function receipt(){
  const b=+$('#rb').value,c=+$('#rc').value,r=+$('#rr').value;
  $('#rbv').textContent=inr(b);$('#rcv').textContent=inr(c);$('#rrv').textContent=r+'%';
  const leads=b/c,cust=leads*r/100;
  const put=(id,txt)=>{const el=$('#'+id);tweenText(el,txt,el.textContent?undefined:zeroOf(txt))};
  put('o1',num(leads));put('o2',num(cust));put('o3',inr(b/cust));
}
['rb','rc','rr'].forEach(id=>$('#'+id).addEventListener('input',receipt));receipt();

/* ---------- model definitions ---------- */
const F=(id,label,unit,def,min,max,step,group,help,scen)=>({id,label,unit,def,min,max,step,group,help,scen});
const DROP=F('drop','Efficiency loss when budget doubles','%',10,0,40,1,'Scaling','Extra cost per result each time you double spend. Meta costs usually rise as you scale; 10% is a cautious starting point.');

const MODELS={};

/* ---------- plug in modules (js/industries.js via js/framework.js, js/door.js) ---------- */
const clone=x=>x&&typeof x==='object'?JSON.parse(JSON.stringify(x)):x;
const ENGINE={F,DROP,inr,num,pct,xx,div,P,cl,cnt,$,$$,toast,cap:s=>s.charAt(0).toUpperCase()+s.slice(1),
  scaled:(m,v,mult)=>scaledOf(m,v,mult),scenario:(m,v,k)=>scenarioOf(m,v,k),
  get market(){return globalThis.MABC_MARKET||null}};
(globalThis.MABC_MODULES||[]).forEach(fn=>(fn(ENGINE)||[]).forEach(m=>{MODELS[m.key]=m}));
if(typeof globalThis.MABC_DOOR==='function')MODELS.door=globalThis.MABC_DOOR(ENGINE);
/* validation for every model: whatever calls compute (form, scenarios, scaling, goals), numbers are never
   negative or non numeric, and rates never exceed 100% (or the field's own higher max, e.g. repeat rates) */
Object.values(MODELS).forEach(m=>{
  const raw=m.compute,num=m.fields.filter(f=>f.kind!=='opt'&&typeof f.def==='number');
  m.compute=function(v){
    const o=Object.assign({},v);
    num.forEach(f=>{let x=+o[f.id];if(!isFinite(x))x=f.def;if(x<0)x=0;if(f.unit==='%')x=Math.min(x,Math.max(100,f.max||100));o[f.id]=x});
    return raw.call(this,o);
  };
});
/* catalogue for the dashboard and the industry picker; falls back to every model */
const CATALOG=(globalThis.MABC_CATALOG||[{cat:'Calculators',items:Object.keys(MODELS).map(key=>({key}))}])
  .map(g=>({cat:g.cat,items:g.items.filter(i=>MODELS[i.key])})).filter(g=>g.items.length);

/* ---------- state ---------- */
const state={},presetSel={},goal={},openGroups={};
let cur=null,raf=0,lastHtml='';

function defaults(m){const o={};m.fields.forEach(f=>o[f.id]=clone(f.def));return o}
function load(key){
  const m=MODELS[key];let vals=defaults(m),pre='custom';
  try{
    const s=JSON.parse(localStorage.getItem('mabc:'+key)||'null');
    if(s&&s.vals){m.fields.forEach(f=>{const a=s.vals[f.id],d=f.def;
      if(Array.isArray(d)?Array.isArray(a):typeof a===typeof d&&a!==null)vals[f.id]=a});pre=s.pre||'custom';if(s.goal)goal[key]=s.goal}
  }catch(e){}
  state[key]=vals;presetSel[key]=pre;if(!goal[key])goal[key]=clone(m.goal);
}
function save(){
  try{localStorage.setItem('mabc:'+cur,JSON.stringify({vals:state[cur],pre:presetSel[cur],goal:goal[cur]}))}catch(e){}
}

/* ---------- selection ---------- */
function setModel(key,scroll){
  cur=key;if(!state[key])load(key);
  $$('.ind').forEach(c=>c.setAttribute('aria-pressed',c.dataset.m===key?'true':'false'));
  shell();
  const g=$('.calc-grid'),rm=$('#res-main');g.classList.add('enter');rm.classList.add('fresh');
  update();
  setTimeout(()=>{g.classList.remove('enter');rm.classList.remove('fresh')},1800);
  if(scroll){const r=matchMedia('(prefers-reduced-motion:reduce)').matches;$('#calculator').scrollIntoView({behavior:r?'auto':'smooth',block:'start'})}
}
document.addEventListener('click',e=>{
  const p=e.target.closest('[data-pick]');
  if(p){e.stopPropagation();setModel(p.dataset.pick,true);return}
  const c=e.target.closest('.ind');
  if(c)setModel(c.dataset.m,true);
});

/* ---------- shell ---------- */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isOn=(m,f,v)=>(!f.show||f.show(v))&&(!m.modes||v.mode!=='simple'||f.simple);
function numInput(f,v){
  return `<div class="inp">${f.unit==='₹'?'<span class="u">₹</span>':''}<input id="f-${f.id}" data-id="${f.id}" type="number" inputmode="decimal" min="0" step="${f.step}" value="${v[f.id]}" ${f.c?`aria-label="${esc(f.label)}"`:''}>${f.unit&&f.unit!=='₹'?`<span class="u">${f.unit}</span>`:''}</div>`;
}
function optField(f,v){
  const val=v[f.id],lab=`<span class="olab" id="l-${f.id}">${f.label}</span>`;
  if(f.type==='select')return `<div class="field"><label for="o-${f.id}">${f.label}</label><select id="o-${f.id}" data-opt="${f.id}" class="osel">${f.options.map(o=>`<option value="${o[0]}"${o[0]===val?' selected':''}>${o[1]}</option>`).join('')}</select>${f.help?`<small>${f.help}</small>`:''}</div>`;
  if(f.type==='text')return `<div class="field"><label for="o-${f.id}">${f.label}</label><div class="inp"><input id="o-${f.id}" data-opt="${f.id}" type="text" value="${esc(val)}" maxlength="40"></div></div>`;
  if(f.type==='chips')return `<div class="field">${lab}<div class="chipset" role="group" aria-labelledby="l-${f.id}">${f.options.map(o=>`<button type="button" class="chip" data-opt="${f.id}" data-val="${o[0]}" aria-pressed="${val.includes(o[0])}">${o[1]}</button>`).join('')}</div>${f.help?`<small>${f.help}</small>`:''}</div>`;
  if(f.type==='cards')return `<div class="field">${lab}<div class="ocards" role="radiogroup" aria-labelledby="l-${f.id}">${f.options.map(o=>`<button type="button" class="ocard" role="radio" data-opt="${f.id}" data-val="${o[0]}" aria-checked="${o[0]===val}"><b>${o[1]}</b><span>${o[2]||''}</span></button>`).join('')}</div></div>`;
  return `<div class="field">${lab}<div class="seg" role="radiogroup" aria-labelledby="l-${f.id}">${f.options.map(o=>`<button type="button" role="radio" data-opt="${f.id}" data-val="${o[0]}" aria-checked="${o[0]===val}">${o[1]}</button>`).join('')}</div>${f.help?`<small>${f.help}</small>`:''}</div>`;
}
function renderField(f,v){
  if(f.kind==='opt')return optField(f,v);
  if(f.c)return `<div class="crow"><label for="f-${f.id}"${f.help?` title="${esc(f.help)}"`:''}>${f.label}</label>${numInput(f,v)}</div>`;
  return `<div class="field">
      <label for="f-${f.id}">${f.label}</label>
      ${numInput(f,v)}
      <input type="range" data-id="${f.id}" data-r="1" min="${f.min}" max="${f.max}" step="${f.step}" value="${v[f.id]}" aria-label="${f.label} slider">
      <small>${f.help}</small>
    </div>`;
}
function shell(){
  const m=MODELS[cur],v=state[cur],G=m.groups||{};
  const groups=[];m.fields.forEach(f=>{let g=groups.find(x=>x.n===f.group);if(!g){g={n:f.group,f:[]};groups.push(g)}if(isOn(m,f,v))g.f.push(f)});
  const form=groups.filter(g=>g.f.length&&(!G[g.n]||!G[g.n].show||G[g.n].show(v))).map(g=>{
    const meta=G[g.n]||{};let body;
    if(meta.matrix){
      const inM=new Set(meta.matrix.rows.flatMap(r=>r.slice(1)));
      body=`<div class="mx"><div class="mxh"><span></span>${meta.matrix.cols.map(c=>`<span>${c}</span>`).join('')}</div>${meta.matrix.rows.map(r=>{
        const fs=r.slice(1).map(id=>m.fields.find(x=>x.id===id));
        return `<div class="mxr"><span>${r[0]}</span>${fs.map(f=>numInput(Object.assign({},f,{c:1,unit:'',label:r[0]+' '+f.label+' ('+f.unit+')'}),v)).join('')}</div>`}).join('')}</div>`+
        g.f.filter(f=>!inM.has(f.id)).map(f=>renderField(f,v)).join('');
    }else body=g.f.map(f=>renderField(f,v)).join('');
    const extra=(meta.note?`<div class="gnote" data-d="note:${esc(g.n)}"></div>`:'')+(meta.html?meta.html(v):'');
    if(meta.collapse){
      const open=openGroups[cur+':'+g.n]!==undefined?openGroups[cur+':'+g.n]:!!meta.open;
      return `<details class="grp" data-g="${esc(g.n)}"${open?' open':''}><summary><span>${g.n}</span><b data-d="sub:${esc(g.n)}"></b></summary><div class="gbody">${body}${extra}</div></details>`;
    }
    return `<fieldset><legend>${g.n}</legend>${body}${extra}</fieldset>`;
  }).join('');
  const modeSw=m.modes?`<div class="seg seg-mode" role="radiogroup" aria-label="Detail level">${m.modes.map(o=>`<button type="button" role="radio" data-opt="mode" data-val="${o[0]}" aria-checked="${v.mode===o[0]}">${o[1]}</button>`).join('')}</div>`:'';
  const goalPanel=m.goalPanel?m.goalPanel(v,goal[cur]):`<div class="panel"><h3>Goal planner: budget for a target</h3>
          <div class="goal-in"><label for="goal">I want</label>
            <div class="inp"><input id="goal" type="number" inputmode="decimal" min="0.1" step="any" value="${goal[cur]}"><span class="u">${m.unitP}/month</span></div></div>
          <div id="goal-out"></div>
        </div>`;
  $('#calc-root').innerHTML=`
    <div class="calc-head" style="--mc:${m.color}">
      <div class="picker"><label for="industry">Industry</label>
        <select id="industry" aria-label="Industry">${CATALOG.map(g=>`<optgroup label="${esc(g.cat)}">${g.items.filter(i=>!i.alias).map(i=>`<option value="${i.key}"${i.key===cur?' selected':''}>${esc(i.name||MODELS[i.key].name)}</option>`).join('')}</optgroup>`).join('')}</select>
      </div>
      <div class="tools">
        ${modeSw}
        <label for="preset">Start from</label>
        <select id="preset">${m.presets.map(p=>`<option value="${p[0]}">${p[1]}</option>`).join('')}</select>
        <button class="btn btn-line btn-sm" type="button" id="reset">Reset</button>
      </div>
    </div>
    <div class="calc-grid" style="--mc:${m.color}">
      <form class="form-col" id="form" onsubmit="return false" autocomplete="off">${m.formIntro?m.formIntro(v):''}${form}</form>
      <div class="res-col">
        <div id="res-main" aria-live="polite"></div>
        ${goalPanel}
        ${m.renderSims?'<div id="sims"></div>':''}
        ${avpPanel()}
        <div class="actions">
          <button class="btn btn-green btn-sm" type="button" id="report-btn">Generate report</button>
          <button class="btn btn-line btn-sm" type="button" id="copy">Copy summary</button>
          <button class="btn btn-line btn-sm" type="button" id="print">Print / save as PDF</button>
        </div>
        <p class="disc">Estimates only. They depend entirely on the assumptions you enter.</p>
      </div>
    </div>`;
  $('#preset').value=presetSel[cur];
}

/* ---------- events (delegated) ---------- */
const root=$('#calc-root');
function markCustom(){presetSel[cur]='custom';const ps=$('#preset');if(ps)ps.value='custom'}
function setOpt(id,val){
  const m=MODELS[cur],v=state[cur],f=m.fields.find(x=>x.id===id);
  if(f&&f.type==='chips'){const a=v[id].slice(),i=a.indexOf(val);if(i>-1){if(a.length>1)a.splice(i,1);else{toast('Keep at least one selected');return}}else a.push(val);v[id]=a}
  else{if(v[id]===val)return;v[id]=val}
  const msg=m.onOpt?m.onOpt(id,val,v):'';
  if(id!=='mode')markCustom();
  save();shell();update();if(msg)toast(msg);
}
function eng(){const m=MODELS[cur];return Object.assign({},ENGINE,{m,v:state[cur],goal:goal[cur],
  compute:o=>m.compute(o),scaledNow:mult=>scaledOf(m,state[cur],mult),scenNow:k=>scenarioOf(m,state[cur],k),
  setGoal:g=>{goal[cur]=g;save()},refresh:()=>{save();shell();update()}})}
root.addEventListener('input',e=>{
  const t=e.target,m=MODELS[cur];
  if(t.dataset&&t.dataset.sim!==undefined){if(m.simInput)m.simInput(t,eng());return}
  if(t.dataset&&t.dataset.tgt!==undefined){if(m.goalInput)m.goalInput(t,eng());return}
  if(t.dataset&&t.dataset.opt&&t.type==='text'){state[cur][t.dataset.opt]=t.value;save();schedule();return}
  if(t.dataset&&t.dataset.cust!==undefined){if(m.customInput){m.customInput(t,eng());markCustom();save();schedule()}return}
  if(t.dataset&&t.dataset.avp!==undefined){const a=actual[cur]||(actual[cur]={}),n=parseFloat(t.value);if(isNaN(n)||n<0)delete a[t.dataset.avp];else a[t.dataset.avp]=n;
    try{localStorage.setItem('mabc:actual:'+cur,JSON.stringify(a))}catch(err){}renderAvp();return}
  if(t.id==='goal'){goal[cur]=parseFloat(t.value)||0;save();renderGoal();return}
  const id=t.dataset&&t.dataset.id;if(!id)return;
  const f=m.fields.find(x=>x.id===id),val=parseFloat(t.value);
  /* validation: no negatives, rates capped at 100% */
  let n=isNaN(val)?0:Math.max(0,val);
  if(f&&f.unit==='%'&&n>100)n=100;
  if(n!==val&&t.value!=='')t.value=n;
  state[cur][id]=n;
  const peer=t.dataset.r?$('#f-'+id):$(`input[data-r][data-id="${id}"]`);
  if(peer&&peer!==t)peer.value=n;
  const linked=m.onInput?m.onInput(id,state[cur]):null;
  if(linked)linked.forEach(k=>{$$(`[data-id="${k}"]`).forEach(el=>{el.value=state[cur][k]})});
  markCustom();
  save();schedule();
});
root.addEventListener('change',e=>{
  const t=e.target;
  if(t.tagName==='SELECT'&&t.dataset.opt){setOpt(t.dataset.opt,t.value);return}
  if(t.id==='industry'){setModel(t.value,false);return}
  if(t.id==='preset'){
    const m=MODELS[cur],p=m.presets.find(x=>x[0]===t.value);
    if(p){Object.assign(state[cur],clone(p[2]));presetSel[cur]=p[0];if(m.onPreset)m.onPreset(state[cur]);save();shell();update()}
  }
});
root.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.g)openGroups[cur+':'+d.dataset.g]=d.open},true);
root.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab]');
  if(tab){setModel(tab.dataset.tab,false);return}
  const o=e.target.closest('button[data-opt]');
  if(o){setOpt(o.dataset.opt,o.dataset.val);return}
  const sp=e.target.closest('[data-spend]');
  if(sp){state[cur].spend=+sp.dataset.spend;markCustom();save();shell();update();return}
  const act=e.target.closest('[data-act]'),m=MODELS[cur];
  if(act&&m.actions&&m.actions[act.dataset.act]){const msg=m.actions[act.dataset.act](state[cur],eng(),act);if(msg!==false){markCustom();save();shell();update();if(msg)toast(msg)}return}
  if(e.target.id==='reset'){state[cur]=defaults(MODELS[cur]);presetSel[cur]='custom';goal[cur]=clone(MODELS[cur].goal);save();shell();update();toast('Reset to defaults');return}
  if(e.target.id==='print'){try{window.print()}catch(err){toast('Printing is blocked here. Use your browser menu.')}return}
  if(e.target.id==='copy')copySummary();
  if(e.target.id==='report-btn')openReport();
});
function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(update)}

/* ---------- scaling / scenarios ---------- */
/* Budget × mult. Each doubling of budget inflates cost per result by drop% (CPM, and CPL when a model uses one). */
function scaledOf(m,v,mult){
  const cm=mult>1?1+v.drop/100*Math.log2(mult):1;
  const o={...v,spend:v.spend*mult,cpm:v.cpm*cm};if(typeof v.cpl==='number')o.cpl=v.cpl*cm;
  return m.compute(o);
}
function scenarioOf(m,v,kind){
  if(m.scenario)return m.compute(m.scenario(kind,v));
  const f={cons:0.9,exp:1,opt:1.1}[kind],c={cons:1.1,exp:1,opt:0.92}[kind];
  const o={...v};m.fields.forEach(fl=>{if(fl.scen)o[fl.id]=Math.min(100,v[fl.id]*f)});o.cpm=v.cpm*c;
  return m.compute(o);
}
const scaled=mult=>scaledOf(MODELS[cur],state[cur],mult);
const scenario=kind=>scenarioOf(MODELS[cur],state[cur],kind);

/* ---------- verdict ---------- */
function verdict(r){
  if(!(r.units>0))return{t:'bad',h:'No sales at these numbers',p:'Your inputs produce almost no '+r.unitP+'. Raise the budget or improve the funnel rates.'};
  if(r.net>0&&r.ltvcac>=3)return{t:'good',h:'Profitable, with room to scale',p:`Expected net profit is ${inr(r.net)} on ${inr(r.total)} of total cost. Lifetime value is ${xx(r.ltvcac)} your acquisition cost, which is a healthy base.`};
  if(r.net>0)return{t:'ok',h:'Profitable on the first sale, but thin over time',p:`Expected net profit is ${inr(r.net)}. Lifetime value is only ${xx(r.ltvcac)} your acquisition cost, so small changes in CPM or conversion could erase the profit.`};
  if(r.ltvcac>=3)return{t:'warn',h:'Loses money upfront; repeat value may recover it',p:`The first sale loses ${inr(-r.net)} this month. It only pays off if customers really come back (LTV is ${xx(r.ltvcac)} CAC), so make sure you can fund the wait.`};
  const need=isFinite(r.cac)&&r.limit>0?(1-r.limit/r.cac)*100:null;
  return{t:'bad',h:'Not profitable at these numbers',p:need!==null&&need>0
    ?`Each ${r.unit} earns ${inr(r.limit)} but costs ${inr(r.cac)} to win. You need roughly ${pct(need)} lower cost per ${r.unit}: better creatives or targeting, a stronger funnel, or a higher price or margin.`
    :`Each ${r.unit} earns almost nothing before ad costs. Fix price, margin or returns first; ads will only make the loss bigger.`};
}

/* ---------- render ---------- */
function update(){
  if(!cur)return;
  const m=MODELS[cur],v=state[cur],r=m.compute(v),vd=(m.verdict||verdict)(r,v);
  const lg=Math.log10;
  const oldCards={};$$('#res-main .card').forEach(c=>{oldCards[c.dataset.k]=$('.v',c).textContent});
  const oldBars=$$('#res-main .fbar i').map(i=>{const w=i.parentElement.getBoundingClientRect().width;return w?i.getBoundingClientRect().width/w*100:0});
  const mf=$('#res-main .meter .fill');let oldMeter=0;if(mf){const w=mf.parentElement.getBoundingClientRect().width;oldMeter=w?mf.getBoundingClientRect().width/w*100:0}
  const fresh=oldBars.length===0;
  const maxN=Math.max(...r.funnel.map(s=>s.n).filter(isFinite),1);
  const funnel=r.funnel.filter(s=>isFinite(s.n)).map((s,i)=>{
    const w=s.n>0?Math.max(2,lg(s.n+1)/lg(maxN+1)*100):0;
    return `<div class="frow"><div class="fl">${s.l}${s.r?`<small>${s.r}</small>`:''}</div><div class="fbar" aria-hidden="true"><i data-w="${w}" style="width:${fresh?0:(oldBars[i]||0)}%;transition-delay:${fresh?i*70+300:0}ms"></i></div><div class="fv"><b>${cnt(s.n)}</b><small>${s.c[0]} ${inr(s.c[1])}</small></div></div>`}).join('');
  const pnl=r.pnl.map(x=>`<tr><td>${x[0]}</td><td class="${x[1]<0?'bad':''}">${inr(x[1])}</td></tr>`).join('')+
    `<tr class="tot"><td>Net profit</td><td class="${r.net>=0?'good':'bad'}">${inr(r.net)}</td></tr>`;
  const ratio=r.limit>0&&isFinite(r.cac)?r.cac/r.limit:null;
  const meter=ratio===null?`<p class="note">${r.limit>0?'No '+r.unitP+' expected, so there is no cost per '+r.unit+' to compare.':'Each '+r.unit+' earns nothing before ad costs, so there is no breakeven cost.'}</p>`:
    `<div class="meter"><div class="track"><div class="fill" data-w="${Math.min(ratio,2)/2*100}" style="width:${oldMeter}%;background:${ratio<=1?'var(--good)':'var(--bad)'}"></div><div class="mark" title="Breakeven"></div></div>
     <div class="lab"><span>Your total cost: <b>${inr(r.cac)}</b></span><span>${r.limitLabel}: <b>${inr(r.limit)}</b></span></div></div>
     <p class="note">${ratio<=1?`You are ${pct((1-ratio)*100)} under breakeven on each ${r.unit}.`:`You are ${pct((ratio-1)*100)} over breakeven on each ${r.unit}.`} Total cost includes the other monthly costs you entered.</p>`;
  const sc={cons:scenario('cons'),exp:scenario('exp'),opt:scenario('opt')};
  let rows=[];
  if(m.scenRows)rows=m.scenRows(r,v);
  else{
    if(r.leads!==undefined)rows.push(['Leads',x=>num(x.leads)]);
    rows.push([cap(r.unitP),x=>num(x.units)],['Total cost per '+r.unit,x=>inr(x.cac)],['Revenue',x=>inr(x.revenue)],['Net profit',x=>inr(x.net),1],[r.roasLabel,x=>xx(x.roas)]);
  }
  const SN=m.scenNames||['Conservative','Expected','Optimistic'];
  const scen=`<div class="tscroll"><table><thead><tr><th></th>${SN.map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${
    rows.map(rw=>`<tr><td>${rw[0]}</td>${['cons','exp','opt'].map(k=>`<td class="${rw[2]?(sc[k].net>=0?'good':'bad'):''}">${rw[1](sc[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="note">${m.scenNote||'Conservative: CPM up 10% and every funnel rate down 10%. Optimistic: CPM down 8% and every funnel rate up 10%. Small changes compound across stages, so the range is wide on purpose.'}</p>`;
  const scale=`<div class="tscroll"><table><thead><tr><th>Budget</th><th>${cap(r.unitP)}</th><th>Cost each</th><th>Revenue</th><th>Net profit</th></tr></thead><tbody>${
    [0.5,1,2,3,5].map(k=>{const s=scaled(k);return `<tr><td>${inr(v.spend*k)}<small style="color:var(--muted)"> (${k}×)</small></td><td>${num(s.units)}</td><td>${inr(s.cac)}</td><td>${inr(s.revenue)}</td><td class="${s.net>=0?'good':'bad'}">${inr(s.net)}</td></tr>`}).join('')}</tbody></table></div>
    <p class="note">Other monthly costs stay fixed. Each doubling of budget raises CPM by ${v.drop}% (your scaling assumption), which is why cost per ${r.unit} climbs as you spend more.</p>`;
  const parts={
    verdict:`<div class="verdict ${vd.t}"><span class="vi" aria-hidden="true">${VICON[vd.t]}</span><div><h3>${vd.h}</h3><p>${vd.p}</p></div></div>`,
    note:r.note?`<p class="note" style="margin:-6px 0 16px;color:var(--muted);font-size:14px">${r.note}</p>`:'',
    cards:`<div class="cards ${m.cardsClass||''}">${r.cards.map(c=>`<div class="card ${c.t||''}" data-k="${c.k}"><div class="k">${c.k}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join('')}</div>`,
    funnel:`<div class="panel"><h3>${m.funnelTitle||'Your funnel'}</h3>${funnel}<p class="note">Bars use a log scale so every stage stays visible.</p></div>`,
    pnl:`<div class="panel"><h3>Profit breakdown (per month)</h3><div class="tscroll"><table><tbody>${pnl}</tbody></table></div></div>`,
    meterBody:meter,
    meter:`<div class="panel"><h3>Breakeven check</h3>${meter}</div>`,
    more:`<div class="panel"><h3>All the numbers</h3><div class="more">${r.more.map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div></div>`,
    scen:`<div class="panel"><h3>${m.scenTitle||'Best case, worst case'}</h3>${scen}</div>`,
    scale:`<div class="panel"><h3>What happens if you scale</h3>${scale}</div>`
  };
  lastHtml=m.layout?m.layout(parts,r,v,eng()):
    ['verdict','note','cards','funnel','pnl','meter','more','scen','scale'].map(k=>parts[k]).join('');
  $('#res-main').innerHTML=lastHtml;
  animateResults(oldCards,vd,fresh);
  renderGoal();
  if(m.after)m.after(r,v,eng());
  renderAvp();
  if(typeof mbar!=='undefined')mbar.update(r);
  if(m.derived){const d=m.derived(v,r);$$('#calc-root [data-d]').forEach(el=>{const t=d[el.dataset.d];if(t!==undefined&&el.innerHTML!==t)el.innerHTML=t})}
}
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const lastV={};
function animateResults(oldCards,vd,fresh){
  $$('#res-main .card').forEach(c=>{const el=$('.v',c),fin=el.textContent;const from=oldCards[c.dataset.k];tweenText(el,fin,from===undefined?zeroOf(fin):from)});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{$$('#res-main .fbar i,#res-main .meter .fill').forEach(i=>{i.style.width=i.dataset.w+'%'})}));
  const ve=$('#res-main .verdict');
  if(ve&&!fresh&&lastV[cur]!==undefined&&lastV[cur]!==vd.h)ve.classList.add('pop');
  lastV[cur]=vd.h;
}
const SV=(p)=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const VICON={good:SV('<path d="M20 6 9 17l-5-5"/>'),ok:SV('<path d="M20 6 9 17l-5-5"/>'),warn:SV('<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9.5"/>'),bad:SV('<path d="M18 6 6 18M6 6l12 12"/>')};

function renderGoal(){
  if(MODELS[cur].renderGoal){MODELS[cur].renderGoal(eng());return}
  const m=MODELS[cur],v=state[cur],base=m.compute(v),out=$('#goal-out');if(!out)return;
  const T=+goal[cur];
  if(!(T>0)){out.innerHTML='<p class="note">Enter a target above.</p>';return}
  if(!(base.units>0)){out.innerHTML='<p class="note">Your current inputs produce no '+base.unitP+', so a budget cannot be estimated.</p>';return}
  const k=T/base.units;let mult=k;
  for(let i=0;i<40;i++)mult=k*(mult>1?1+v.drop/100*Math.log2(mult):1);
  const s=scaled(mult);
  out.innerHTML=`<div class="more">
    <div><span>Ad budget needed</span><b>${inr(v.spend*mult)} / month</b></div>
    <div><span>Total cost incl. other costs</span><b>${inr(s.total)}</b></div>
    <div><span>Expected ${m.unitP}</span><b>${num(s.units)}</b></div>
    <div><span>Total cost per ${m.unit}</span><b>${inr(s.cac)}</b></div>
    <div><span>Expected revenue</span><b>${inr(s.revenue)}</b></div>
    <div><span>Expected net profit</span><b style="color:var(--${s.net>=0?'good':'bad'})">${inr(s.net)}</b></div></div>
    <p class="note">${mult>1&&v.drop>0?'Includes cost inflation from spending '+xx(mult).replace('x','×')+' your current budget.':'Based on your current efficiency.'}</p>`;
}

/* ---------- actual vs projected (every industry, via r.k) ---------- */
const actual={};
function loadActual(k){try{actual[k]=JSON.parse(localStorage.getItem('mabc:actual:'+k)||'{}')||{}}catch(e){actual[k]={}}}
function avpPanel(){
  if(!actual[cur])loadActual(cur);
  const m=MODELS[cur],r=m.compute(state[cur]),k=r.k||{},a=actual[cur];
  const inp=(id,l,rs)=>`<div class="field"><label for="a-${id}">${l}</label><div class="inp">${rs?'<span class="u">₹</span>':''}<input id="a-${id}" data-avp="${id}" type="number" inputmode="decimal" min="0" step="any" value="${a[id]!==undefined?a[id]:''}" placeholder="not entered"></div></div>`;
  return `<div class="panel" id="avp"><h3>Actual vs projected</h3><p class="note" style="margin:0 0 12px">After the campaign runs, enter what really happened. Profit uses your margin assumption (${pct((k.revenue>0?k.gross/k.revenue:0)*100)}), so update costs too if they changed.</p>
    <div class="avpin">${inp('spend','Actual ad spend',1)}${inp('leads','Actual '+(k.leadWord||'leads'),0)}${inp('customers','Actual '+(k.unitP||r.unitP),0)}${inp('revenue','Actual revenue',1)}</div><div id="avp-out"></div></div>`;
}
function renderAvp(){
  const out=$('#avp-out');if(!out||!cur)return;
  const m=MODELS[cur],v=state[cur],r=m.compute(v),k=r.k,a=actual[cur]||{};
  if(!k){out.innerHTML='';return}
  if(!Object.keys(a).length){out.innerHTML='<p class="note">Enter at least one actual result to compare it with the projection.</p>';return}
  const fixed=Math.max(0,r.total-r.spend),mu=k.revenue>0?k.gross/k.revenue:0,g=(id,p)=>a[id]!==undefined?a[id]:p;
  const sp=g('spend',k.spend),ld=g('leads',k.leads),cu=g('customers',k.customers),rv=g('revenue',k.revenue);
  const pr=rv*mu-sp-fixed,inv=rv*(1-mu)+sp+fixed;
  const A={leads:ld,cpl:div(sp,ld),customers:cu,cac:div(sp+fixed,cu),revenue:rv,roas:div(rv,sp),profit:pr,roi:inv>0?pr/inv*100:0};
  const Pj={leads:k.leads,cpl:k.cpl,customers:k.customers,cac:k.cac,revenue:k.revenue,roas:k.roas,profit:k.net,roi:k.roi};
  /* a metric is only shown as actual when every input it needs was really entered */
  const need={leads:['leads'],cpl:['spend','leads'],customers:['customers'],cac:['spend','customers'],revenue:['revenue'],roas:['spend','revenue'],profit:['spend','revenue'],roi:['spend','revenue']};
  const has=id=>need[id].every(q=>a[q]!==undefined);
  const rows=[['leads',cap(k.leadWord||'leads'),cnt,1],['cpl',k.costWord||'CPL',inr,0],['customers',cap(k.unitP||'customers'),cnt,1],['cac','CAC',inr,0],['revenue','Revenue',inr,1],['roas','ROAS',xx,1],['profit','Profit',inr,1],['roi','ROI',pct,1]];
  out.innerHTML=`<div class="tscroll"><table class="fc"><thead><tr><th></th><th>Projected</th><th>Actual</th><th>Difference</th></tr></thead><tbody>${rows.map(([id,l,f,hi])=>{
    const p=Pj[id],ok=has(id),x=A[id],d=ok&&isFinite(p)&&isFinite(x)&&p!==0?(x-p)/Math.abs(p)*100:null,good=d===null?'':(hi?d>=0:d<=0)?'good':'bad';
    return `<tr><td>${l}</td><td>${f(p)}</td><td>${ok?`<b>${f(x)}</b>`:'<span class="sub">needs '+need[id].map(q=>q==='leads'?(k.leadWord||'leads'):q==='customers'?(k.unitP||'customers'):q).join(' and ')+'</span>'}</td><td class="${good}">${d===null?'':(d>=0?'+':'')+pct(d)}</td></tr>`}).join('')}</tbody></table></div>
    <p class="note">Use the gap to correct your assumptions: a higher real CPL means raising CPM or lowering CTR in Advanced mode.</p>`;
}

/* ---------- report ---------- */
function reportHTML(){
  const m=MODELS[cur],v=state[cur],r=m.compute(v),k=r.k||{},vd=(m.verdict||verdict)(r,v);
  const optLab=id=>{const f=m.fields.find(x=>x.id===id);if(!f)return '';if(!f.options)return String(v[id]||'');const o=f.options.find(o=>o[0]===v[id]);return o?o[1]:String(v[id]||'')};
  const skip=new Set(['mode','loc','locName','audience','objective','amode','cstages','types','tradeTargets','fmode','priceMode','labourMode','transMode']);
  const model=m.fields.filter(f=>f.kind==='opt'&&!skip.has(f.id)&&f.type!=='text'&&(!f.show||f.show(v))).map(f=>`${f.label.replace(/\?$/,'')}: ${optLab(f.id)}`);
  if(v.cname)model.unshift('Business: '+esc(v.cname));
  if(v.types)model.push('Door types: '+v.types.length+' selected');
  const loc=globalThis.MABC_MARKET?MABC_MARKET.locLabel(v.loc,v.locName):[].concat(v.loc||[]).join(', ');
  const sc=['cons','exp','opt'].map(q=>scenarioOf(m,v,q)),SN=m.scenNames||['Conservative','Expected','Optimistic'];
  const T=(rows,head)=>`<table>${head?`<thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(rw=>`<tr>${rw.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const ins=m.insightList?m.insightList(r,v):[];
  const a=actual[cur]||{};
  const date=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  return `<header><p class="rk">Meta Ads Calculator · Get Bee Seen</p><h1>${esc(m.name)} forecast report</h1><p>${date}</p></header>
  <section><h2>Business and campaign</h2>${T([
    ['Industry',esc(m.name)],...model.map(x=>{const i=x.indexOf(': ');return[x.slice(0,i),x.slice(i+2)]}),
    ['Campaign objective',esc(optLab('objective')||'Not set')],[[].concat(v.loc||[]).length>1?'Locations':'Location',esc(loc||'')],['Target audience',esc(v.audience||'Not set')],
    ['Monthly budget',inr(v.spend)],['Daily budget','₹'+IN.format(Math.round(v.spend/30.4))],['Campaign duration',(v.months||1)+' month'+((v.months||1)===1?'':'s')+' · '+inr(v.spend*(v.months||1))+' in total'],
    ['Ad costs entered as',v.amode==='manual'||v.fmode==='cpl'?'Manual (known cost per lead or purchase)':'Forecast (CPM '+inr(v.cpm)+', CTR '+pct(v.ctr)+')']])}</section>
  <section><h2>Verdict</h2><p><b>${vd.h}.</b> ${vd.p}</p></section>
  <section><h2>Key results (per month)</h2>${T([
    ['Ad spend',inr(k.spend)],[cap(k.leadWord||'leads'),cnt(k.leads)],[k.costWord||'CPL',inr(k.cpl)],[cap(k.unitP||r.unitP),cnt(k.customers)],['CAC',inr(k.cac)],
    ['Average ticket / AOV',inr(k.ticket)],['Revenue',inr(k.revenue)],['Gross profit',inr(k.gross)],['Net profit',inr(k.net)],['ROAS',xx(k.roas)],['Profit ROAS',xx(k.profitRoas)],['ROI',pct(k.roi)]])}</section>
  <section><h2>Funnel and conversion rates</h2>${T(r.funnel.filter(s=>isFinite(s.n)).map(s=>[s.l,cnt(s.n),s.r||'',s.c[0]+' '+inr(s.c[1])]),['Stage','Count','Rate','Cost'])}</section>
  <section><h2>Profit breakdown</h2>${T([...r.pnl.map(x=>[x[0],inr(x[1])]),['<b>Net profit</b>','<b>'+inr(r.net)+'</b>']])}</section>
  <section><h2>Breakeven</h2>${T([['Breakeven ROAS',isFinite(k.beRoas)?xx(k.beRoas):'not reachable'],['Breakeven '+(k.costWord||'CPL'),inr(k.beCpl)],['Breakeven CAC',inr(k.beCac)]])}</section>
  <section><h2>Scenario analysis</h2>${T([['Ad spend',...sc.map(s=>inr((s.k||{}).spend))],[cap(k.leadWord||'leads'),...sc.map(s=>cnt((s.k||{}).leads))],[cap(k.unitP||r.unitP),...sc.map(s=>cnt((s.k||{}).customers))],
    ['Revenue',...sc.map(s=>inr(s.revenue))],['CAC',...sc.map(s=>inr(s.cac))],['ROAS',...sc.map(s=>xx(s.roas))],['Profit',...sc.map(s=>inr(s.net))],['ROI',...sc.map(s=>pct(s.roi))]],['',...SN])}
    <p class="small">${m.scenNote||''}</p></section>
  ${ins.length?`<section><h2>Insights</h2><ul>${ins.map(t=>`<li>${t}</li>`).join('')}</ul></section>`:''}
  ${Object.keys(a).length?`<section><h2>Actual results entered</h2>${T(Object.keys(a).map(id=>[cap(id),id==='spend'||id==='revenue'?inr(a[id]):cnt(a[id])]))}</section>`:''}
  <footer><p><b>These are estimates based on the assumptions entered, not guaranteed Meta Ads results.</b> Actual performance changes with creative, offer, audience, season and sales follow up. Starting assumptions are placeholders, not benchmarks.</p></footer>`;
}
const REPORT_CSS=`body{font:14px/1.55 Archivo,system-ui,sans-serif;color:#191816;background:#fff;margin:0}.rep-doc{max-width:820px;margin:0 auto;padding:32px 24px}
header{border-bottom:3px solid #FFB933;margin-bottom:18px;padding-bottom:10px}h1{font:400 30px 'Alfa Slab One',Georgia,serif;color:#196144;margin:4px 0}.rk{color:#196144;font-weight:700;margin:0;font-size:12px}
h2{font:400 18px 'Alfa Slab One',Georgia,serif;color:#196144;margin:22px 0 8px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#196144;color:#FFF2DC;text-align:left;padding:7px 8px}
td{padding:7px 8px;border-bottom:1px solid #EBD9B8;vertical-align:top}td:not(:first-child){text-align:right}ul{padding-left:20px}li{margin-bottom:6px}table.kv th{background:none;color:#5F6B63;width:32%}table.kv td,table.cm td,table.fc td{text-align:left}.plh{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.plh b{font:400 15px 'Alfa Slab One',Georgia,serif;color:#196144}.fit{font-size:12px;color:#5F6B63}.plt,.persona,.tgt-b,.phc,.cmp-b,.p90m,.lpsec{border:1px solid #EBD9B8;border-radius:12px;padding:10px 12px;margin:8px 0}h4{margin:6px 0;color:#196144}.fnb{background:#196144;color:#FFF2DC;border-radius:10px;padding:6px 12px;margin:2px auto}.fnb b{color:#FFB933;margin-right:8px}.fna{text-align:center;color:#FFB933}.scb,.alt{height:8px;background:#FFF2DC;border-radius:8px;overflow:hidden}.scb i,.alt i{display:block;height:100%;background:#196144}.alr{display:grid;grid-template-columns:1.2fr 1.6fr auto auto;gap:8px;align-items:center}.alr em{font-style:normal}.ageb,.stg div{display:inline-block;border:1px solid #EBD9B8;border-radius:10px;padding:6px 10px;margin:4px}.crosc{display:inline-block;background:#196144;color:#FFF2DC;border-radius:12px;padding:10px 14px}.crosc b{display:block;font-size:28px;color:#FFB933}.note{font-size:12px;color:#5F6B63}.small{font-size:12px;color:#5F6B63}footer{margin-top:26px;font-size:12px;color:#5F6B63;border-top:1px solid #EBD9B8;padding-top:10px}`;
function openReport(){const m=MODELS[cur];showReport(reportHTML(),m.name+' forecast report','meta-ads-report-'+m.key,'#report-btn')}
function showReport(body,title,file,focusBack){
  let ov=$('#report');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='report';ov.className='rep-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Report');
  ov.innerHTML=`<div class="rep"><div class="rep-bar"><b>Report preview</b><span><button class="btn btn-green btn-sm" type="button" data-rep="print">Print / save as PDF</button> <button class="btn btn-line btn-sm" type="button" data-rep="dl">Download HTML</button> <button class="btn btn-line btn-sm" type="button" data-rep="close">Close</button></span></div><article class="rep-doc">${body}</article></div>`;
  document.body.appendChild(ov);document.body.classList.add('rep-open');
  const close=()=>{ov.remove();document.body.classList.remove('rep-open');const b=focusBack&&$(focusBack);if(b)b.focus()};
  ov.addEventListener('click',e=>{const b=e.target.closest('[data-rep]');if(e.target===ov)close();if(!b)return;
    if(b.dataset.rep==='close')close();
    if(b.dataset.rep==='print'){document.body.classList.add('rp-print');try{window.print()}catch(err){toast('Printing is blocked here. Use your browser menu.')}setTimeout(()=>document.body.classList.remove('rp-print'),500)}
    if(b.dataset.rep==='dl'){try{const doc=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body><div class="rep-doc">${body}</div></body></html>`;
      const u=URL.createObjectURL(new Blob([doc],{type:'text/html'})),a=document.createElement('a');a.href=u;a.download=file+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}catch(err){toast('Download blocked by the browser. Use Print instead.')}}});
  ov.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  const f=ov.querySelector('[data-rep="print"]');if(f)f.focus();
}

/* ---------- copy ---------- */
function summaryText(){
  const m=MODELS[cur],v=state[cur],r=m.compute(v),vd=(m.verdict||verdict)(r,v);
  const lines=[`Meta Ads Business Calculator: ${m.name}`,`Ad budget: ${inr(v.spend)}/month (total cost ${inr(r.total)})`,'',vd.h,''];
  r.cards.forEach(c=>lines.push(`${c.k}: ${c.v} (${c.s})`));
  lines.push('','Funnel:');r.funnel.filter(s=>isFinite(s.n)).forEach(s=>lines.push(`• ${s.l}: ${num(s.n)} (${s.c[0]} ${inr(s.c[1])})`));
  if(m.summary)lines.push('',...m.summary(r,v,eng()));
  lines.push('','Estimates based on the entered assumptions; actual results will vary.');
  return lines.join('\n');
}
function copySummary(){
  const text=summaryText();
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();toast(ok?'Summary copied':'Copy blocked by the browser. Use Print instead.')};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast('Summary copied'),fallback);else fallback();
}


/* Test hook: only active when a test harness defines globalThis.__MABC_EXPOSE__ */
if(typeof globalThis!=='undefined'&&typeof globalThis.__MABC_EXPOSE__==='function'){
  globalThis.__MABC_EXPOSE__({MODELS,CATALOG,cnt,reportHTML:()=>reportHTML(),REPORT_CSS,state,inr,num,xx,pct,splitNum,fmtNum,zeroOf,tweenText,verdict,scaledOf,scenarioOf,ENGINE,
    open:function(k,vals){cur=k;load(k);if(vals)Object.assign(state[k],vals);shell();update();return{vals:state[k],summary:summaryText(),html:lastHtml}}});
}

/* ---------- API for the marketing planner (js/planner.js) ---------- */
/* econ(key): the industry's economics from its calculator (the user's saved inputs, or defaults) */
function econOf(key){
  const m=MODELS[key];if(!m)return null;if(!state[key])load(key);
  const r=m.compute(state[key]),k=r.k||{},st=r.funnel.filter(s=>isFinite(s.n));
  const leadIdx=k.leadWord==='leads'?st.findIndex(s=>Math.abs(s.n-k.leads)<1e-9&&k.leads>0):-1;
  const after=leadIdx>-1?st.slice(leadIdx+1):[];
  const lead=k.leadWord==='leads';
  return{key,name:m.name,lead,ticket:k.customers>0?k.revenue/k.customers:0,mu:k.revenue>0?Math.max(0,k.gross/k.revenue):0,
    l2c:lead?(k.leads>0?k.customers/k.leads:0):(k.clicks>0?k.customers/k.clicks:0),
    qual:after[0]&&k.leads>0?after[0].n/k.leads:NaN,qualLabel:after[0]?after[0].l:'',
    meet:after[1]&&after[0]&&after[0].n>0?after[1].n/after[0].n:NaN,meetLabel:after[1]?after[1].l:'',
    unit:k.unit||r.unit,unitP:k.unitP||r.unitP,cpm:state[key].cpm,ctr:state[key].ctr,lpConv:state[key].lpConv};
}
globalThis.MABC_APP={MODELS,CATALOG,econ:econOf,inr,num,cnt,pct,xx,div,esc,toast,cap:s=>s.charAt(0).toUpperCase()+s.slice(1),
  openCalculator:k=>{if(MODELS[k])setModel(k,true)},showReport,market:()=>globalThis.MABC_MARKET||null,RM};

/* ---------- industry dashboard ---------- */
(function(){
  const box=$('#industries');if(!box)return;
  const ic=n=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(globalThis.MABC_ICONS||{})[n]||''}</svg>`;
  box.innerHTML=`<div class="ifilter"><label for="ifind">Find your industry</label><div class="inp"><input id="ifind" type="search" placeholder="For example dental, timber, SaaS" autocomplete="off"></div></div>`+
    CATALOG.map(g=>`<div class="igroup"><h3>${esc(g.cat)}</h3><div class="igrid">${g.items.map(i=>{const m=MODELS[i.key],nm=i.name||m.name;
      return `<article class="ind" data-m="${i.key}" aria-pressed="false" data-q="${esc((nm+' '+m.name+' '+(m.desc||'')).toLowerCase())}"><div class="badge">${ic(m.icon)}</div><div class="ib"><h4>${esc(nm)}</h4><p>${esc(m.flow||'')}</p>${i.alias?`<small>Same calculator as ${esc(m.name)}</small>`:''}</div><button class="btn btn-green btn-sm" type="button" data-pick="${i.key}" aria-label="Calculate ${esc(nm)}">Calculate</button></article>`}).join('')}</div></div>`).join('')+
    '<p class="note inone" hidden>No industry matches. Try the Custom industry calculator.</p>';
  const q=$('#ifind');q.addEventListener('input',()=>{const t=q.value.trim().toLowerCase();let any=0;
    $$('.igroup',box).forEach(g=>{let n=0;$$('.ind',g).forEach(c=>{const on=!t||c.dataset.q.includes(t);c.hidden=!on;n+=on});g.hidden=!n;any+=n});$('.inone',box).hidden=!!any});
  const cnt$=$('#ind-count');if(cnt$)cnt$.textContent=Object.keys(MODELS).length;
})();

/* ---------- ribbon ticker: a permanent, seamless scroll of every industry ----------
   Two identical copies side by side; the track moves left by one copy width and loops.
   Reduced motion keeps the static ribbon from index.html. */
(function(){
  const rb=$('.ribbon');if(!rb||RM.matches)return;
  const names=[...new Set(CATALOG.flatMap(g=>g.items.filter(i=>!i.alias).map(i=>i.name||MODELS[i.key].name)))];
  if(!names.length)return;
  const bee=ASSETS.bee;
  const run=hidden=>`<div class="tk-run"${hidden?' aria-hidden="true"':''}>${names.map((n,i)=>`${i%6===0?`<img src="${bee}" alt="">`:'<i class="sep"></i>'}<span>${esc(n)}</span>`).join('')}<i class="sep"></i></div>`;
  rb.innerHTML=`<div class="tk" role="marquee" aria-label="${names.length} industry calculators"><div class="tk-track" style="--tk-d:${Math.round(names.length*3.2)}s">${run(0)}${run(1)}</div></div>`;
  rb.classList.add('ticking');
})();

/* ---------- mobile header menu ---------- */
(function(){
  const btn=$('.menu-btn'),nav=$('#mainnav');if(!btn||!nav)return;
  const set=o=>{btn.setAttribute('aria-expanded',String(o));document.documentElement.classList.toggle('menu-open',o)};
  btn.addEventListener('click',()=>set(btn.getAttribute('aria-expanded')!=='true'));
  nav.addEventListener('click',e=>{if(e.target.closest('a'))set(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false)});
})();

/* ---------- mobile results bar: while editing inputs on a phone, show the key result and a jump to results ---------- */
const mbar=(function(){
  if(typeof document.createElement!=='function'||!('IntersectionObserver' in window))return{update(){}};
  const el=document.createElement('div');el.className='mbar';el.setAttribute('aria-live','polite');el.hidden=true;
  el.innerHTML='<div class="mb-txt"></div><button type="button" class="btn btn-sm mb-go">See results</button>';
  document.body.appendChild(el);
  let inCalc=false,resVis=false;const mq=matchMedia('(max-width:1039px)');
  const sync=()=>{el.hidden=!(mq.matches&&inCalc&&!resVis&&cur)};
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.target===wf)inCalc=e.isIntersecting;else resVis=e.isIntersecting;sync()}),{threshold:0});
  let watched=null,wf=null;
  el.querySelector('.mb-go').addEventListener('click',()=>{const r=$('#res-main');if(r)r.scrollIntoView({behavior:RM.matches?'auto':'smooth',block:'start'})});
  if(mq.addEventListener)mq.addEventListener('change',sync);
  return{update(r){const fc=$('#calculator .form-col');if(fc&&fc!==wf){if(wf)io.unobserve(wf);inCalc=false;io.observe(fc);wf=fc}
    const rm=$('#res-main');if(rm&&rm!==watched){if(watched)io.unobserve(watched);io.observe(rm);watched=rm}
    const k=r.k||{};el.querySelector('.mb-txt').innerHTML=`<span>Net profit <b class="${k.net>=0?'good':'bad'}">${inr(k.net)}</b></span><span>ROAS <b>${xx(k.roas)}</b></span><span>${cap(k.unitP||r.unitP)} <b>${cnt(k.customers)}</b></span>`;sync()}};
})();

/* ---------- scroll reveals ---------- */
(function(){
  const els=$$('.rv');
  if(RM.matches||!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
  document.documentElement.classList.add('js-rv');
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -5% 0px'});
  els.forEach(e=>io.observe(e));
})();
})();
