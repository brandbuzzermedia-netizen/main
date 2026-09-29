/* Marketing Planner: a modular performance marketing strategy builder on top of the calculators.
   Flow: 1 Business → 2 Objective → 3 Platforms → 4 Select modules → 5 Plan.
   Only the modules the user selects are generated, shown in the navigation and included in the report.
   Recommendations come from rules (industry, business model, market, objective, budget); forecasts reuse
   each industry calculator's economics plus per platform assumptions. Nothing here is a guarantee. */
(function(){
'use strict';
const D=globalThis.MABC_PLANNER_DATA,APP=()=>globalThis.MABC_APP;
if(!D)return;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const IN=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
const inr=n=>{if(!isFinite(n))return 'n/a';const s=n<0&&Math.abs(n)>=0.5?'-':'',a=Math.abs(n);return a>=1e7?s+'₹'+(a/1e7).toFixed(2)+' Cr':a>=1e5?s+'₹'+(a/1e5).toFixed(2)+' L':s+'₹'+IN.format(Math.round(a))};
const cnt=n=>!isFinite(n)?'n/a':n<=0?'0':n<1?'under 1':IN.format(Math.round(n));
const pct=n=>isFinite(n)?(Math.round(n*10)/10).toString()+'%':'n/a';
const xx=n=>isFinite(n)?(Math.abs(n)<0.005?0:n).toFixed(2)+'x':'n/a';
const div=(a,b)=>b>0?a/b:Infinity;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const list=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
const lc=a=>a.map((x,i)=>i?x.charAt(0).toLowerCase()+x.slice(1):x);
const PL=D.PLATFORMS,PO=D.PLATFORM_ORDER;
const OBJ=Object.fromEntries(D.OBJECTIVES.map(o=>[o[0],{id:o[0],label:o[1],k:o[2]}]));
const MOD=Object.fromEntries(D.MODULES.map(m=>[m[0],{id:m[0],name:m[1],desc:m[2],icon:m[3]}]));
const MOD_ORDER=D.MODULES.map(m=>m[0]);

/* ---------- state ---------- */
const KEY='mabc:planner';
const DEF=()=>({step:1,industry:'',model:'',country:'india',countryName:'',cities:'Bengaluru',product:'',objective:'leads',budget:100000,
  pmode:'auto',platforms:['meta','google'],amazonListed:'',modules:[],custom:'',reached:1,
  ov:{ages:null,alloc:null,assume:{},econ:{},fixed:0,amz:{price:999,cost:350,referral:15,fba:70,ship:0,returns:5,disc:5,organic:100000},cro:{},sens:{},range:'range',vols:0}});
let S=load();
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&typeof s==='object'){const d=DEF();return Object.assign(d,s,{ov:Object.assign(d.ov,s.ov||{})})}}catch(e){}return DEF()}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

/* ---------- context ---------- */
function context(st){
  st=st||S;
  const ind=D.INDUSTRIES.find(i=>i.id===st.industry)||D.INDUSTRIES[0];
  const arch=D.ARCH[ind.arch]||D.ARCH.local,model=st.model||ind.model,obj=OBJ[st.objective]||OBJ.leads;
  const country=D.COUNTRIES[st.country]||D.COUNTRIES.india,countryLabel=st.country==='other'?(String(st.countryName||'').trim()||'your market'):country.label;
  let funnel=(obj.id==='dealer'||obj.id==='distributor')?'dealer':(D.FUNNEL_OF[model]||arch.funnel);
  if(obj.id==='amazon')funnel='ecom';
  const b2bish=['b2b','dealer','saas'].includes(ind.arch)||['b2b','manufacturer','distributor','wholesaler','saas'].includes(model)||obj.id==='dealer'||obj.id==='distributor'||obj.id==='demo';
  const consumer=!!arch.consumer&&!b2bish;
  const cities=String(st.cities||'').split(',').map(x=>x.trim()).filter(Boolean);
  const loc=cities.length?list(cities.slice(0,3)):countryLabel;
  const product=String(st.product||'').trim()||ind.noun;
  const app=APP(),econ0=app&&app.econ(ind.calc)||{lead:true,ticket:20000,mu:0.4,l2c:0.08,qual:0.5,meet:0.4,cpm:180,ctr:1,lpConv:8,name:ind.label,unit:'customer',unitP:'customers'};
  const kind=(funnel==='ecom'||obj.k==='order')&&!(funnel==='service'&&obj.k==='lead')?'order':'lead';
  const e=st.ov.econ||{};
  const econ={ticket:num(e.ticket,econ0.ticket),mu:num(e.mu,econ0.mu*100)/100,
    l2c:num(e.l2c,(kind==='lead'?(econ0.lead?econ0.l2c:0.08):(econ0.lead?0.02:econ0.l2c))*100)/100,
    qual:num(e.qual,(isFinite(econ0.qual)?econ0.qual:0.5)*100)/100,meet:num(e.meet,(isFinite(econ0.meet)?econ0.meet:0.4)*100)/100,
    calc:econ0.name,calcKey:ind.calc,unit:econ0.unit,unitP:econ0.unitP,cpm:econ0.cpm,ctr:econ0.ctr,lpConv:econ0.lpConv};
  const c={st,ind,arch,model,modelLabel:(D.BMODELS.find(m=>m[0]===model)||['',model])[1],obj,country,countryKey:st.country,countryLabel,cities,loc,product,funnel,kind,b2bish,consumer,econ,budget:Math.max(0,+st.budget||0)};
  c.evals=Object.fromEntries(PO.map(p=>[p,evaluate(p,c)]));
  c.platforms=chosen(c);
  c.alloc=allocate(c);
  c.fc=forecast(c);
  return c;
}
function num(v,d){const n=parseFloat(v);return isFinite(n)&&n>=0?n:d}

/* ---------- platform eligibility and fit ---------- */
function evaluate(p,c){
  const R=[],W=[];let s=0,status='eligible';
  const o=c.obj.id,ok=c.obj.k,ind=c.ind,a=ind.arch,vis=ind.visual;
  const lowBudget=c.budget<30000;
  if(p==='meta'){s=65;if(c.consumer){s+=15;R.push('Large consumer reach and strong lead and sales tools')}if(['lead'].includes(ok)){s+=10;R.push('Instant forms and WhatsApp make lead capture easy')}
    if(ok==='order'){s+=8;R.push('Strong for product sales with catalog and retargeting')}if(ok==='reach'){s+=5;R.push('Efficient reach with Reels and video')}if(c.b2bish){s-=10;W.push('B2B lead quality varies: qualify leads quickly')}}
  if(p==='google'){s=62;if(['local','highticket','health','pro','realestate','hosp','edu'].includes(a)){s+=18;R.push('People actively search for this service')}if(c.b2bish){s+=12;R.push('Captures buyers searching for suppliers and solutions')}
    if(a==='ecom'){s+=10;R.push('Shopping and Performance Max for product demand')}if(['calls','bookings','consultation','enquiries','leads','demo','sales'].includes(o)){s+=8;R.push('High intent objective suits search')}
    if(ok==='reach'){s-=8;R.push('YouTube and Demand Gen for awareness')}if(o==='app'){s+=10;R.push('App campaigns across Search, Play and YouTube')}}
  if(p==='linkedin'){s=18;if(c.b2bish||['pro'].includes(a)&&!c.consumer){s+=55;R.push('Target by job title, function, seniority and company')}else if(a==='pro'||a==='saas'){s+=30;R.push('Reaches professionals and decision makers')}else{W.push('Consumer audiences are cheaper to reach on Meta and Google')}
    if(['demo','dealer','distributor'].includes(o)){s+=8;R.push('Suits demo and partner acquisition')}if(lowBudget){s-=12;W.push('Cost per click is usually high; small budgets buy few clicks')}}
  if(p==='jiohotstar'){if(!c.country.jio){status='excluded';W.push('JioHotstar is an Indian platform; not applicable to '+c.countryLabel)}
    else{status='verify';s=15;if(ok==='reach'){s+=40;R.push('Premium video reach for awareness')}if(c.consumer&&['ecom','food','fitness','highticket','edu','realestate','hosp'].includes(a)){s+=18;R.push('Mass market audience across regions and languages')}
      if(c.b2bish){s-=15;W.push('Mass reach wastes budget for niche B2B audiences')}if(ok==='lead'||ok==='order'){W.push('Best as awareness that lifts search and retargeting, not a direct lead source')}
      W.push('Buying options, minimum spends and targeting depend on JioStar inventory: verify before planning');if(c.budget<200000)s-=10}}
  if(p==='tiktok'){const t=c.country.tiktok;
    if(t===0){status='excluded';W.push('TikTok is not available in '+c.countryLabel+', so it is excluded')}
    else{if(t==='verify'){status='verify';W.push('Check TikTok Ads availability in '+c.countryLabel)}s=28;
      if(a==='ecom'||a==='fitness'||a==='food'||['d2c','ecom'].includes(c.model)){s+=40;R.push('Native video and creators drive discovery for consumer brands')}if(o==='app'){s+=15;R.push('Strong app install formats')}
      if(c.b2bish){s-=18;W.push('Weak fit for most B2B buying')}}}
  if(p==='pinterest'){const t=c.country.pinterest;if(t==='verify'){status='verify';W.push('Self serve Pinterest Ads availability varies: check it for '+c.countryLabel)}s=15;
    if(vis){s+=42;R.push('Visual discovery category: people plan and save ideas here')}if(ok==='order'||ok==='reach'){s+=8}if(c.b2bish){s-=25;W.push('Weak fit for B2B, dealer and partner acquisition')}if(!vis)W.push('Works best for visual inspiration categories')}
  if(p==='amazon'){const m=c.country.amazon;
    if(c.st.amazonListed!=='yes'){status='excluded';W.push(c.st.amazonListed==='no'?'Your products are not listed on Amazon, so Amazon Ads are excluded':'Answer whether your products are listed on Amazon to consider Amazon Ads')}
    else if(!m){status='excluded';W.push('No Amazon marketplace for '+c.countryLabel)}
    else{if(m==='verify'){status='verify';W.push('Check that an Amazon marketplace serves '+c.countryLabel)}s=58;if(o==='amazon'){s+=30;R.push('Your objective is Amazon sales')}if(c.kind==='order'){s+=10;R.push('Shoppers on Amazon are ready to buy')}}}
  return{p,status,score:status==='excluded'?0:clamp(Math.round(s),0,100),reasons:R,cautions:W};
}
const fitLabel=s=>s>=75?'Strong fit':s>=55?'Good fit':s>=35?'Test':'Low priority';
function chosen(c){
  const ev=c.evals;
  if(c.st.pmode==='manual')return c.st.platforms.filter(p=>ev[p]&&ev[p].status!=='excluded');
  let r=PO.filter(p=>ev[p].status!=='excluded'&&ev[p].score>=45).sort((a,b)=>ev[b].score-ev[a].score);
  const maxN=c.budget<50000?2:c.budget<150000?3:4;r=r.slice(0,maxN);
  if(!r.length)r=['meta'];
  return PO.filter(p=>r.includes(p));
}

/* ---------- budget allocation ---------- */
function allocate(c){
  const ps=c.platforms,n=ps.length,o=c.obj.id,k=c.obj.k;
  const reserve=n>2?10:n>1?5:0;
  const w={};ps.forEach(p=>{let x=Math.max(5,c.evals[p].score-20);
    if(k==='reach'&&['jiohotstar','meta','tiktok','pinterest'].includes(p))x*=1.3;
    if(['calls','bookings','consultation','enquiries','leads','demo'].includes(o)&&p==='google')x*=1.2;
    if(['demo','dealer','distributor'].includes(o)&&p==='linkedin')x*=1.2;
    if(o==='amazon'&&p==='amazon')x*=1.6;w[p]=x});
  let share=round100(ps.map(p=>w[p]),100-reserve);
  let rec=Object.fromEntries(ps.map((p,i)=>[p,share[i]]));rec.test=reserve;
  const ov=c.st.ov.alloc;let used=rec,manual=false;
  if(ov&&ps.every(p=>isFinite(+ov[p]))){const t=ps.reduce((a,p)=>a+Math.max(0,+ov[p]),0)+Math.max(0,+ov.test||0);
    if(t>0){manual=true;used=Object.fromEntries([...ps,'test'].map(p=>[p,Math.max(0,+ov[p]||0)/t*100]))}}
  const stage=stageSplit(c);
  return{rec,pct:used,manual,amount:Object.fromEntries([...ps,'test'].map(p=>[p,c.budget*used[p]/100])),stage};
}
function round100(ws,total){const s=ws.reduce((a,b)=>a+b,0)||1,raw=ws.map(w=>w/s*total),fl=raw.map(Math.floor);let left=total-fl.reduce((a,b)=>a+b,0);
  raw.map((r,i)=>[r-fl[i],i]).sort((a,b)=>b[0]-a[0]).forEach(([,i])=>{if(left>0){fl[i]++;left--}});return fl}
function stageSplit(c){
  const k=c.obj.k;let s=k==='reach'?[55,25,10,10]:k==='traffic'?[30,35,25,10]:k==='app'?[20,20,50,10]:k==='visit'?[30,25,30,15]:[15,20,50,15];
  s=s.slice();if(c.b2bish&&k!=='reach'){s[1]+=5;s[2]-=5}if(c.arch.nurture&&k!=='reach'){s[3]+=5;s[2]-=5}
  return[['Awareness',s[0]],['Consideration',s[1]],['Conversion',s[2]],['Retargeting',s[3]]];
}

/* ---------- forecasting (per platform assumptions) ---------- */
function assumptions(c,p){
  const d=PL[p],o=(c.st.ov.assume||{})[p]||{},lead=c.kind==='lead'&&p!=='amazon';
  let cpm=d.cpm,ctr=d.ctr,conv=lead?d.convLead:d.convOrder;
  if(p==='meta'){cpm=c.econ.cpm||cpm;ctr=c.econ.ctr||ctr;conv=lead?(c.econ.lpConv||conv):Math.max(0.1,Math.round(c.econ.l2c*1000)/10)}
  return{cpm:num(o.cpm,cpm),ctr:num(o.ctr,ctr),conv:num(o.conv,conv),quality:num(o.quality,d.quality),freq:d.freq,lead};
}
const SENS=[['cpm','CPM'],['ctr','CTR'],['cpc','CPC'],['conv','Conversion rate'],['cpl','CPL'],['qual','Qualification rate'],['sales','Sales rate'],['aov','AOV / ticket size'],['margin','Gross margin']];
function forecast(c,scen){
  const sv=c.st.ov.sens||{},m=k=>1+(+sv[k]||0)/100,f=scen==='cons'?{acq:1.15,conv:0.85,l2c:0.9,val:0.95}:scen==='agg'?{acq:0.9,conv:1.15,l2c:1.1,val:1.05}:{acq:1,conv:1,l2c:1,val:1};
  const E=c.econ,amz=c.st.ov.amz||{},rows=[];
  const cpmM=m('cpm')*m('cpc')*m('cpl')*f.acq,ctrM=m('ctr'),convM=m('conv')*f.conv,qualM=m('qual'),salesM=m('sales')*f.l2c,aovM=m('aov')*f.val,muM=m('margin');
  const mu=clamp(E.mu*muM,0,1),ticket=E.ticket*aovM;
  c.platforms.forEach(p=>{
    const a=assumptions(c,p),spend=c.alloc.amount[p]||0;
    const impr=spend/Math.max(1,a.cpm*cpmM)*1000,reach=impr/Math.max(1,a.freq),clicks=impr*clamp(a.ctr*ctrM,0,100)/100;
    let leads=NaN,qual=NaN,meet=NaN,cust,revenue,gross,vc;
    const conv=clamp(a.conv*convM,0,100)/100;
    if(p==='amazon'){cust=clicks*conv;const price=(+amz.price||0)*(1-clamp(+amz.disc||0,0,100)/100)*aovM;revenue=cust*price;
      vc=cust*(+amz.cost||0)+revenue*clamp(+amz.referral||0,0,100)/100+cust*((+amz.fba||0)+(+amz.ship||0))+revenue*clamp(+amz.returns||0,0,100)/100;gross=revenue-vc}
    else if(a.lead){leads=clicks*conv;qual=leads*clamp(E.qual*qualM,0,1);meet=qual*clamp(E.meet,0,1);cust=Math.min(leads,leads*clamp(E.l2c*salesM,0,1)*a.quality);revenue=cust*ticket;gross=revenue*mu;vc=revenue-gross}
    else{cust=clicks*conv*clamp(salesM,0,2);revenue=cust*ticket;gross=revenue*mu;vc=revenue-gross}
    const net=gross-spend;
    rows.push({p,spend,impr,reach,clicks,ctr:a.ctr*ctrM,cpc:div(spend,clicks),cpm:a.cpm*cpmM,leads,qual,meet,cust,cpl:div(spend,leads),cpa:div(spend,cust),revenue,gross,vc,net,roas:div(revenue,spend),a});
  });
  const sum=k=>rows.reduce((t,r)=>t+(isFinite(r[k])?r[k]:0),0);
  const reserve=c.alloc.amount.test||0,fixed=Math.max(0,+c.st.ov.fixed||0);
  const spend=sum('spend')+reserve,revenue=sum('revenue'),gross=sum('gross'),vc=sum('vc'),cust=sum('cust'),leads=rows.some(r=>isFinite(r.leads))?sum('leads'):NaN;
  const net=gross-spend-fixed,invest=vc+spend+fixed,muT=revenue>0?gross/revenue:0;
  const T={spend,reserve,fixed,impr:sum('impr'),reach:sum('reach'),clicks:sum('clicks'),leads,qual:rows.some(r=>isFinite(r.qual))?sum('qual'):NaN,meet:rows.some(r=>isFinite(r.meet))?sum('meet'):NaN,cust,revenue,gross,vc,net,invest,
    ctr:div(sum('clicks'),sum('impr'))*100,cpc:div(sum('spend'),sum('clicks')),cpl:div(sum('spend'),leads),cpa:div(spend,cust),cac:div(spend+fixed,cust),aov:div(revenue,cust),
    roas:div(revenue,spend),profitRoas:spend>0?net/spend:NaN,roi:invest>0?net/invest*100:0,mu:muT,beRoas:muT>0?1/muT:Infinity,beCac:cust>0?Math.max(0,gross/cust):0,
    beCpl:isFinite(leads)&&leads>0&&gross>0?gross/leads*spend/(spend+fixed):0};
  const az=rows.find(r=>r.p==='amazon');
  if(az){T.acos=div(az.spend,az.revenue)*100;T.tacos=div(az.spend,az.revenue+Math.max(0,+amz.organic||0))*100}
  return{rows,T};
}
function band(c){return['cons','exp','agg'].map(k=>k==='exp'?c.fc:forecast(c,k))}
function rng(sc,get,fmt,mode){const f=fmt||cnt,v=sc.map(get).filter(isFinite);if(!v.length)return 'n/a';if(mode==='single')return f(get(sc[1]));const lo=Math.min(...v),hi=Math.max(...v);return f(lo)===f(hi)?f(lo):f(lo)+' to '+f(hi)}

/* ---------- helpers for recommendations ---------- */
function ages(c){const o=c.st.ov.ages,A=c.arch.age;return o&&o.length===3?o:A}
const ageTxt=a=>a[0]+' to '+a[1];
function jobTitles(c){
  const t={b2b:['Owner','Managing Director','Procurement Manager','Purchase Head','Operations Head'],dealer:['Proprietor','Dealer','Distributor','Retail store owner','Contractor'],saas:['Founder','CTO','IT Manager','Head of Operations','Product Manager'],pro:['Founder','Director','Finance Manager','HR Head']}[c.arch===D.ARCH.dealer?'dealer':c.ind.arch]||['Owner','Director','Manager'];
  const extra={'Architecture':['Architect','Principal Architect'],'Interior design':['Interior Designer','Design Studio Owner'],'Building materials':['Civil Engineer','Project Manager','Site Engineer'],'Door manufacturer':['Builder','Project Manager','Interior Designer'],
    'Timber importer':['Furniture Manufacturer','Sawmill Owner','Interior Contractor'],'Industrial machinery':['Production Manager','Maintenance Head','Plant Head'],'Manufacturing':['Plant Manager','Quality Head','Sourcing Manager'],'Technology':['IT Director','CIO'],'Marketing agency':['Marketing Manager','Growth Head']}[c.ind.label]||[];
  return[...t,...extra].slice(0,9);
}
const FUNCS={b2b:['Procurement','Operations','Engineering','Management','Finance'],dealer:['Sales','Operations','Management'],saas:['IT','Operations','Engineering','Management','Finance'],pro:['Management','Finance','HR','Operations']};
const SENIORITY=['Owner','Founder','Partner','CXO','Director','VP','Head','Manager','Senior'];
function keywords(c){
  const p=c.product.toLowerCase(),city=(c.cities[0]||c.countryLabel).toLowerCase(),b2b=c.b2bish;
  return{
    'High intent':[`${p} price`,`buy ${p}`,`${p} near me`],
    'Commercial':b2b?[`${p} manufacturers`,`${p} suppliers`,`${p} wholesale`]:[`best ${p}`,`${p} cost`,`${p} reviews`],
    'Transactional':b2b?[`${p} quotation`,`${p} bulk order`]:[`${p} online`,`${p} booking`],
    'Local':[`${p} in ${city}`,`${p} ${city}`],
    'Brand':['your brand name','your brand + product'],
    'Competitor (optional)':['competitor name alternative','competitor vs your brand']};
}
function ctaFor(c){const o=c.obj.id;return({sales:'Shop now',amazon:'Shop on Amazon',whatsapp:'Chat on WhatsApp',calls:'Call now',bookings:'Book now',demo:'Book a demo',dealer:'Become a dealer',distributor:'Become a distributor',store:'Get directions',consultation:'Book a consultation',app:'Install now',traffic:'Learn more',awareness:'Learn more',discovery:'Explore the range'})[o]||'Get a quote'}
function hook(c,i){const H=D.HOOKS[c.arch===D.ARCH.dealer?'dealer':c.ind.arch]||D.HOOKS.local;return H[i%H.length].replace(/\{p\}/g,c.product).replace(/\{loc\}/g,c.loc).replace(/\{b\}/g,c.ind.buyer)}
const pname=p=>PL[p].short;
function roleOf(c,p){const f=PL[p].funnel;return f[c.funnel==='dealer'?'b2b':c.funnel]||f[c.funnel==='saas'?'b2b':'def']||f.def}
function campTypes(c,p){
  const o=c.obj.id,k=c.obj.k;
  if(p==='meta')return[k==='reach'?'Awareness':k==='order'?'Sales':o==='whatsapp'?'Leads (WhatsApp destination)':k==='traffic'?'Traffic':o==='app'?'App promotion':'Leads','Retargeting (Sales or Leads)'];
  if(p==='google')return c.funnel==='ecom'?['Shopping or Performance Max','Search (brand and generic)','Remarketing']:o==='app'?['App campaign','Search (brand)']:k==='reach'?['YouTube (video reach)','Demand Gen','Search (brand)']:['Search (high intent)','Performance Max (after conversion tracking works)','Demand Gen or YouTube retargeting'];
  if(p==='linkedin')return['Lead gen forms (Sponsored content)','Brand awareness or video','Website retargeting'];
  if(p==='jiohotstar')return['Video reach (in stream)','Frequency capped awareness'];
  if(p==='tiktok')return[k==='order'?'Web conversions (purchase)':o==='app'?'App promotion':'Lead generation','Spark Ads with creators','Retargeting'];
  if(p==='pinterest')return[k==='order'?'Catalog sales (where available)':'Consideration (traffic)','Retargeting'];
  if(p==='amazon')return['Sponsored Products','Sponsored Brands','Sponsored Display','DSP (only at larger budgets)'];
  return[];
}

/* ---------- modules ---------- */
const M={};
M.platforms=c=>{
  const cards=PO.map(p=>{const e=c.evals[p],on=c.platforms.includes(p);
    if(!on&&e.status!=='excluded'&&c.st.pmode==='manual')return '';
    if(!on&&e.status!=='excluded')return `<div class="plt off"><div class="plh"><b>${PL[p].name}</b><span class="fit">${fitLabel(e.score)} · not selected</span></div><p class="note">${esc(e.reasons[0]||e.cautions[0]||'Lower priority for this business and budget.')}</p></div>`;
    if(e.status==='excluded')return `<div class="plt off ex"><div class="plh"><b>${PL[p].name}</b><span class="fit bad">Excluded</span></div><p class="note">${esc(e.cautions[0]||'')}</p></div>`;
    return `<div class="plt"><div class="plh"><b>${PL[p].name}</b><span class="fit">${fitLabel(e.score)}${e.status==='verify'?' · verify':''}</span></div>
      <div class="scb"><i style="width:${e.score}%"></i></div>
      <p><b>Role:</b> ${esc(roleOf(c,p))}</p>
      <p><b>Campaign types:</b> ${esc(campTypes(c,p).join(', '))}</p>
      ${e.reasons.length?`<ul>${e.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:''}
      ${e.cautions.length?`<p class="note">${e.cautions.map(esc).join(' ')}</p>`:''}</div>`}).join('');
  const ins=[];const top=c.platforms.slice().sort((a,b)=>c.evals[b].score-c.evals[a].score)[0];
  if(top)ins.push(`${PL[top].name} is the strongest fit for a ${c.modelLabel.toLowerCase()} ${c.ind.label.toLowerCase()} business with a ${c.obj.label.toLowerCase()} objective.`);
  if(c.platforms.length>3&&c.budget<150000)ins.push('Your budget is spread over many platforms. Fewer platforms learn faster and give clearer results.');
  return{body:`<p class="note" style="margin:0 0 12px">${c.st.pmode==='auto'?'Recommended automatically from your industry, business model, market, objective and budget.':'Your manual selection, checked for eligibility.'} Platform features and availability change: confirm in each ads manager.</p><div class="plts">${cards}</div>`,ins};
};
M.audience=c=>{
  const A=c.arch,g=ages(c),top=c.platforms.slice().sort((a,b)=>c.evals[b].score-c.evals[a].score);
  const persona=(title,who,age,angle,plat)=>`<div class="persona"><h4>${title}</h4><table class="kv"><tbody>
    ${[['Persona',who],['Age',age],['Gender',A.gender],['Location',c.loc],['Occupation',A.occ],['Income or affluence',A.income],['Interests',list(c.ind.interests)],['Behaviours',A.behav],['Pain points',list(lc(c.ind.pains))],['Purchase intent',A.intent],['Best platform',plat],['Messaging angle',angle]].map(r=>`<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>`;
  const rt=['Website visitors (30 days)','Product or service page viewers','Lead form openers who did not submit','Video viewers (50% or more)','Instagram and Facebook engagers','Existing leads not yet converted',...(c.kind==='order'?['Add to cart without purchase (7 days)']:[]),'Existing customers (exclude from prospecting, use for upsell)'];
  const tgt=c.platforms.map(p=>{
    if(p==='google')return `<div class="tgt-b"><h4>Google: search intent</h4>${Object.entries(keywords(c)).map(([k,v])=>`<p><b>${k}:</b> ${v.map(esc).join(', ')}</p>`).join('')}<p><b>Audiences:</b> ${PL.google.audiences.join(', ')}</p></div>`;
    if(p==='linkedin')return `<div class="tgt-b"><h4>LinkedIn: decision makers</h4><p><b>Job titles:</b> ${jobTitles(c).map(esc).join(', ')}</p><p><b>Job functions:</b> ${(FUNCS[c.ind.arch]||FUNCS.b2b).join(', ')}</p><p><b>Seniority:</b> ${SENIORITY.slice(0,7).join(', ')}</p><p><b>Company:</b> industries that buy ${esc(c.product)}, company size by your deal size, location ${esc(c.loc)}</p></div>`;
    if(p==='amazon')return `<div class="tgt-b"><h4>Amazon: shoppers</h4><p><b>Keywords:</b> ${keywords(c)['High intent'].concat(keywords(c)['Commercial']).map(esc).join(', ')}</p><p><b>Product targeting:</b> competitor ASINs and complementary products</p></div>`;
    return `<div class="tgt-b"><h4>${PL[p].short}</h4><p><b>Targeting:</b> ${PL[p].audiences.join(', ')}</p><p><b>Interests to start with:</b> ${c.ind.interests.map(esc).join(', ')}</p></div>`}).join('');
  const ins=[c.b2bish?'The primary audience should focus on decision makers because the business model is B2B.':`Lead with ${A.angle.toLowerCase()}: it is what this audience weighs most.`,'Keep retargeting audiences separate from prospecting so each gets the right message.'];
  return{body:`<div class="personas">${persona('Primary audience',c.ind.buyer,ageTxt(g[0]),A.angle,top[0]?PL[top[0]].short:'Meta')}${persona('Secondary audience',c.ind.buyer2,ageTxt(g[1]),A.angle,top[1]?PL[top[1]].short:top[0]?PL[top[0]].short:'Meta')}</div>
    <h4 class="h4">Retargeting audience</h4><ul class="ticks">${rt.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${tgt?`<h4 class="h4">Platform targeting</h4><div class="tgts">${tgt}</div>`:''}`,ins};
};
M.demo=c=>{
  const A=c.arch,g=ages(c),local=['local','service','pro','retailer'].includes(c.model)||['local','health','food','fitness'].includes(c.ind.arch);
  const intl=!['india'].includes(c.countryKey);
  const langs=[...c.country.lang];c.cities.forEach(ct=>{const l=D.CITY_LANG[ct];if(l&&!langs.includes(l))langs.push(l)});
  const locRows=[['Country',c.countryLabel],['States or regions',c.cities.length?'Where '+list(c.cities)+' are':'Your strongest states first'],['Cities',c.cities.length?list(c.cities):'Your top cities by past sales'],
    ['Radius or pin codes',local?'5 to 15 km around each location, or the pin codes you serve':'Not needed; target cities or regions'],['Urban or rural',c.consumer?'Urban and semi urban first, expand after results':'Business and industrial areas'],
    ['Language',list(langs)]];
  if(c.b2bish)locRows.push(['Business locations','Industrial clusters, trade hubs and business districts in '+(c.cities.length?list(c.cities):c.countryLabel)]);
  if(intl)locRows.push(['Market by market','Separate campaigns per country so budgets and messages fit each market']);
  const ctrl=`<div class="agein"><span>Override ages:</span>${['Primary','Secondary test','Expansion'].map((l,i)=>`<label>${l} <input type="number" min="13" max="80" data-pov="ages.${i}.0" value="${g[i][0]}"> to <input type="number" min="13" max="80" data-pov="ages.${i}.1" value="${g[i][1]}"></label>`).join('')}<button type="button" class="btn btn-line btn-sm" data-pact="resetAges">Use recommended</button></div>`;
  return{ctrl,body:`<div class="agec">${[['Primary age',g[0]],['Secondary test age',g[1]],['Expansion age',g[2]]].map(([l,a])=>`<div class="ageb"><span>${l}</span><b>${ageTxt(a)}</b></div>`).join('')}</div>
    <p><b>Why:</b> ${esc(A.ageWhy)} ${c.st.ov.ages?'<i>(your override)</i>':''}</p><p><b>Gender:</b> ${esc(A.gender)}</p>
    <h4 class="h4">Location strategy</h4><table class="kv"><tbody>${locRows.map(r=>`<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>`,
    ins:[`Start with ${ageTxt(g[0])} and test ${ageTxt(g[1])} in a separate ad set so you can compare cost per result.`]};
};
M.budget=c=>{
  const a=c.alloc,ps=[...c.platforms,'test'];
  const rows=ps.map(p=>{const pc=a.pct[p]||0;return `<div class="alr"><span>${p==='test'?'Testing and new ideas':PL[p].name}</span><div class="alt"><i style="width:${pc}%"></i></div><b>${pct(pc)}</b><em>${inr(a.amount[p])}</em></div>`}).join('');
  const thin=c.platforms.filter(p=>a.amount[p]>0&&a.amount[p]<10000);
  const ctrl=`<div class="alin"><span>Manual split (%):</span>${ps.map(p=>`<label>${p==='test'?'Testing':PL[p].short} <input type="number" min="0" max="100" step="1" data-pov="alloc.${p}" value="${Math.round(a.pct[p]||0)}"></label>`).join('')}<button type="button" class="btn btn-line btn-sm" data-pact="resetAlloc">Use recommended</button></div>`;
  const ins=[];if(thin.length)ins.push(`${list(thin.map(pname))} ${thin.length>1?'get':'gets'} under ₹10,000 a month, which is thin for the platform to learn. Consider fewer platforms.`);
  ins.push(`Most of the budget goes to ${c.alloc.stage.slice().sort((x,y)=>y[1]-x[1])[0][0].toLowerCase()}, matching your ${c.obj.label.toLowerCase()} objective.`);
  return{ctrl,body:`<p class="note" style="margin:0 0 10px">Monthly budget ${inr(c.budget)}. ${a.manual?'Your manual split, normalised to 100%.':'Recommended split from platform fit and your objective. Not a fixed rule: change it below.'}</p><div class="alloc">${rows}</div>
    <h4 class="h4">By funnel stage</h4><div class="stg">${a.stage.map(s=>`<div><b>${s[1]}%</b><span>${s[0]}</span><em>${inr(c.budget*s[1]/100)}</em></div>`).join('')}</div>`,ins};
};
M.funnel=c=>{
  const F=D.FUNNELS[c.funnel]||D.FUNNELS.master,T=c.fc.T,vols=!!c.st.ov.vols;
  const val=k=>k==='impr'?T.impr:k==='reach'?T.reach:k==='clicks'?T.clicks:k==='leads'?(c.kind==='lead'?T.leads:NaN):k==='qual'?T.qual:k==='meet'?T.meet:k==='cust'?T.cust:k==='revenue'?T.revenue:k==='net'?T.net:NaN;
  const n=F.length;
  const html=F.map(([l,k],i)=>{const v=k?val(k):NaN,w=100-i*(60/Math.max(1,n-1));
    return `<div class="fnl" style="--w:${w}%"><div class="fnb"><b>${esc(l)}</b><span>${esc(D.STAGE_NOTE[l]||'')}</span>${vols&&isFinite(v)?`<em>${k==='revenue'||k==='net'?inr(v):cnt(v)}</em>`:''}</div></div>`}).join('<div class="fna" aria-hidden="true">↓</div>');
  const pf=c.platforms.map(p=>`<div class="pfl"><b>${PL[p].short}</b><span>${esc(roleOf(c,p))}</span></div>`).join('');
  const ctrl=`<label class="swl"><input type="checkbox" data-pov="vols" ${vols?'checked':''}> Show estimated volumes (projections)</label>`;
  const drop={b2b:'qualified leads and meetings',dealer:'qualified dealers and meetings',ecom:'add to cart and purchase',service:'leads and qualified leads',saas:'trial and paid customer',master:'leads and qualified leads'}[c.funnel]||'leads and customers';
  return{ctrl,body:`<div class="fnlw">${html}</div>${vols?'<p class="note">Volumes are projections from the forecast assumptions, not guaranteed results.</p>':''}${pf?`<h4 class="h4">Each platform’s role</h4><div class="pfls">${pf}</div>`:''}`,
    ins:[`The largest potential drop off is usually between ${drop}. Track this stage weekly.`]};
};
M.phases=c=>{
  const ps=c.platforms,has=p=>ps.includes(p),pick=a=>a.filter(has).map(pname);
  const ph=[
    ['Phase 1: Discovery','Introduce the business and '+c.product,pick(['meta','jiohotstar','tiktok','pinterest','google']),'Educational, problem awareness and short video','Broad cold audience in '+c.loc,'Reach, CPM, video views'],
    ['Phase 2: Awareness','Build familiarity','',"Brand story, product introduction, problem awareness, founder, educational",'Cold audience and video viewers','Frequency, engagement, ad recall'],
    ['Phase 3: Consideration','Build trust',pick(['meta','google','linkedin','pinterest','tiktok']),'Testimonials, reviews, case studies, comparisons, demonstrations, benefits','Engagers, video viewers, site visitors','CTR, landing page views, time on site'],
    ['Phase 4: Conversion','Generate '+(c.kind==='order'?'sales':'leads'),pick(['google','meta','amazon','linkedin','tiktok']),'Offer, product, pricing, demo, consultation and a clear CTA: '+ctaFor(c),'High intent searchers and warm audiences',c.kind==='order'?'CPP, conversion rate, ROAS':'CPL, qualified lead rate, CAC'],
    ['Phase 5: Retargeting','Bring back people who showed interest',pick(['meta','google','linkedin','tiktok','pinterest']),'Reminders, objection handling, reviews, limited offers','Website visitors, video viewers, engagers, product viewers, add to cart, lead form users','Cost per conversion from retargeting']];
  ph[1][2]=ph[0][2];
  if(c.arch.nurture||c.b2bish)ph.push(['Phase 6: Nurture','Turn leads into customers','WhatsApp, email and CRM','Lead → WhatsApp or email → qualification → call → meeting → proposal → follow up → sale','All leads not yet closed','Lead to meeting rate, meeting to sale rate, sales cycle']);
  if(c.arch.repeat||c.funnel==='ecom')ph.push(['Phase 7: Retention','Grow lifetime value','Customer lists on Meta and Google, email, WhatsApp','Customer → repeat purchase → upsell → cross sell → referral','Existing customers','Repeat rate, LTV, referral rate']);
  return{body:`<div class="phs">${ph.map(p=>`<div class="phc"><h4>${p[0]}</h4><table class="kv"><tbody><tr><th>Objective</th><td>${esc(p[1])}</td></tr><tr><th>Platforms</th><td>${esc(Array.isArray(p[2])?(p[2].length?p[2].join(', '):'Your selected platforms'):p[2])}</td></tr><tr><th>Creative</th><td>${esc(p[3])}</td></tr><tr><th>Audience</th><td>${esc(p[4])}</td></tr><tr><th>KPIs</th><td>${esc(p[5])}</td></tr></tbody></table></div>`).join('')}</div>`,
    ins:[c.arch.nurture?'This is a considered purchase: budget for nurture and follow up, not just lead generation.':'Keep conversion and retargeting always on; rotate discovery creatives every 2 to 3 weeks.']};
};
M.creative=c=>{
  const ps=c.platforms.length?c.platforms:['meta'],cta=ctaFor(c);
  const fmt=(p,stage)=>({meta:['Reel','Carousel','Testimonial video','Static offer','Dynamic retargeting'],google:['YouTube video','Responsive search ad','Responsive search ad','Performance Max assets','Display remarketing'],linkedin:['Thought leadership post','Case study document','Lead gen form','Webinar invite','Retargeting case study'],
    jiohotstar:['Video (in stream)','Video (in stream)','Display','Display','Video reminder'],tiktok:['Creator video','UGC review','Product demo','Offer video','Retargeting UGC'],pinterest:['Idea pin','Carousel','Product pin','Shopping pin','Retargeting pin'],amazon:['Sponsored Brands video','Sponsored Products','Sponsored Products','Sponsored Products','Sponsored Display']}[p]||['Video','Carousel','Static','Offer','Reminder'])[stage];
  const stages=[['Cold awareness','Cold audience: '+c.ind.buyer,'Problem the buyer feels','Show the problem in the first 3 seconds, product in use'],['Consideration','Engagers and viewers','Why you: proof and benefits','Real customers, before and after, comparisons'],['Conversion','High intent and warm','The offer and next step','Product close up, price or offer on screen, one CTA'],['Retargeting','Visitors who did not act','Answer the main objection','Reviews, FAQ, guarantee, urgency'],...(c.arch.repeat||c.funnel==='ecom'?[['Customers','Existing customers','Buy again, upgrade, refer','New arrivals, bundles, referral reward']]:[])];
  const rows=[];stages.forEach(([st,aud,msg,vis],i)=>{const plats=i===0?ps.slice(0,2):i===3?ps.filter(p=>p!=='jiohotstar').slice(0,2):ps.slice(0,2);(plats.length?plats:ps.slice(0,1)).forEach((p,j)=>rows.push([st,aud,PL[p].short,fmt(p,Math.min(i,4)),hook(c,i+j),msg,vis,i===0?'Learn more':st==='Customers'?(c.funnel==='ecom'?'Shop again':c.funnel==='dealer'||c.b2bish?'Reorder now':'Refer a friend'):cta]))});
  const types=['Static','Carousel','Reel','UGC','Testimonial','Founder','Product demo','Before and after','Case study','Comparison','Educational','Offer','FAQ'].filter(t=>!(c.b2bish&&['UGC','Before and after'].includes(t))||c.ind.visual);
  return{body:`<div class="tscroll"><table class="fc cm"><thead><tr><th>Stage</th><th>Audience</th><th>Platform</th><th>Format</th><th>Hook</th><th>Main message</th><th>Visual direction</th><th>CTA</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="note">Recommended creative types for this business: ${types.join(', ')}. Hooks are starting points: write 3 to 5 versions of each and let results decide.</p>`,
    ins:[c.b2bish?'Use case studies for warm audiences and problem led creatives for cold audiences.':'Lead with the product in use; the first 3 seconds decide whether anyone watches.']};
};
const CRO=[['headline','Headline states the outcome clearly',12],['cta','One clear CTA, visible without scrolling',12],['offer','A specific offer or reason to act now',10],['trust','Trust signals (ratings, certifications, guarantees)',10],['proof','Proof (testimonials, reviews, case studies, logos)',10],['match','Message matches the ad promise',10],['mobile','Works well on mobile',8],['speed','Loads in under about 3 seconds',8],['form','Short form or one tap contact',8],['objections','Answers the main objections',6],['faq','FAQ section',6]];
M.landing=c=>{
  const t=c.obj.id==='amazon'?'amazon':c.funnel==='ecom'?'ecom':c.funnel==='saas'?'saas':c.ind.arch==='realestate'?'realestate':c.ind.arch==='health'?'health':(c.b2bish||c.funnel==='dealer')?'b2b':['highticket','pro'].includes(c.ind.arch)?'highticket':c.ind.arch==='edu'?'lead':'local';
  const L=D.LP[t],fq=D.FAQ[c.funnel==='dealer'?'dealer':c.ind.arch]||D.FAQ[t]||D.FAQ.local,A=c.arch;
  const content={
    'Hero':`<b>Headline:</b> ${esc(c.b2bish?`${cap(c.product)} your projects can rely on`:`${cap(c.product)} in ${c.loc}, done right`)}<br><b>Subheadline:</b> ${esc(A.angle)}<br><b>CTA:</b> ${esc(L.cta)}<br><b>Trust element:</b> ${esc(L.proof.split(',')[0])}<br><b>Visual:</b> ${esc(c.ind.visual?'Product or finished work, in real settings':'People using the service, or a short explainer video')}`,
    'Problem':esc(list(lc(c.ind.pains))),
    'Solution':esc(`How ${c.product} solves it: one clear paragraph and a short video.`),
    'Benefits':'<ul>'+[A.angle.split(',')[0],'Clear, upfront pricing','Fast response and delivery',c.b2bish?'Consistent quality at volume':'Trusted by customers in '+c.loc,'Support after purchase'].map(b=>`<li>${esc(b)}</li>`).join('')+'</ul>',
    'Product or service':esc('Key options, specifications or packages, with photos. Keep it scannable.'),
    'Proof':esc(L.proof),
    'Process':esc((c.funnel==='ecom'?['Choose','Order','Delivered','Support']:c.b2bish?['Enquire','Requirement call','Quotation','Sample or trial','Order and delivery']:['Contact us','Free consultation','Plan and quote','Delivery or service','Follow up']).join(' → ')),
    'Offer':esc(L.offer),
    'FAQ':'<ul>'+fq.map(q=>`<li>${esc(q)}</li>`).join('')+'</ul>',
    'Final CTA':esc(L.cta+', repeated with the offer and a trust line')};
  const cro=c.st.ov.cro||{},rated=CRO.filter(([k])=>cro[k]),score=CRO.reduce((a,[k,,w])=>a+w*({yes:1,partly:0.5}[cro[k]]||0),0);
  const fixes=CRO.filter(([k])=>cro[k]==='no'||cro[k]==='partly').map(([,l])=>l),unrated=CRO.length-rated.length;
  const ctrl=`<div class="croin"><p class="note" style="margin:0 0 8px">Rate your current landing page to get a CRO score.</p>${CRO.map(([k,l])=>`<label><span>${l}</span><select data-pov="cro.${k}"><option value="">Not checked</option>${[['yes','Yes'],['partly','Partly'],['no','No']].map(o=>`<option value="${o[0]}"${cro[k]===o[0]?' selected':''}>${o[1]}</option>`).join('')}</select></label>`).join('')}</div>`;
  return{ctrl,body:`<p><b>Page type:</b> ${esc(L.label)}</p><div class="lps">${L.sections.map((s,i)=>`<div class="lpsec"><span class="n">${i+1}</span><div><h4>${s}</h4><p>${content[s]||''}</p></div></div>`).join('')}</div>
    ${rated.length?`<div class="cros"><div class="crosc"><b>${Math.round(score)}</b><span>CRO score / 100</span></div><div><h4 class="h4" style="margin-top:0">Improve next</h4><ul class="ticks">${(fixes.length?fixes.slice(0,6):[unrated?'Rate the remaining criteria to complete the score.':'Everything is in place. Test headline and offer variations next.']).map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${unrated?`<p class="note">${unrated} criteria not rated yet count as 0.</p>`:''}</div></div>`:'<p class="note">Rate your current page in the checklist above to get a CRO score out of 100.</p>'}`,
    ins:['The page should match the ad promise immediately above the fold.',...(rated.length===CRO.length&&score<60?['A CRO score under 60 usually costs more than any ad optimisation can save: fix the page first.']:[])]};
};
M.campaigns=c=>{
  const geo=(c.countryKey==='india'?'IN':c.countryKey.slice(0,2).toUpperCase())+'_'+(c.cities[0]||'ALL').replace(/\s+/g,'').slice(0,6).toUpperCase();
  const blocks=c.platforms.map(p=>{const types=campTypes(c,p),amt=c.alloc.amount[p]||0;
    const sets={meta:['Broad (Advantage+ audience)','Interest stack: '+c.ind.interests.slice(0,3).join(', '),'Lookalike 1% of customers','Retargeting: site visitors 30 days and engagers 90 days'],
      google:c.funnel==='ecom'?['Shopping: all products, then best sellers','Search: brand','Search: generic '+c.product,'Remarketing: cart abandoners']:['Brand','Generic: '+c.product,'Local: '+c.product+' in '+(c.cities[0]||c.countryLabel),'Competitor (optional)'],
      linkedin:['ABM: matched company list','Job titles: '+jobTitles(c).slice(0,3).join(', '),'Retargeting: website visitors and video viewers'],
      jiohotstar:['Regional language: '+(c.cities.map(x=>D.CITY_LANG[x]).filter(Boolean)[0]||'Hindi'),'Age '+ageTxt(ages(c)[0]),'Sports and entertainment contexts where available'],
      tiktok:['Broad','Interests: '+c.ind.interests.slice(0,2).join(', '),'Custom: site visitors','Lookalike of purchasers'],
      pinterest:['Keywords: '+c.product,'Interests: '+c.ind.interests.slice(0,2).join(', '),'Retargeting: site visitors'],
      amazon:['Auto targeting','Manual: exact and phrase keywords','Product targeting: competitor ASINs','Brand defence: your brand terms']}[p];
    return `<div class="cmp-b"><h4>${PL[p].name} <span class="sub">${inr(amt)} / month</span></h4><table class="kv"><tbody>
      <tr><th>Campaigns</th><td>${types.map(esc).join('<br>')}</td></tr><tr><th>${p==='google'||p==='amazon'?'Ad groups':'Ad sets'}</th><td>${sets.map(esc).join('<br>')}</td></tr>
      <tr><th>Ads</th><td>${esc(PL[p].formats.slice(0,4).join(', '))}</td></tr><tr><th>Naming</th><td><code>${geo}_${PL[p].short.toUpperCase()}_${c.obj.id.toUpperCase()}_PROSPECTING</code></td></tr></tbody></table></div>`}).join('');
  return{body:blocks?`<div class="cmps">${blocks}</div><p class="note">Start with fewer ad sets and consolidate: splitting a small budget too finely slows learning.</p>`:'<p class="note">No platforms selected.</p>',ins:['Separate prospecting and retargeting campaigns so you can read each one’s cost per result.']};
};
M.forecast=c=>{
  const sc=band(c),T=c.fc.T,mode=c.st.ov.range,E=c.econ,lead=c.kind==='lead';
  const ctrl=`<div class="fcin">
    <div class="seg" role="radiogroup" aria-label="Forecast display"><button type="button" role="radio" data-pact="range" data-v="range" aria-checked="${mode!=='single'}">Range forecast</button><button type="button" role="radio" data-pact="range" data-v="single" aria-checked="${mode==='single'}">Single forecast</button></div>
    <h4 class="h4">Minimum inputs <span class="sub">from the ${esc(E.calc)} calculator, change them for this plan</span></h4>
    <div class="fcg">${[['ticket','AOV / ticket size','₹',E.ticket],['mu','Gross margin','%',E.mu*100],...(lead?[['l2c','Lead to customer rate','%',E.l2c*100],['qual','Qualification rate','%',E.qual*100],['meet','Qualified to meeting rate','%',E.meet*100]]:[])].map(([k,l,u,v])=>`<label>${l}<span class="inp">${u==='₹'?'<span class="u">₹</span>':''}<input type="number" min="0" step="any" data-pov="econ.${k}" value="${Math.round(v*100)/100}">${u==='%'?'<span class="u">%</span>':''}</span></label>`).join('')}
      <label>Other monthly costs<span class="inp"><span class="u">₹</span><input type="number" min="0" step="any" data-pov="fixed" value="${+c.st.ov.fixed||0}"></span></label></div>
    <h4 class="h4">Platform assumptions <span class="sub">starting placeholders for India, not benchmarks</span></h4>
    <div class="tscroll"><table class="fc asm"><thead><tr><th>Platform</th><th>CPM ₹</th><th>CTR %</th><th>${lead?'Click to lead %':'Click to purchase %'}</th><th>Lead quality ×</th></tr></thead><tbody>${c.platforms.map(p=>{const a=assumptions(c,p);
      return `<tr><td>${PL[p].short}</td>${['cpm','ctr','conv','quality'].map(k=>`<td><input type="number" min="0" step="any" data-pov="assume.${p}.${k}" value="${Math.round(a[k]*100)/100}" aria-label="${PL[p].short} ${k}"></td>`).join('')}</tr>`}).join('')}</tbody></table></div>
    ${c.platforms.includes('amazon')?`<h4 class="h4">Amazon economics</h4><div class="fcg">${[['price','Product price','₹'],['cost','Product cost','₹'],['referral','Referral fee','%'],['fba','Fulfilment fee per unit','₹'],['ship','Shipping per unit','₹'],['returns','Returns','%'],['disc','Discounts and coupons','%'],['organic','Organic Amazon revenue a month','₹']].map(([k,l,u])=>`<label>${l}<span class="inp">${u==='₹'?'<span class="u">₹</span>':''}<input type="number" min="0" step="any" data-pov="amz.${k}" value="${(c.st.ov.amz||{})[k]||0}">${u==='%'?'<span class="u">%</span>':''}</span></label>`).join('')}</div>`:''}
    <h4 class="h4">Sensitivity <span class="sub">change each driver and results update instantly</span></h4>
    <div class="sensin">${SENS.map(([k,l])=>{const v=+(c.st.ov.sens||{})[k]||0;return `<label><span>${l} <b data-sv="${k}">${v>0?'+':''}${v}%</b></span><input type="range" min="-50" max="50" step="5" data-pov="sens.${k}" value="${v}"></label>`}).join('')}<button type="button" class="btn btn-line btn-sm" data-pact="resetSens">Reset sensitivity</button></div>
    <p class="note">CAC is a result: move the drivers above to see it change.</p>
    ${benchLib(c)}</div>`;
  const cell=(get,fmt)=>rng(sc,get,fmt,mode);
  const prow=c.fc.rows.map((r,i)=>`<tr><td>${PL[r.p].short}</td><td>${inr(r.spend)}</td><td>${cell(s=>s.rows[i].impr)}</td><td>${cell(s=>s.rows[i].clicks)}</td><td>${inr(r.cpc)}</td><td>${lead&&r.p!=='amazon'?cell(s=>s.rows[i].leads):'n/a'}</td><td>${lead&&r.p!=='amazon'?inr(r.cpl):'n/a'}</td><td>${cell(s=>s.rows[i].cust)}</td><td>${cell(s=>s.rows[i].revenue,inr)}</td><td>${cell(s=>s.rows[i].roas,xx)}</td></tr>`).join('');
  const kv=[['Spend',inr(T.spend)+(T.reserve>0?' (incl. '+inr(T.reserve)+' testing, not forecast)':'')],['Impressions',cell(s=>s.T.impr)],['Reach',cell(s=>s.T.reach)],['Clicks',cell(s=>s.T.clicks)],['CTR',pct(T.ctr)],['CPC',inr(T.cpc)],
    ...(lead?[['Leads',cell(s=>s.T.leads)],['CPL',cell(s=>s.T.cpl,inr)],['Qualified leads',cell(s=>s.T.qual)],['Meetings',cell(s=>s.T.meet)]]:[['Orders',cell(s=>s.T.cust)]]),
    [cap(E.unitP||'customers'),cell(s=>s.T.cust)],['CPA',cell(s=>s.T.cpa,inr)],['CAC',cell(s=>s.T.cac,inr)],['AOV',inr(T.aov)],['Revenue',cell(s=>s.T.revenue,inr)],['Gross profit',cell(s=>s.T.gross,inr)],['Net profit',cell(s=>s.T.net,inr)],
    ['ROAS',cell(s=>s.T.roas,xx)],['Profit ROAS',cell(s=>s.T.profitRoas,xx)],['ROI',cell(s=>s.T.roi,pct)],...(isFinite(T.acos)?[['Amazon ACOS',pct(T.acos)],['Amazon TACOS',pct(T.tacos)]]:[])];
  const scen=`<div class="tscroll"><table class="fc"><thead><tr><th>Projected</th><th>Conservative</th><th>Expected</th><th>Aggressive</th></tr></thead><tbody>${[['Spend',s=>inr(s.T.spend)],['Traffic (clicks)',s=>cnt(s.T.clicks)],...(lead?[['Leads',s=>cnt(s.T.leads)]]:[]),[cap(E.unitP||'customers'),s=>cnt(s.T.cust)],['Revenue',s=>inr(s.T.revenue)],['Profit',s=>inr(s.T.net)],['ROAS',s=>xx(s.T.roas)],['ROI',s=>pct(s.T.roi)]]
    .map(([l,f])=>`<tr><td>${l}</td>${sc.map(s=>`<td>${f(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const ins=[`The projected CAC is highly sensitive to the ${lead?'lead to sale':'click to purchase'} conversion rate: a 10% change moves CAC by roughly 10% the other way.`];
  if(T.roas<T.beRoas)ins.push(`Projected ROAS of ${xx(T.roas)} is below the ${xx(T.beRoas)} needed to cover variable costs.`);
  return{ctrl,body:`<p class="note" style="margin:0 0 10px"><b>Projections, not guaranteed results.</b> Actual results depend on audience, creative, offer, competition, auction conditions and landing page performance. ${mode==='single'?'Showing the expected case.':'Ranges run from conservative to aggressive.'}</p>
    <div class="tscroll"><table class="fc"><thead><tr><th>Platform</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>CPC</th><th>Leads</th><th>CPL</th><th>${esc(cap(E.unitP||'customers'))}</th><th>Revenue</th><th>ROAS</th></tr></thead><tbody>${prow}</tbody></table></div>
    <h4 class="h4">Plan totals</h4><div class="more">${kv.map(([l,v])=>`<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <p class="note">ROAS = revenue ÷ ad spend. Profit ROAS = net profit ÷ ad spend. ROI = net profit ÷ total investment × 100.${isFinite(T.acos)?' ACOS = Amazon ad spend ÷ attributed revenue × 100. TACOS = Amazon ad spend ÷ total Amazon revenue × 100.':''}</p>
    <h4 class="h4">Scenario planner (projected)</h4>${scen}`,ins};
};
function benchLib(c){
  const lib=benchRows();
  return `<details class="grp blib"><summary><span>Benchmark library</span><b>${lib.length} saved</b></summary><div class="gbody">
    <p class="note" style="margin:0 0 8px">Save assumptions with their source so the next plan can reuse them. Nothing here is universal: record the industry, market, platform, objective and where the numbers came from.</p>
    <div class="fcg"><label>Source<span class="inp"><input type="text" data-pbs="source" placeholder="For example: our Meta account, Jan to Mar"></span></label><label>Notes<span class="inp"><input type="text" data-pbs="notes" placeholder="Optional"></span></label></div>
    <button type="button" class="btn btn-line btn-sm" data-pact="benchSave">Save current platform assumptions</button>
    ${lib.length?`<div class="tscroll"><table class="fc"><thead><tr><th>Industry</th><th>Country</th><th>Platform</th><th>Objective</th><th>CPM</th><th>CTR</th><th>CPC</th><th>CPL</th><th>Conv.</th><th>CAC</th><th>AOV</th><th>Updated</th><th>Source</th><th></th></tr></thead><tbody>${lib.map((b,i)=>`<tr><td>${esc(b.industry)}</td><td>${esc(b.country)}</td><td>${esc(b.platform)}</td><td>${esc(b.objective)}</td><td>${inr(b.cpm)}</td><td>${pct(b.ctr)}</td><td>${inr(b.cpc)}</td><td>${inr(b.cpl)}</td><td>${pct(b.conv)}</td><td>${inr(b.cac)}</td><td>${inr(b.aov)}</td><td>${esc(b.date)}</td><td>${esc(b.source)}${b.notes?'<br><small>'+esc(b.notes)+'</small>':''}</td><td><button type="button" class="btn btn-line btn-sm" data-pact="benchUse" data-i="${i}">Use</button> <button type="button" class="cdel" data-pact="benchDel" data-i="${i}" aria-label="Delete">×</button></td></tr>`).join('')}</tbody></table></div>`:''}
  </div></details>`;
}
function benchRows(){let a=[];try{a=JSON.parse(localStorage.getItem('mabc:benchlib')||'[]')}catch(e){}const B=globalThis.MABC_BENCH;return[...((B&&B.rows)||[]),...(Array.isArray(a)?a:[])]}
M.profit=c=>{
  const T=c.fc.T,lead=c.kind==='lead';
  let best=[1,T.net];for(let i=0;i<=60;i++){const k=Math.pow(10,-1.5+i*0.05),n=netInfl(c,k);if(n>best[1])best=[k,n]}
  const hi=best[1]>0?findRoot(c,best[0]):null;
  const rows=[['Revenue',inr(T.revenue)],['Variable costs',inr(T.vc)],['Gross profit',inr(T.gross)],['Ad spend',inr(T.spend)],['Other costs',inr(T.fixed)],['Net profit',inr(T.net)],['CAC',inr(T.cac)],
    ['Breakeven ROAS',isFinite(T.beRoas)?xx(T.beRoas):'not reachable'],...(lead?[['Breakeven CPL',inr(T.beCpl)]]:[]),['Breakeven CAC',inr(T.beCac)],
    ['Maximum profitable ad spend',best[1]<=0?'None at these economics':hi===Infinity?'No ceiling found up to 30× this budget':'About '+inr(c.budget*hi)+' a month'],['Most profit near',best[1]>0?inr(c.budget*best[0])+' a month ('+inr(best[1])+')':'n/a']];
  const per=c.fc.rows.map(r=>`<tr><td>${PL[r.p].short}</td><td>${inr(r.revenue)}</td><td>${inr(r.gross)}</td><td>${inr(r.spend)}</td><td class="${r.net>=0?'good':'bad'}">${inr(r.net)}</td></tr>`).join('');
  const ins=[T.net>=0?`Projected net profit is ${inr(T.net)} a month on ${inr(T.spend)} of spend.`:`At these assumptions the plan loses ${inr(-T.net)} a month: improve conversion, ticket size or margin before scaling.`];
  return{body:`<div class="more">${rows.map(([l,v])=>`<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="tscroll"><table class="fc"><thead><tr><th>Platform</th><th>Revenue</th><th>Gross profit</th><th>Spend</th><th>Profit after ads</th></tr></thead><tbody>${per}</tbody></table></div>
    <p class="note">Projections. Maximum profitable spend assumes costs per result rise about 10% each time the budget doubles.</p>`,ins};
};
function scaleAlloc(c,k){return Object.assign({},c.alloc,{amount:Object.fromEntries(Object.entries(c.alloc.amount).map(([p,a])=>[p,a*k]))})}
function netInfl(c,k){const infl=k>1?1+0.1*Math.log2(k):1,ov=Object.assign({},c.st.ov,{sens:Object.assign({},c.st.ov.sens,{cpm:((1+(+(c.st.ov.sens||{}).cpm||0)/100)*infl-1)*100})});
  const cc=Object.assign({},c,{st:Object.assign({},c.st,{ov}),alloc:scaleAlloc(c,k)});return forecast(cc).T.net}
function findRoot(c,from){let a=from,b=from;for(let i=0;i<12&&netInfl(c,b)>=0;i++)b*=2;if(netInfl(c,b)>=0)return Infinity;for(let i=0;i<40;i++){const m=(a+b)/2;netInfl(c,m)>=0?a=m:b=m}return a}
M.plan90=c=>{
  const ps=c.platforms.map(pname),P=list(ps)||'your platforms',sel=c.st.modules;
  const W=[
    ['Month 1: Test',[['Week 1','Set up tracking, pixels and conversion events. Build audiences: '+(sel.includes('audience')?'use the personas in this plan':'primary and secondary personas')+'.'],['Week 2','Launch on '+P+' with 3 to 5 creatives per stage and 2 audiences each.'+(sel.includes('landing')?' Publish the landing page from this plan.':'')],['Week 3','Test offers and landing page headline. Pause clear losers after enough spend.'],['Week 4','Review CPM, CTR, CPC and '+(c.kind==='lead'?'CPL':'CPP')+' by platform, audience and creative.']]],
    ['Month 2: Optimise',[['Week 5','Improve CTR with new hooks on the best performing format.'],['Week 6','Lower CPC and '+(c.kind==='lead'?'CPL':'CPP')+': consolidate ad sets, narrow to winning audiences.'],['Week 7','Improve conversion: fix landing page friction, speed and form length.'],['Week 8','Work on CAC: '+(c.kind==='lead'?'faster lead follow up and better qualification':'checkout and offer tests')+'.']]],
    ['Month 3: Scale',[['Week 9','Scale winning audiences and creatives by about 20% every few days.'],['Week 10','Shift budget to the winning platform and geography.'],['Week 11','Expand to lookalikes and the expansion age group; refresh creatives.'],['Week 12','Scale the winning offer; add retention or referral campaigns.'],['Week 13','Review the quarter against the forecast and set next quarter’s targets.']]]];
  return{body:`<div class="p90">${W.map(([m,ws])=>`<div class="p90m"><h4>${m}</h4><table class="kv"><tbody>${ws.map(w=>`<tr><th>${w[0]}</th><td>${esc(w[1])}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`,ins:['Judge platforms on at least 2 to 3 weeks of data before cutting them.']};
};
M.tracking=c=>{
  const ev=c.kind==='order'?[['Page View','PageView','page_view'],['View Content','ViewContent','view_item'],['Add to Cart','AddToCart','add_to_cart'],['Checkout','InitiateCheckout','begin_checkout'],['Purchase','Purchase','purchase']]
    :[['Page View','PageView','page_view'],['View Content','ViewContent','view_item'],['Lead','Lead','generate_lead'],['Contact','Contact','contact (custom)'],['WhatsApp click','Contact','whatsapp_click (custom)'],...(['demo','bookings','consultation'].includes(c.obj.id)||c.b2bish?[['Demo or booking','Schedule','book_appointment (custom)']]:[])];
  const tags=c.platforms.map(p=>`<div class="tgt-b"><h4>${PL[p].name}</h4><ul class="ticks">${PL[p].tags.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`).join('');
  return{body:`<div class="tgts">${tags}<div class="tgt-b"><h4>Everywhere</h4><ul class="ticks"><li>Google Tag Manager to manage tags</li><li>GA4 for cross platform analytics</li><li>UTM tags on every ad: source, medium, campaign, content</li><li>CRM or sheet to record lead quality and sales</li></ul></div></div>
    <h4 class="h4">Events to track</h4><div class="tscroll"><table class="fc"><thead><tr><th>Event</th><th>Meta standard event</th><th>GA4 event</th></tr></thead><tbody>${ev.map(e=>`<tr><td>${e[0]}</td><td>${e[1]}</td><td>${e[2]}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">Send the same events server side where possible (Conversions API, Events API) so ad blockers and browser limits lose fewer conversions. Check each platform’s current event names before setup.</p>`,
    ins:[c.kind==='lead'?'Pass lead quality back to the platforms (qualified, sale) so they optimise for customers, not just form fills.':'Track purchase value, not just purchases, so ROAS bidding works.']};
};
M.custom=c=>{
  const txt=String(c.st.custom||'').trim(),low=txt.toLowerCase();
  const th=D.THEMES.filter(t=>t.k.some(k=>low.includes(k)));
  const ctrl=`<label class="ctxt"><span>Describe what you want</span><textarea data-pf="custom" rows="3" placeholder="For example: I want a dealer acquisition strategy for a door manufacturer">${esc(txt)}</textarea></label>`;
  if(!txt)return{ctrl,body:'<p class="note">Describe what you want above and the strategy appears here.</p>',ins:[]};
  const t=th[0];
  const base=t||{name:'Custom strategy',objective:c.obj.label+' for '+c.product,audience:c.ind.buyer,platforms:c.platforms,funnel:(D.FUNNELS[c.funnel]||D.FUNNELS.master).map(x=>x[0]).join(' → '),creative:[hook(c,0),hook(c,1),hook(c,2)],offer:D.LP[c.b2bish?'b2b':'lead'].offer,kpi:[c.kind==='lead'?'CPL':'CPP','Qualified rate','CAC','ROAS']};
  const plats=base.platforms.filter(p=>c.evals[p]&&c.evals[p].status!=='excluded');
  return{ctrl,body:`<p class="note" style="margin:0 0 10px">Built from ${t?'the "'+esc(t.name.toLowerCase())+'" playbook matched to your description':'your business inputs (no specific playbook matched your words)'} and your ${esc(c.ind.label.toLowerCase())} context. Rule based, not AI written.</p>
    <table class="kv"><tbody>${[['Your request',txt],['Strategy',base.name],['Objective',base.objective],['Audience',base.audience],['Platforms',plats.map(pname).join(', ')||'Meta'],['Funnel',base.funnel],['Creatives',base.creative.join('; ')],['Offer',base.offer],['KPIs',base.kpi.join(', ')],
      ['First 30 days','Set up tracking and audiences, launch the offer with 3 creatives on '+(plats.map(pname)[0]||'Meta')+', measure '+base.kpi[0].charAt(0).toLowerCase()+base.kpi[0].slice(1)],['Days 31 to 60','Keep the best creative and audience, add retargeting and follow up'],['Days 61 to 90','Scale what works, add the next platform, report against the KPIs']].map(r=>`<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>
    ${th.length>1?`<p class="note">Also relevant: ${th.slice(1).map(x=>esc(x.name)).join(', ')}.</p>`:''}`,ins:t?[`Your request matches the ${t.name.toLowerCase()} playbook; KPIs to watch first: ${t.kpi.slice(0,2).join(' and ')}.`]:[]};
};

/* ---------- plan assembly ---------- */
function selected(st){return MOD_ORDER.filter(m=>(st||S).modules.includes(m))}
function buildPlan(st,forReport){
  const c=context(st),mods=selected(c.st);
  const secs=mods.map(id=>{const r=M[id](c);return{id,title:MOD[id].name,ctrl:r.ctrl||'',body:r.body,ins:r.ins||[]}});
  return{c,secs};
}
function overview(c){
  return `<table class="kv ov"><tbody>${[['Industry',c.ind.label],['Business model',c.modelLabel],['Market',c.countryLabel+(c.cities.length?' · '+list(c.cities):'')],['Product or service',c.product],['Objective',c.obj.label],['Monthly budget',inr(c.budget)],['Platforms',c.platforms.map(p=>PL[p].name).join(', ')||'None']].map(r=>`<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>`;
}
function reportBody(){
  const {c,secs}=buildPlan(S,true),full=MOD_ORDER.filter(m=>m!=='custom').every(m=>S.modules.includes(m));
  const date=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  const ins=secs.flatMap(s=>s.ins);
  return `<header><p class="rk">Marketing plan · Get Bee Seen</p><h1>${esc(full?'Full marketing plan':'Marketing plan')}: ${esc(c.ind.label)}</h1><p>${date}</p></header>
    <section><h2>Business overview</h2>${overview(c)}</section>
    ${secs.map((s,i)=>`<section><h2>${i+1}. ${esc(s.title)}</h2>${s.body}</section>`).join('')}
    ${ins.length?`<section><h2>Insights</h2><ul>${ins.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section>`:''}
    <footer><p><b>These are strategic recommendations and projections, not guaranteed outcomes.</b> Starting assumptions are placeholders, not benchmarks. Platform features, availability and costs change: verify before launch.</p></footer>`;
}

/* ---------- UI ---------- */
const STEPS=['Business','Objective','Platforms','Select modules','Generate plan'];
const ICON=n=>`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(globalThis.MABC_ICONS||{})[n]||''}</svg>`;
let root=null;
function render(){
  root=document.getElementById('planner-root');if(!root)return;
  const c=context();
  const prog=`<ol class="pprog">${STEPS.map((s,i)=>`<li class="${S.step===i+1?'on':''} ${i+1<=S.reached?'done':''}"><button type="button" data-pstep="${i+1}" ${i+1>S.reached?'disabled':''}><span>${i+1}</span><em class="pl">${s}</em></button></li>`).join('')}</ol>`;
  root.innerHTML=prog+`<div class="pstep">${[s1,s2,s3,s4,s5][S.step-1](c)}</div>`;
}
const sel=(k,opts,val,lab)=>`<label class="pfield"><span>${lab}</span><select data-pf="${k}" class="osel">${opts.map(o=>`<option value="${o[0]}"${o[0]===val?' selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`;
const txt=(k,val,lab,ph)=>`<label class="pfield"><span>${lab}</span><span class="inp"><input type="text" data-pf="${k}" value="${esc(val)}" placeholder="${esc(ph||'')}" maxlength="80"></span></label>`;
const nav=(back,next,label)=>`<div class="pnav">${back?`<button type="button" class="btn btn-line" data-pstep="${back}">Back</button>`:''}${next?`<button type="button" class="btn btn-green" data-pgo="${next}">${label||'Continue'}</button>`:''}</div>`;
function s1(c){
  return `<div class="panel"><h3>1. Your business</h3><div class="pgrid">
    ${sel('industry',[['','Choose your industry'],...D.INDUSTRIES.map(i=>[i.id,i.label])],S.industry,'Industry')}
    ${sel('model',[['','Suggested: '+(D.BMODELS.find(m=>m[0]===c.ind.model)||['',''])[1]],...D.BMODELS],S.model,'Business model')}
    ${sel('country',Object.entries(D.COUNTRIES).map(([k,v])=>[k,v.label]),S.country,'Country or market')}
    ${S.country==='other'?txt('countryName',S.countryName,'Country name','Your market'):''}
    ${txt('cities',S.cities,'Cities or regions (comma separated)','For example Bengaluru, Mysuru')}
    ${txt('product',S.product,'Product or service',c.ind.noun)}
  </div>${S.industry&&c.ind.calc&&APP()&&APP().MODELS[c.ind.calc]?`<p class="note">Forecasts use the economics from the <button type="button" class="linkbtn" data-pact="openCalc">${esc(APP().MODELS[c.ind.calc].name)} calculator</button>. Enter your numbers there for a sharper plan.</p>`:''}
  ${nav(0,2)}</div>`;
}
function s2(){
  return `<div class="panel"><h3>2. Objective and budget</h3><div class="objs" role="radiogroup" aria-label="Marketing objective">${D.OBJECTIVES.map(o=>`<button type="button" role="radio" class="chip" data-pobj="${o[0]}" aria-checked="${S.objective===o[0]}" aria-pressed="${S.objective===o[0]}">${o[1]}</button>`).join('')}</div>
    <div class="pgrid" style="margin-top:14px"><label class="pfield"><span>Monthly ad budget (all platforms)</span><span class="inp"><span class="u">₹</span><input type="number" min="0" step="1000" data-pf="budget" value="${S.budget}"></span></label></div>
    ${nav(1,3)}</div>`;
}
function s3(c){
  const auto=S.pmode==='auto';
  const cards=PO.map(p=>{const e=c.evals[p],on=auto?c.platforms.includes(p):S.platforms.includes(p);
    return `<button type="button" class="pcard${e.status==='excluded'?' ex':''}" role="checkbox" aria-checked="${on}" data-pplat="${p}" ${auto||e.status==='excluded'?'disabled':''}><span class="ck" aria-hidden="true">✓</span><b>${PL[p].name}</b><span class="fit${e.status==='excluded'?' bad':''}">${e.status==='excluded'?'Not available':fitLabel(e.score)+(e.status==='verify'?' · verify':'')}</span><small>${esc(e.status==='excluded'?e.cautions[0]:(e.reasons[0]||e.cautions[0]||''))}</small></button>`}).join('');
  const amzQ=`<div class="amzq"><span>Are your products listed on Amazon?</span><div class="seg" role="radiogroup" aria-label="Listed on Amazon">${[['yes','Yes'],['no','No']].map(o=>`<button type="button" role="radio" data-pact="amz" data-v="${o[0]}" aria-checked="${S.amazonListed===o[0]}">${o[1]}</button>`).join('')}</div></div>`;
  return `<div class="panel"><h3>3. Which platforms do you want to consider?</h3>
    <div class="seg" role="radiogroup" aria-label="Platform mode" style="margin-bottom:12px"><button type="button" role="radio" data-pact="pmode" data-v="auto" aria-checked="${auto}">Auto recommend</button><button type="button" role="radio" data-pact="pmode" data-v="manual" aria-checked="${!auto}">Manual selection</button></div>
    <p class="note" style="margin:0 0 12px">${auto?'Platforms are chosen from your industry, market, objective and budget. Switch to manual to pick your own.':'Pick the platforms to include. Platforms that do not apply to your market or setup are locked.'}</p>
    ${amzQ}<div class="pcards">${cards}</div>${nav(2,4)}</div>`;
}
function s4(c){
  const all=MOD_ORDER.filter(m=>m!=='custom'),full=all.every(m=>S.modules.includes(m));
  const cards=MOD_ORDER.map(m=>{const d=MOD[m],on=S.modules.includes(m);return `<button type="button" class="mcard" role="checkbox" aria-checked="${on}" data-pmod="${m}"><span class="mi">${ICON(d.icon)}</span><span class="ck" aria-hidden="true">✓</span><b>${d.name}</b><small>${d.desc}</small></button>`}).join('');
  return `<div class="panel"><h3>4. What do you want to build?</h3>
    <div class="mtools"><button type="button" class="mcard full" role="checkbox" aria-checked="${full}" data-pact="full"><span class="mi">${ICON('sparkle')}</span><span class="ck" aria-hidden="true">✓</span><b>Full marketing plan</b><small>Every module, in one plan</small></button>
      <div class="mbtns"><button type="button" class="btn btn-line btn-sm" data-pact="selAll">Select all</button><button type="button" class="btn btn-line btn-sm" data-pact="clear">Clear all</button><span class="sub">${S.modules.length} selected</span></div></div>
    <div class="mcards">${cards}</div>
    ${S.modules.includes('custom')?`<label class="ctxt"><span>Custom module: describe what you want</span><textarea data-pf="custom" rows="3" placeholder="For example: I want a dealer acquisition strategy for a door manufacturer">${esc(S.custom)}</textarea></label>`:''}
    ${needs(c)}
    ${nav(3,S.modules.length?5:0,'Generate plan')}${S.modules.length?'':'<p class="note">Select at least one module.</p>'}</div>`;
}
function needs(c){
  const m=S.modules,ask=[];
  if((m.includes('forecast')||m.includes('profit'))&&!(c.budget>0))ask.push('a monthly ad budget (step 2)');
  if((m.includes('forecast')||m.includes('profit'))&&!(c.econ.ticket>0))ask.push('your AOV or ticket size (in the forecast inputs)');
  if(S.pmode==='manual'&&!c.platforms.length&&m.some(x=>['platforms','budget','campaigns','forecast','profit','tracking'].includes(x)))ask.push('at least one available platform (step 3)');
  return ask.length?`<p class="warnbox">To build these modules the planner still needs ${list(ask)}.</p>`:'';
}
function s5(c){
  const {secs}=buildPlan(S);
  if(!secs.length)return `<div class="panel"><p>No modules selected.</p>${nav(4,0)}</div>`;
  const ins=secs.flatMap(s=>s.ins);
  return `<div class="pplan"><div class="pbar"><b>Marketing plan</b><nav aria-label="Plan sections">${secs.map(s=>`<a href="#pm-${s.id}">${esc(MOD[s.id].name)}</a>`).join('')}${ins.length?'<a href="#pm-insights">Insights</a>':''}</nav>
    <span class="pbtns"><button type="button" class="btn btn-line btn-sm" data-pstep="4">Edit modules</button><button type="button" class="btn btn-green btn-sm" data-pact="report">Generate report</button></span></div>
    <div class="panel"><h3>Plan summary</h3>${overview(c)}<p class="note">Strategic recommendations and projections, not guaranteed outcomes.</p></div>
    ${secs.map(s=>`<section class="panel psec" id="pm-${s.id}"><h3>${esc(s.title)}</h3>${s.ctrl?`<div class="pctrl">${s.ctrl}</div>`:''}<div data-pbody="${s.id}">${s.body}</div></section>`).join('')}
    ${ins.length?`<section class="panel" id="pm-insights"><h3>Insights</h3><ul class="ins" data-pbody="insights">${ins.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section>`:''}
    <div class="pnav"><button type="button" class="btn btn-line" data-pstep="4">Add or remove modules</button><button type="button" class="btn btn-green" data-pact="report">Generate report</button></div></div>`;
}
/* re-render only the output bodies (keeps focus in the controls) */
function refreshBodies(){
  if(!root||S.step!==5)return;
  const {secs}=buildPlan(S);
  secs.forEach(s=>{const el=root.querySelector(`[data-pbody="${s.id}"]`);if(el)el.innerHTML=s.body});
  const ie=root.querySelector('[data-pbody="insights"]');if(ie)ie.innerHTML=secs.flatMap(s=>s.ins).map(t=>`<li>${esc(t)}</li>`).join('');
}
function setPath(obj,path,val){const k=path.split('.');let o=obj;for(let i=0;i<k.length-1;i++){if(o[k[i]]==null||typeof o[k[i]]!=='object')o[k[i]]=/^\d+$/.test(k[i+1])?[]:{};o=o[k[i]]}o[k[k.length-1]]=val}
function bind(){
  const host=document.getElementById('planner-root');if(!host||host._b)return;host._b=1;
  host.addEventListener('click',e=>{
    const t=e.target.closest('[data-pstep],[data-pgo],[data-pobj],[data-pplat],[data-pmod],[data-pact]');if(!t||t.disabled)return;
    if(t.dataset.pstep){S.step=+t.dataset.pstep;save();render();host.scrollIntoView({block:'start',behavior:APP()&&APP().RM.matches?'auto':'smooth'});return}
    if(t.dataset.pgo){const n=+t.dataset.pgo;if(n===2&&!S.industry){toast('Choose your industry first');return}S.step=n;S.reached=Math.max(S.reached,n);save();render();host.scrollIntoView({block:'start'});return}
    if(t.dataset.pobj){S.objective=t.dataset.pobj;save();render();return}
    if(t.dataset.pplat){const p=t.dataset.pplat,i=S.platforms.indexOf(p);if(i>-1)S.platforms.splice(i,1);else S.platforms.push(p);save();render();return}
    if(t.dataset.pmod){const m=t.dataset.pmod,i=S.modules.indexOf(m);if(i>-1)S.modules.splice(i,1);else S.modules.push(m);save();render();return}
    const a=t.dataset.pact,c0=()=>context();
    if(a==='selAll'){S.modules=MOD_ORDER.slice();}
    else if(a==='clear'){S.modules=[];}
    else if(a==='full'){const all=MOD_ORDER.filter(m=>m!=='custom');S.modules=all.every(m=>S.modules.includes(m))?S.modules.filter(m=>m==='custom'):Array.from(new Set([...S.modules,...all]));}
    else if(a==='pmode'){S.pmode=t.dataset.v;if(S.pmode==='manual'&&!S.platforms.length)S.platforms=c0().platforms.slice()}
    else if(a==='amz'){S.amazonListed=t.dataset.v;if(t.dataset.v==='yes'&&S.pmode==='manual'&&!S.platforms.includes('amazon'))S.platforms.push('amazon')}
    else if(a==='range'){S.ov.range=t.dataset.v}
    else if(a==='resetAges'){S.ov.ages=null}
    else if(a==='resetAlloc'){S.ov.alloc=null}
    else if(a==='resetSens'){S.ov.sens={}}
    else if(a==='openCalc'){const k=c0().ind.calc;if(APP())APP().openCalculator(k);return}
    else if(a==='report'){if(APP())APP().showReport(reportBody(),'Marketing plan','marketing-plan-'+c0().ind.label.toLowerCase().replace(/[^a-z0-9]+/g,'_'),'[data-pact="report"]');return}
    else if(a==='benchSave'){const c=c0(),src=(host.querySelector('[data-pbs="source"]')||{}).value||'My planning assumption',notes=(host.querySelector('[data-pbs="notes"]')||{}).value||'';
      let lib=[];try{lib=JSON.parse(localStorage.getItem('mabc:benchlib')||'[]')}catch(err){}
      c.fc.rows.forEach(r=>lib.push({industry:c.ind.label,country:c.countryLabel,platform:PL[r.p].short,p:r.p,objective:c.obj.label,cpm:r.a.cpm,ctr:r.a.ctr,cpc:r.cpc,cpl:r.cpl,conv:r.a.conv,cac:r.cpa,aov:c.fc.T.aov,date:new Date().toISOString().slice(0,10),source:src,notes}));
      try{localStorage.setItem('mabc:benchlib',JSON.stringify(lib))}catch(err){}toast('Saved to the benchmark library')}
    else if(a==='benchDel'){let lib=[];try{lib=JSON.parse(localStorage.getItem('mabc:benchlib')||'[]')}catch(err){}const off=((globalThis.MABC_BENCH||{}).rows||[]).length;lib.splice(+t.dataset.i-off,1);try{localStorage.setItem('mabc:benchlib',JSON.stringify(lib))}catch(err){}}
    else if(a==='benchUse'){const b=benchRows()[+t.dataset.i];if(b&&b.p){S.ov.assume=S.ov.assume||{};S.ov.assume[b.p]={cpm:b.cpm,ctr:b.ctr,conv:b.conv}}toast('Loaded into the '+(b?b.platform:'')+' assumptions')}
    else return;
    save();render();
  });
  const onField=(e,live)=>{
    const t=e.target;
    if(t.dataset.pf){const k=t.dataset.pf;if(k==='budget')S.budget=Math.max(0,parseFloat(t.value)||0);else S[k]=t.value;
      if(k==='industry'){S.model='';S.ov.econ={};S.ov.ages=null}
      save();if(t.tagName==='SELECT'||(!live&&k!=='custom'))render();else if(S.step===5)refreshBodies();return}
    if(t.dataset.pov){const path=t.dataset.pov;let v=t.type==='checkbox'?(t.checked?1:0):t.tagName==='SELECT'?t.value:parseFloat(t.value);
      if(t.tagName!=='SELECT'&&t.type!=='checkbox'){if(!isFinite(v))return;v=Math.max(t.type==='range'?-50:0,v);if(/^(econ\.(mu|l2c|qual|meet)|alloc\.|amz\.(referral|returns|disc))/.test(path)&&v>100){v=100;t.value=100}}
      if(path.startsWith('ages.')&&!S.ov.ages)S.ov.ages=JSON.parse(JSON.stringify(context().arch.age));
      if(path.startsWith('alloc.')&&!S.ov.alloc){const a=context().alloc;S.ov.alloc=Object.assign({},a.pct)}
      setPath(S.ov,path,v);
      const sv=t.dataset.pov.startsWith('sens.')&&root.querySelector(`[data-sv="${path.slice(5)}"]`);if(sv)sv.textContent=(v>0?'+':'')+v+'%';
      save();refreshBodies();}
  };
  host.addEventListener('input',e=>onField(e,true));
  host.addEventListener('change',e=>onField(e,false));
}
function toast(m){const a=APP();if(a)a.toast(m)}

if(typeof document!=='undefined'&&document.getElementById&&document.getElementById('planner-root')){bind();render()}
globalThis.MABC_PLANNER={context,buildPlan,evaluate,allocate,forecast,reportBody,M,MOD_ORDER,setState:s=>{S=Object.assign(DEF(),s,{ov:Object.assign(DEF().ov,(s||{}).ov||{})})},getState:()=>S,render};
})();
