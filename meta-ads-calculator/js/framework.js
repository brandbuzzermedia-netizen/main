/* Industry framework.
   Turns an industry definition (js/industries.js) into a calculator model for app.js.
   The framework owns what must behave the same everywhere: universal Meta Ads inputs, forecast and manual
   ad maths, the funnel, ROAS / profit ROAS / ROI, breakeven, likely ranges, scenario planner, goal calculator,
   insights, sensitivity, benchmarks and validation.
   Each industry owns its economics: its own inputs, funnel stages, revenue model and cost lines (econ).

   Industry definition:
     key, name, cat, flow (card funnel text), desc, icon
     kind       'lead' (CPL based) or 'order' (CPP based), or a function of v
     unit/unitP what a customer is called ('client', 'patients'...)
     ad         starting ad assumptions {spend, cpm, ctr, lpConv}
     stages     [{id, l: stage label, r: rate label, def, help}] or function(v) returning a subset of stageDefs
     fields     industry inputs (F / O); flag price or value inputs with v:1 and Simple mode inputs with simple:1
     econ(v, c, n) -> {revenue, lines:[[label, amount]], ltv?, ltvRevenue?, extras:[[label,text]], card?, warn?:[], note?}
                c = customers (last stage), n = {leads, clicks, counts}. lines are the variable costs of those sales. */
(function(){
'use strict';
globalThis.MABC_MODULES=globalThis.MABC_MODULES||[];
globalThis.MABC_FRAMEWORK=function(E){
const {F,DROP,inr,num,pct,xx,div,P,cnt}=E;
const O=(id,label,type,options,def,group,help,x)=>Object.assign({kind:'opt',id,label,type,options,def,group,help},x||{});
const X=(f,x)=>Object.assign(f,x);
const C=(id,label,unit,def,group,help,x)=>X(F(id,label,unit,def,0,1e9,unit==='%'?0.5:1,group,help||''),Object.assign({c:1},x||{}));
const MK=()=>E.market;
const LOCS=['Bengaluru','Karnataka','Chennai','Hyderabad','Mumbai','Pune','Delhi NCR','Kerala','Tamil Nadu','Telangana','Maharashtra','Pan India','Custom'];
const OBJ_LEAD=[['leads','Lead generation (instant forms)'],['messages','WhatsApp / Messenger enquiries'],['calls','Calls'],['website','Website leads'],['traffic','Traffic']];
const OBJ_ORDER=[['sales','Sales (purchases)'],['catalog','Catalogue / Advantage+ shopping'],['traffic','Traffic'],['messages','WhatsApp orders']];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const adv=v=>v.mode!=='simple';
const G={setup:'Campaign setup',ad:'Ad delivery',fun:'Sales funnel',eco:'Business economics',cost:'Costs'};
const locLabel=v=>MK()?MK().locLabel(v.loc,v.locName):[].concat(v.loc).join(', ');
const rngC=n=>!isFinite(n)?'n/a':n<=0?'0':n<1?'under 1':new Intl.NumberFormat('en-IN').format(Math.round(n));

function build(spec){
  const kindOf=v=>typeof spec.kind==='function'?spec.kind(v):spec.kind;
  const ad=Object.assign({spend:50000,cpm:180,ctr:1,lpConv:8,freq:2.5,cpl:300},spec.ad||{});
  const stageDefs=spec.stageDefs||spec.stages;
  const stagesOf=v=>(typeof spec.stages==='function'?spec.stages(v):spec.stages).map(s=>Object.assign({get:v=>v[s.id],set:(v,x)=>{v[s.id]=x}},s));
  const isLead=v=>kindOf(v)==='lead';
  const leadWord=v=>isLead(v)?'leads':'orders';
  const costWord=v=>isLead(v)?'CPL':'CPP';
  const stageFields=spec.custom?[]:stageDefs.map(s=>X(F(s.id,s.r,'%',s.def,0.5,100,0.5,G.fun,s.help||''),{simple:1,rate:1,show:s.show}));
  /* order follows the product principle: business economics and costs first, then ad economics, then the funnel */
  const fields=[
    O('mode','Detail level','seg',[['simple','Simple'],['advanced','Advanced']],'simple',G.setup,'',{show:()=>false}),
    ...(spec.pre||[]),
    ...spec.fields,
    X(F('spend','Monthly ad budget','₹',ad.spend,1000,5000000,1000,G.setup,'What you plan to spend on Meta Ads each month.'),{simple:1}),
    X(F('daily','Daily ad budget','₹',Math.round(ad.spend/30.4),30,200000,10,G.setup,'Linked to the monthly budget (30.4 days a month).'),{show:adv}),
    X(F('months','Campaign duration','months',3,1,36,1,G.setup,'Used for campaign totals in the report.'),{show:adv}),
    O('loc','Locations','chips',LOCS.map(l=>[l,l]),['Bengaluru'],G.setup,'Pick every area you target. The starting CPM is the average of their typical CPMs. Edit it in Advanced mode.',{simple:1}),
    O('locName','Custom location name','text',null,'',G.setup,'',{simple:1,show:v=>v.loc.includes('Custom')}),
    O('audience','Target audience','text',null,spec.audience||'',G.setup,'',{show:adv}),
    O('objective','Campaign objective','select',spec.objectives||(kindOf({})==='lead'?OBJ_LEAD:OBJ_ORDER),(spec.objectives||(kindOf({})==='lead'?OBJ_LEAD:OBJ_ORDER))[0][0],G.setup,'Recorded in the report. Adjust CTR and conversion to match it.',{show:adv}),
    O('amode','How do you want to enter ad costs?','seg',[['forecast','Forecast mode'],['manual','Manual mode']],'forecast',G.ad,'Forecast estimates results from CPM, CTR and conversion. Manual uses a cost per lead or purchase you already know.',{show:adv}),
    X(F('cpm','CPM (cost per 1,000 impressions)','₹',ad.cpm,20,2000,5,G.ad,'Check your last 30 days in Ads Manager.'),{show:v=>adv(v)&&v.amode!=='manual'}),
    X(F('ctr','Link click through rate (CTR)','%',ad.ctr,0.1,10,0.1,G.ad,'Link clicks divided by impressions. CPC is worked out from CPM and CTR.'),{show:v=>adv(v)&&v.amode!=='manual'}),
    X(F('lpConv','Landing page conversion rate','%',ad.lpConv,0.5,60,0.5,G.ad,'Clicks that become a lead: form, chat or call.'),{show:v=>adv(v)&&v.amode!=='manual'&&isLead(v)}),
    X(F('freq','Frequency','x',ad.freq,1,10,0.1,G.ad,'Average times each person sees your ad. Reach = impressions ÷ frequency.'),{show:v=>adv(v)&&v.amode!=='manual'}),
    X(F('cpl','Your known cost per lead or purchase','₹',ad.cpl,5,1000000,5,G.ad,'CPL for lead campaigns, CPP (cost per purchase) for sales campaigns.'),{show:v=>adv(v)&&v.amode==='manual'}),
    ...stageFields,
    X(F('fixed','Other monthly campaign costs','₹',0,0,1000000,1000,G.cost,'Agency fee, creatives, tools. Leave at 0 if there are none.'),{show:adv}),
    DROP
  ];

  /* ---------- compute ---------- */
  function compute(v){
    const kind=kindOf(v),lead=kind==='lead',man=v.amode==='manual',spend=Math.max(0,+v.spend||0),fixed=Math.max(0,+v.fixed||0);
    let impr=NaN,reach=NaN,clicks=NaN,leads=NaN,base;
    const st=stagesOf(v),counts=[];
    if(man){
      if(lead){leads=spend/Math.max(v.cpl,1);base=leads}
      else base=NaN;
    }else{
      impr=spend/Math.max(v.cpm,1)*1000;reach=impr/Math.max(v.freq,1);clicks=impr*P(v.ctr);
      if(lead){leads=clicks*P(v.lpConv);base=leads}else base=clicks;
    }
    let c;
    if(!lead&&man){c=spend/Math.max(v.cpl,1);st.forEach((s,i)=>counts.push(i===st.length-1?c:NaN))}
    else{let x=base;st.forEach(s=>{x=x*P(s.get(v));counts.push(x)});c=st.length?x:base}
    c=Math.max(0,c||0);
    const n={leads:lead?leads:NaN,clicks,impr,counts,stages:st};
    const e=spec.econ(v,c,n)||{};
    const revenue=Math.max(0,e.revenue||0),lines=(e.lines||[]).filter(l=>isFinite(l[1])),varCost=lines.reduce((a,l)=>a+l[1],0);
    const gross=revenue-varCost,net=gross-spend-fixed,invest=varCost+spend+fixed;
    const roas=div(revenue,spend),profitRoas=spend>0?net/spend:NaN,roi=invest>0?net/invest*100:0;
    const mu=revenue>0?gross/revenue:0;
    const beRoasVar=mu>0?1/mu:Infinity,beRoas=mu>0&&spend>0?(spend+fixed)/(mu*spend):Infinity;
    const orders=lead?c:c,cplV=lead?div(spend,leads):div(spend,c);
    const beCpl=lead?(leads>0&&gross>0&&spend>0?gross/leads*spend/(spend+fixed):0):(c>0&&gross>0&&spend>0?gross/c*spend/(spend+fixed):0);
    const cac=div(spend+fixed,c),beCac=c>0?Math.max(0,gross/c):0;
    const ltv=e.ltv!==undefined?e.ltv:(c>0?gross/c:0),ltvcac=div(ltv,cac);
    const ticket=c>0?revenue/c:(e.ticket||0);
    const warn=[...(e.warn||[])];
    if(revenue>0&&gross<0)warn.push('Your costs are higher than your revenue on every sale (negative margin). More ad spend will only increase the loss.');
    if(!(revenue>0)&&c>0)warn.push('Revenue is zero. Check the price or value inputs.');
    const x={kind,lead,man,spend,fixed,impr,reach,clicks,leads,counts,st,c,revenue,lines,varCost,gross,net,invest,roas,profitRoas,roi,mu,beRoas,beRoasVar,beCpl,beCac,cac,cpl:cplV,ltv,ltvcac,ticket,e,warn,unit:spec.unit,unitP:spec.unitP};
    const unitP=spec.unitP,unit=spec.unit,LW=lead?'Leads':'Orders',CW=lead?'CPL':'CPP';
    const top=[{l:'Impressions',n:impr,c:['CPM',v.cpm]},{l:'Link clicks',n:clicks,r:v.ctr+'% CTR',c:['CPC',div(spend,clicks)]}];
    if(lead)top.push({l:'Leads',n:leads,r:man?'from your CPL':v.lpConv+'% of clicks',c:['CPL',cplV]});
    const funnel=[...top,...st.map((s,i)=>({l:s.l,n:counts[i],r:pct(s.get(v))+' of '+(i?st[i-1].l.toLowerCase():lead?'leads':'clicks'),c:[i===st.length-1?(lead?'CAC (ads only)':'CPP'):'Cost each',div(spend,counts[i])]}))];
    const k={spend,impr,reach,clicks,leads:lead?leads:c,leadWord:lead?'leads':'orders',costWord:CW,cpl:cplV,customers:c,cac,revenue,gross,net,roas,profitRoas,roi,beRoas:beRoasVar,beRoasBudget:beRoas,beCpl,beCac,invest,ticket,unit,unitP,ltv};
    return{unit,unitP,units:c,leads:lead?leads:undefined,total:spend+fixed,spend,revenue,net,roas,roasLabel:'ROAS',cac,limit:beCac,limitLabel:'Breakeven CAC',ltv,ltvcac,roi,x,k,
      funnel,
      cards:[
        {k:'Ad spend',v:inr(spend),s:'₹'+new Intl.NumberFormat('en-IN').format(Math.round(spend/30.4))+' a day'},
        {k:LW,v:cnt(lead?leads:c),s:man?'from your '+CW+' of '+inr(v.cpl):'from '+cnt(clicks)+' clicks'},
        {k:CW,v:inr(cplV),s:'breakeven '+inr(beCpl),t:isFinite(cplV)&&cplV<=beCpl?'good':'bad'},
        {k:cap(unitP),v:cnt(c),s:st.length?pct(lead&&leads>0?c/leads*100:clicks>0?c/clicks*100:0)+' of '+(lead?'leads':'clicks'):''},
        {k:'CAC',v:inr(cac),s:'breakeven '+inr(beCac),t:isFinite(cac)&&cac<=beCac?'good':'bad'},
        {k:'Revenue',v:inr(revenue),s:'avg '+inr(ticket)+' per '+unit},
        {k:'ROAS',v:xx(roas),s:'breakeven '+(isFinite(beRoasVar)?xx(beRoasVar):'not reachable'),t:roas>=beRoas?'good':'bad'},
        {k:'Gross profit',v:inr(gross),s:pct(mu*100)+' margin',t:gross>=0?'':'bad'},
        {k:'Net profit',v:inr(net),s:'profit ROAS '+xx(profitRoas),t:net>=0?'good':'bad'},
        {k:'ROI',v:pct(roi),s:'on '+inr(invest)+' invested',t:roi>=0?'good':'bad'}
      ],
      more:[
        ['Reach',cnt(reach)],['CPM',man?'n/a':inr(v.cpm)],['CTR',man?'n/a':pct(v.ctr)],['CPC',inr(div(spend,clicks))],
        [lead?'Cost per lead (CPL)':'Cost per purchase (CPP)',inr(cplV)],['CPA (cost per '+unit+')',inr(div(spend,c))],
        ...st.slice(0,-1).map((s,i)=>['Cost per '+s.l.toLowerCase().replace(/s$/,''),inr(div(spend,counts[i]))]),
        ['Average ticket per '+unit,inr(ticket)],...(lead?[['Revenue per lead',inr(div(revenue,leads))]]:[['AOV',inr(ticket)]]),
        ['Gross margin',pct(mu*100)],['Lifetime gross profit per '+unit,inr(ltv)],['LTV : CAC',xx(ltvcac)],['Total investment',inr(invest)],
        ...(e.extras||[])
      ],
      pnl:[['Revenue'+(e.revLabel?' ('+e.revLabel+')':''),revenue],...lines.map(l=>[l[0],-l[1]]),['Meta ad spend',-spend],['Other campaign costs',-fixed]],
      note:e.note||''
    };
  }

  /* ---------- scenarios ---------- */
  function scenario(kind,v){
    if(kind==='exp')return{...v};
    const s=kind==='cons'?{acq:1.15,rate:0.9,val:0.95}:{acq:0.9,rate:1.1,val:1.05};
    const o={...v,cpm:v.cpm*s.acq,cpl:v.cpl*s.acq};
    stagesOf(v).forEach(st=>st.set(o,Math.min(100,st.get(v)*s.rate)));
    if(isLead(v))o.lpConv=Math.min(100,v.lpConv*s.rate);
    fields.forEach(f=>{if(f.v)o[f.id]=v[f.id]*s.val});
    if(spec.custom)o.cstages=v.cstages.map(x=>({...x,rate:Math.min(100,x.rate*s.rate)}));
    return o;
  }
  const band=(m,v)=>['cons','exp','agg'].map(k=>m.compute(scenario(k,v)));
  function rng(sc,get,fmt){const a=sc.map(get).filter(isFinite);if(!a.length)return 'n/a';const lo=Math.min(...a),hi=Math.max(...a),f=fmt||rngC;return f(lo)===f(hi)?f(lo):f(lo)+' to '+f(hi)}

  /* ---------- profit curve over budget (uses the scaling assumption) ---------- */
  function curve(m,v){
    const pts=[];for(let i=0;i<=80;i++){const k=Math.pow(10,-2+i*0.05);pts.push([k,E.scaled(m,v,k).net])}
    let best=pts[0];pts.forEach(p=>{if(p[1]>best[1])best=p});
    const net=k=>E.scaled(m,v,k).net;
    const root=(a,b)=>{for(let i=0;i<60;i++){const c=(a+b)/2;(net(a)<0)===(net(c)<0)?a=c:b=c}return(a+b)/2};
    let lo=null,hi=null;
    if(best[1]>0){lo=net(0.0001)>=0?0:root(0.0001,best[0]);const last=pts[pts.length-1];hi=last[1]>=0?Infinity:root(best[0],pts.find(p=>p[0]>best[0]&&p[1]<0)[0])}
    return{best,lo,hi};
  }

  /* ---------- verdict ---------- */
  function verdict(r){
    const x=r.x;
    if(!(r.units>0))return{t:'bad',h:'No '+x.unitP+' at these numbers',p:'Your inputs produce almost no '+x.unitP+'. Raise the budget or improve the conversion rates.'};
    if(r.net>0)return{t:'good',h:'Profitable at these numbers',p:`Expected net profit is ${inr(r.net)} on ${inr(r.revenue)} of revenue. Your ROAS of ${xx(r.roas)} is above the ${xx(x.beRoas)} you need at this budget.`};
    if(x.gross<=0)return{t:'bad',h:'Each sale loses money before ads',p:`Your variable costs are ${inr(x.varCost)} against ${inr(x.revenue)} of revenue. Fix price or cost before spending on ads.`};
    if(r.ltvcac>=3&&x.ltv>x.beCac*1.05)return{t:'warn',h:'Loses money this month, then repays it',p:`The first month loses ${inr(-r.net)}, but each ${x.unit} returns about ${xx(r.ltvcac)} their acquisition cost over their lifetime. Make sure you can fund the wait.`};
    if(r.roas>=1)return{t:'bad',h:'Good ROAS, but the campaign still loses money',p:`Your ROAS is ${xx(r.roas)}, but with a ${pct(x.mu*100)} margin you need ${isFinite(x.beRoas)?xx(x.beRoas):'more than any ROAS'} to break even. Expected loss: ${inr(-r.net)}.`};
    return{t:'bad',h:'Not profitable at these numbers',p:`Revenue does not cover the ad spend yet. Improve conversion, raise the ticket size, or bring ${isLead(r.x)?'CPL':'CPP'} below ${inr(x.beCpl)}.`};
  }

  /* ---------- insights ---------- */
  function insightList(m,r,v){
    const x=r.x,CW=x.lead?'CPL':'CPP',li=[];
    li.push(`Your current ${CW} is <b>${inr(x.cpl)}</b> and your breakeven ${CW} is <b>${inr(x.beCpl)}</b>.`);
    li.push(`Your current CAC is <b>${inr(r.cac)}</b>; each ${x.unit} can cost up to <b>${inr(x.beCac)}</b> before you lose money.`);
    li.push(`Your projected ROAS is <b>${xx(r.roas)}</b>. Your breakeven ROAS is <b>${isFinite(x.beRoasVar)?xx(x.beRoasVar):'not reachable'}</b>${x.fixed>0?` (${xx(x.beRoas)} once campaign costs are included)`:''}.`);
    const st=x.st;
    if(st.length){
      const idx=st.reduce((a,s,i)=>s.get(v)<st[a].get(v)?i:a,0),s=st[idx],from=idx?st[idx-1].l:(x.lead?'Leads':'Clicks');
      li.push(`Your largest funnel drop off is between <b>${from.toLowerCase()}</b> and <b>${s.l.toLowerCase()}</b>: only ${pct(s.get(v))} move on.`);
      const to=Math.min(100,Math.round(s.get(v)+10)),o={...v};if(spec.custom)o.cstages=v.cstages.map(q=>({...q}));s.set(o,to);
      const alt=m.compute(o),gain=alt.revenue-r.revenue;
      if(gain>0)li.push(`Improving that rate from ${pct(s.get(v))} to ${pct(to)} could generate approximately <b>${inr(gain)}</b> additional revenue and ${inr(alt.net-r.net)} more profit a month.`);
    }
    li.push(`At your current assumptions, every ₹1 spent on Meta Ads generates <b>₹${isFinite(r.roas)?r.roas.toFixed(2):'0'}</b> in revenue and <b>${isFinite(x.profitRoas)?(x.profitRoas<0?'loses ₹'+(-x.profitRoas).toFixed(2):'₹'+x.profitRoas.toFixed(2)+' profit'):'no profit figure'}</b>.`);
    return li;
  }

  /* ---------- panels ---------- */
  function flowStrip(r){
    const x=r.x,items=[...(x.lead?[['Leads',x.leads]]:[['Clicks',x.clicks]]),...x.st.map((s,i)=>[s.l,x.counts[i]])];
    return `<div class="panel"><h3>${spec.name} funnel</h3><div class="flowv">${items.map(([l,n],i)=>`${i?'<span class="fa" aria-hidden="true">→</span>':''}<div class="fs"><b>${rngC(n)}</b><span>${l}</span></div>`).join('')}<span class="fa" aria-hidden="true">→</span><div class="fs fr"><b>${inr(r.revenue)}</b><span>Revenue</span></div></div></div>`;
  }
  function forecast(r,v,sc){
    const x=r.x,row=(l,e,g,cls)=>`<tr><td>${l}</td><td class="${cls||''}"><b>${e}</b></td><td class="rngc">${g||''}</td></tr>`,LW=x.lead?'Estimated leads':'Estimated orders';
    const rows=[row('Monthly ad spend',inr(x.spend),''),row(LW,rngC(x.lead?x.leads:x.c),rng(sc,s=>s.x.lead?s.x.leads:s.x.c)),row('Average '+(x.lead?'CPL':'CPP'),inr(x.cpl),rng(sc,s=>s.x.cpl,inr)),
      ...x.st.slice(0,-1).map((s,i)=>row(s.l,rngC(x.counts[i]),rng(sc,q=>q.x.counts[i]))),
      row(cap(x.unitP),rngC(x.c),rng(sc,s=>s.x.c)),row('CAC',inr(r.cac),rng(sc,s=>s.cac,inr)),row('Revenue',inr(r.revenue),rng(sc,s=>s.revenue,inr)),
      row('ROAS',xx(r.roas),rng(sc,s=>s.roas,xx)),row('Gross profit',inr(x.gross),rng(sc,s=>s.x.gross,inr)),row('Net profit',inr(r.net),rng(sc,s=>s.net,inr),r.net>=0?'good':'bad'),row('ROI',pct(r.roi),rng(sc,s=>s.roi,pct))];
    return `<div class="panel"><h3>Your forecast</h3><div class="tscroll"><table class="fc"><thead><tr><th></th><th>Expected</th><th>Likely range</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="note"><b>These are estimates based on the assumptions entered, not guaranteed Meta Ads results.</b> The likely range runs from the conservative to the aggressive scenario. People and orders are rounded; money uses the exact expected value.</p></div>`;
  }
  function kpis(r){
    const x=r.x,per=n=>'₹'+(isFinite(n)?Math.abs(n).toFixed(2):'0');
    return `<div class="panel"><h3>ROAS, profit ROAS and ROI</h3><div class="kpi3">
      <div class="kpi"><span class="kk">ROAS</span><b class="kv">${xx(r.roas)}</b><span class="ks">${per(r.roas)} revenue generated for every ₹1 spent on Meta Ads.</span></div>
      <div class="kpi ${x.profitRoas>=0?'good':'bad'}"><span class="kk">Profit ROAS</span><b class="kv">${xx(x.profitRoas)}</b><span class="ks">${isFinite(x.profitRoas)?(x.profitRoas>=0?per(x.profitRoas)+' net profit':'A loss of '+per(x.profitRoas))+' for every ₹1 spent on Meta Ads.':'No ad spend entered.'}</span></div>
      <div class="kpi ${r.roi>=0?'good':'bad'}"><span class="kk">ROI</span><b class="kv">${pct(r.roi)}</b><span class="ks">Net profit ÷ total investment (${inr(x.invest)}: variable costs, ads and campaign costs).</span></div>
    </div><p class="note">ROAS = revenue attributed to Meta Ads ÷ Meta ad spend${x.e.revLabel?' (revenue counted: '+x.e.revLabel+')':''}. Profit ROAS = net profit ÷ Meta ad spend. ROI = net profit ÷ total investment × 100. They measure different things and are never interchangeable.</p></div>`;
  }
  function econPanel(r,v){
    const x=r.x,c=x.c,per=a=>c>0?a/c:0;
    const rows=[`<tr><td>Revenue per ${x.unit}</td><td>${inr(per(x.revenue))}</td><td>${inr(x.revenue)}</td></tr>`,
      ...x.lines.map(l=>`<tr><td>${l[0]}</td><td>${inr(per(l[1]))}</td><td>${inr(l[1])}</td></tr>`),
      `<tr class="tot"><td>Gross profit</td><td class="${x.gross>=0?'good':'bad'}">${inr(per(x.gross))}</td><td class="${x.gross>=0?'good':'bad'}">${inr(x.gross)}</td></tr>`];
    return `<div class="panel"><h3>${spec.costTitle||'Cost structure'}</h3><div class="tscroll"><table class="fc"><thead><tr><th></th><th>Per ${x.unit}</th><th>This month</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="note">${spec.costNote||'Variable costs of the sales the campaign brings in.'} Gross margin ${pct(x.mu*100)}. ${x.lines.length?'':'No variable costs entered.'}</p></div>`;
  }
  function bePanel(m,r,v,parts){
    const x=r.x,c=curve(m,v),CW=x.lead?'CPL':'CPP';
    const cmp=(a,b,low)=>isFinite(a)&&isFinite(b)?((low?a<=b:a>=b)?'good':'bad'):'';
    const sp=c.best[1]<=0?'None. Every budget loses money at these economics.':c.hi===Infinity?`Above ${inr(v.spend*c.lo)}, with no ceiling found up to ${inr(v.spend*100)} at your ${v.drop}% scaling assumption.`:(v.spend*c.lo<1000?`Up to ${inr(v.spend*c.hi)} a month`:`${inr(v.spend*c.lo)} to ${inr(v.spend*c.hi)} a month`);
    return `<div class="panel"><h3>Breakeven analysis</h3>${parts.meterBody}
      <div class="more be">
        <div><span>Breakeven ROAS<small>Covers ${spec.beWhat||'your variable costs'}</small></span><b>${isFinite(x.beRoasVar)?xx(x.beRoasVar):'not reachable'}<small class="${cmp(r.roas,x.beRoas,0)}">projected ${xx(r.roas)}${x.fixed>0?' · '+xx(x.beRoas)+' with campaign costs':''}</small></b></div>
        <div><span>Breakeven ${CW}<small>Maximum you can pay per ${x.lead?'lead':'purchase'}</small></span><b>${inr(x.beCpl)}<small class="${cmp(x.cpl,x.beCpl,1)}">projected ${inr(x.cpl)}</small></b></div>
        <div><span>Breakeven CAC<small>Maximum cost to win a ${x.unit}</small></span><b>${inr(x.beCac)}<small class="${cmp(r.cac,x.beCac,1)}">projected ${inr(r.cac)}</small></b></div>
        <div><span>Maximum profitable ad spend<small>Includes your scaling assumption</small></span><b>${sp}${c.best[1]>0?`<small>most profit near ${inr(v.spend*c.best[0])} (${inr(c.best[1])})</small>`:''}</b></div>
      </div></div>`;
  }
  function sensitivity(m,r,v){
    const base=r.net,cands=fields.filter(f=>!f.kind&&(f.v||f.rate||f.cost||['cpm','cpl','lpConv','ctr'].includes(f.id))&&(!f.show||f.show(v))&&+v[f.id]>0);
    const rows=cands.map(f=>{const o={...v,[f.id]:f.unit==='%'?Math.min(100,v[f.id]*1.1):v[f.id]*1.1};return[f.label,m.compute(o).net-base]}).filter(x=>Math.abs(x[1])>0.5).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,8);
    if(!rows.length)return '';
    const mx=Math.max(...rows.map(x=>Math.abs(x[1])));
    return `<div class="panel"><h3>Sensitivity analysis</h3><p class="note" style="margin:0 0 10px">Change in monthly net profit if each input rises by 10%.</p><div class="sens">${rows.map(([l,d])=>`<div class="sr"><span>${l}</span><div class="st"><i class="${d>=0?'up':'dn'}" style="width:${Math.abs(d)/mx*100}%"></i></div><b class="${d>=0?'good':'bad'}">${d>=0?'+':''}${inr(d)}</b></div>`).join('')}</div></div>`;
  }
  function benchPanel(r,v){
    const B=globalThis.MABC_BENCH,ref=(B&&B.data[spec.key])||{},x=r.x,st=x.st;
    let user={};try{user=JSON.parse(localStorage.getItem('mabc:bench:'+spec.key)||'{}')}catch(e){}
    const mine={ctr:x.man?NaN:v.ctr,cpc:div(x.spend,x.clicks),cpm:x.man?NaN:v.cpm,cpl:x.cpl,conv:x.lead?(x.leads>0?x.c/x.leads*100:0):(x.clicks>0?x.c/x.clicks*100:0),cac:r.cac,ticket:x.ticket,close:st.length?st[st.length-1].get(v):NaN};
    const M=[['ctr','CTR',pct],['cpc','CPC',inr],['cpm','CPM',inr],['cpl',x.lead?'CPL':'CPP',inr],['conv',x.lead?'Lead to '+x.unit+' rate':'Click to purchase rate',pct],['cac','CAC',inr],['ticket','AOV / ticket size',inr],['close','Closing rate (last stage)',pct]];
    const rows=M.map(([id,l,f])=>{const rv=ref[id]||user[id]!==undefined&&{value:user[id],sourceType:'saved',date:user.date};const a=mine[id];
      const d=rv&&isFinite(rv.value)&&isFinite(a)&&rv.value?((a-rv.value)/rv.value*100):null;
      return `<tr><td>${l}</td><td>${rv?f(rv.value)+`<small class="src">${(B&&B.sources[rv.sourceType])||rv.sourceType}${rv.date?', '+rv.date:''}</small>`:'<span class="sub">Not set</span>'}</td><td>${isFinite(a)?f(a):'n/a'}</td><td class="${d===null?'':Math.abs(d)<10?'':'sub'}">${d===null?'':(d>=0?'+':'')+pct(d)}</td></tr>`}).join('');
    return `<div class="panel"><h3>Suggested assumptions</h3><p class="note" style="margin:0 0 10px">No benchmark numbers are built in, because none have been verified. References can come from verified industry sources, agency historical data, Meta campaign data or your own history (edit <code>js/benchmarks.js</code>, or save your current numbers below after a real campaign).</p>
      <div class="tscroll"><table class="fc bench"><thead><tr><th>Metric</th><th>Reference assumption</th><th>Your actual assumption</th><th>Difference</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="actions" style="margin-top:10px"><button type="button" class="btn btn-line btn-sm" data-act="benchSave">Save my current numbers as my reference</button><button type="button" class="btn btn-line btn-sm" data-act="benchClear">Clear my reference</button></div></div>`;
  }
  function layout(parts,r,v,Eng){
    const m=Eng.m,sc=band(m,v),a=adv(v),x=r.x;
    const warn=x.warn.length?`<div class="warnbox" role="alert">${x.warn.map(w=>`<p>${w}</p>`).join('')}</div>`:'';
    return [parts.verdict,warn,parts.note,parts.cards,flowStrip(r),forecast(r,v,sc),kpis(r),
      `<div class="panel"><h3>Key insights</h3><ul class="ins">${insightList(m,r,v).map(t=>`<li>${t}</li>`).join('')}</ul></div>`,
      parts.funnel,econPanel(r,v),spec.panels?spec.panels(r,v):'',parts.pnl,bePanel(m,r,v,parts),
      a?parts.more:'',parts.scen,a?sensitivity(m,r,v):'',a?parts.scale:'',a?benchPanel(r,v):''].join('');
  }
  function scenRows(r){
    const LW=r.x.lead?'Leads':'Orders';
    return[['Ad spend',s=>inr(s.spend)],[LW,s=>rngC(s.x.lead?s.x.leads:s.x.c)],[cap(r.unitP),s=>rngC(s.x.c)],['Revenue',s=>inr(s.revenue)],['CAC',s=>inr(s.cac)],['ROAS',s=>xx(s.roas)],['Profit',s=>inr(s.net),1],['ROI',s=>pct(s.roi)]];
  }

  /* ---------- goal calculator ---------- */
  const DEF_GOAL={kind:'revenue',revenue:1000000,customers:spec.goal||20,profit:200000};
  const TK={revenue:['Target revenue','₹'],customers:['Target '+spec.unitP,''],profit:['Target profit','₹']};
  const gOf=g=>Object.assign({},DEF_GOAL,g&&typeof g==='object'?g:{});
  function goalPanel(v,g){
    g=gOf(g);const k=g.kind in TK?g.kind:'revenue';
    return `<div class="panel" id="door-goal"><h3>Goal calculator</h3>
      <div class="seg tgt" role="radiogroup" aria-label="Goal type">${Object.keys(TK).map(q=>`<button type="button" role="radio" data-act="tgt" data-k="${q}" aria-checked="${q===k}">${TK[q][0]}</button>`).join('')}</div>
      <div class="goal-in"><label for="tgt">I want</label><div class="inp">${TK[k][1]?'<span class="u">₹</span>':''}<input id="tgt" data-tgt="${k}" type="number" inputmode="decimal" min="0" step="any" value="${g[k]}"><span class="u">${k==='customers'?spec.unitP+' / month':'/ month'}</span></div></div>
      <div id="goal-out"></div></div>`;
  }
  function renderGoal(Eng){
    const out=Eng.$('#goal-out');if(!out)return;
    const m=Eng.m,v=Eng.v,g=gOf(Eng.goal),k=g.kind in TK?g.kind:'revenue',T=+g[k],base=m.compute(v);
    if(!(T>0)){out.innerHTML='<p class="note">Enter a target above.</p>';return}
    if(!(base.units>0)){out.innerHTML=`<p class="note">Your current inputs produce no ${spec.unitP}, so a budget cannot be estimated.</p>`;return}
    let mult=null;const f=(kk,get)=>get(Eng.scaled(m,v,kk));
    if(k==='profit'){
      const c=curve(m,v);
      if(c.best[1]<T){out.innerHTML=`<p class="note">That profit is not reachable at these numbers. The most you can make is about <b>${inr(c.best[1])}</b> a month, at a budget near ${inr(v.spend*c.best[0])}. Improve price, cost or conversion to aim higher.</p>`;return}
      let lo=0,hi=c.best[0];const get=s=>s.net;if(f(0.0001,get)>=T)hi=0.0001;else for(let i=0;i<60;i++){const cc=(lo+hi)/2;f(cc,get)<T?lo=cc:hi=cc}mult=hi;
    }else{
      const get=k==='revenue'?s=>s.revenue:s=>s.units;let hi=1;for(let i=0;i<30&&f(hi,get)<T;i++)hi*=2;
      if(f(hi,get)>=T){let lo=0;for(let i=0;i<60;i++){const c=(lo+hi)/2;f(c,get)<T?lo=c:hi=c}mult=hi}
    }
    if(mult===null){out.innerHTML='<p class="note">That target is out of reach even at a very large budget with your scaling assumption. Lower it or improve conversion.</p>';return}
    const s=Eng.scaled(m,v,mult),y=s.x,sp=v.spend*mult,it=(l,val)=>`<div><span>${l}</span><b>${val}</b></div>`;
    const rows=[it('Required ad spend',inr(sp)+' / month'),it('Required '+(y.lead?'leads':'orders'),rngC(y.lead?y.leads:y.c)),
      ...y.st.slice(0,-1).map((q,i)=>isFinite(y.counts[i])?it('Required '+q.l.toLowerCase(),rngC(y.counts[i])):''),
      it('Required '+spec.unitP,rngC(y.c)),it('Expected revenue',inr(s.revenue)),it('Expected profit',inr(s.net)),it('ROAS at that budget',xx(s.roas))];
    let extra='';
    if(k==='revenue'){const needC=base.x.ticket>0?T/base.x.ticket:Infinity,conv=base.x.lead?(base.x.leads>0?needC/base.x.leads*100:Infinity):(base.x.clicks>0?needC/base.x.clicks*100:Infinity);
      extra=`<p class="note">Required ROAS: <b>${xx(div(T,sp))}</b>. Without raising the budget you would need <b>${isFinite(conv)&&conv<=100?pct(conv):'more than 100%'}</b> of ${base.x.lead?'leads':'clicks'} to become ${spec.unitP}.</p>`}
    if(k==='profit')extra=`<p class="note">Required revenue: <b>${inr(s.revenue)}</b>. Required ROAS: <b>${xx(s.roas)}</b>.</p>`;
    out.innerHTML=`<div class="more">${rows.join('')}</div>${extra}<p class="note">${mult>1&&v.drop>0?'Includes cost inflation from spending '+xx(mult).replace('x','×')+' your current budget.':'Based on your current efficiency.'} Estimates, not guaranteed results.</p>`;
  }

  /* ---------- derived notes ---------- */
  function derived(v,r){
    const x=r.x,d={},inr0=n=>'₹'+new Intl.NumberFormat('en-IN').format(Math.round(n));
    d['note:'+G.setup]=`${inr0(v.spend/30.4)} a day · ${inr(v.spend*v.months)} over ${num(v.months)} month${v.months===1?'':'s'}`;
    d['note:'+G.ad]=x.man?(x.lead?`${inr(v.spend)} ÷ ${inr(v.cpl)} CPL = <b>${rngC(x.leads)} leads</b>`:`${inr(v.spend)} ÷ ${inr(v.cpl)} CPP = <b>${rngC(x.c)} purchases</b>`):
      `Impressions ${rngC(x.impr)} · reach ${rngC(x.reach)} · clicks ${rngC(x.clicks)}${x.lead?' · leads <b>'+rngC(x.leads)+'</b>':''}. CPC <b>${inr(div(v.spend,x.clicks))}</b>${x.lead?', CPL <b>'+inr(x.cpl)+'</b>':''}.`;
    d['note:'+G.fun]=[x.lead?rngC(x.leads)+' leads':rngC(x.clicks)+' clicks',...x.st.map((s,i)=>rngC(x.counts[i])+' '+s.l.toLowerCase())].join(' → ');
    d['note:'+G.eco]=spec.ecoNote?spec.ecoNote(v,r):`Revenue ${inr(x.ticket)} per ${x.unit}, gross margin <b>${pct(x.mu*100)}</b>`;
    if(spec.derived)Object.assign(d,spec.derived(v,r));
    return d;
  }
  const groups=Object.assign({[G.setup]:{note:1},[G.ad]:{note:1},[G.fun]:{note:1},[G.eco]:{note:1},[G.cost]:{collapse:1,open:1}},spec.groups||{});

  function onOpt(id,val,v){
    if(id==='loc'){const L=MK()?MK().blend(v.loc):{cpm:180};v.cpm=Math.round(ad.cpm*L.cpm/180/5)*5;
      return `CPM set to ${inr(v.cpm)}, ${v.loc.length>1?'the average starting level across '+locLabel(v):'a typical starting level for '+locLabel(v)}. ${adv(v)?'Edit it under Ad delivery.':'Switch to Advanced to edit it.'}`}
    if(id==='mode')return val==='advanced'?'Advanced mode: ad metrics, costs, sensitivity, scaling and benchmarks.':'Simple mode: the essential questions only; the rest uses the starting assumptions.';
    return spec.onOpt?spec.onOpt(id,val,v)||'':'';
  }
  function onInput(id,v){
    if(id==='daily'){v.spend=Math.round(v.daily*30.4);return['spend']}
    if(id==='spend'){v.daily=Math.round(v.spend/30.4);return['daily']}
    return null;
  }
  function formIntro(v){
    const cust=spec.custom?spec.builder(v):'';
    return cust+(adv(v)?`<div class="intro"><b>Advanced mode.</b> Every ad metric, conversion rate and cost is editable. Starting values are placeholders, not benchmarks: replace them with your own numbers.</div>`:
      `<div class="intro"><b>Simple mode.</b> Answer the essentials: location, ad budget, ${spec.simpleAsk||'price and cost'}, and your conversion rates. Ad costs use starting assumptions you can refine in Advanced mode.</div>`);
  }
  const actions=Object.assign({
    tgt(v,Eng,el){const g=Object.assign(gOf(Eng.goal),{kind:el.dataset.k});Eng.setGoal(g);const b=Eng.$('#door-goal');if(b)b.outerHTML=goalPanel(v,g);renderGoal(Object.assign({},Eng,{goal:g}));return false},
    benchSave(v,Eng){const r=Eng.m.compute(v),x=r.x;const o={ctr:x.man?NaN:v.ctr,cpc:div(x.spend,x.clicks),cpm:x.man?NaN:v.cpm,cpl:x.cpl,conv:x.lead?(x.leads>0?x.c/x.leads*100:0):(x.clicks>0?x.c/x.clicks*100:0),cac:r.cac,ticket:x.ticket,close:x.st.length?x.st[x.st.length-1].get(v):NaN};
      Object.keys(o).forEach(k=>{if(!isFinite(o[k]))delete o[k]});o.date=new Date().toISOString().slice(0,10);try{localStorage.setItem('mabc:bench:'+spec.key,JSON.stringify(o))}catch(e){}
      Eng.refresh();Eng.toast('Saved as your reference. Change the inputs to compare against it.');return false},
    benchClear(v,Eng){try{localStorage.removeItem('mabc:bench:'+spec.key)}catch(e){}Eng.refresh();return false}
  },spec.actions||{});
  function goalInput(t,Eng){const g=gOf(Eng.goal);g[t.dataset.tgt]=parseFloat(t.value)||0;g.kind=t.dataset.tgt;Eng.setGoal(g);renderGoal(Object.assign({},Eng,{goal:g}))}
  function summary(r,v){
    const x=r.x,sc=band(this_,v);
    return[`Industry: ${spec.name}${spec.custom&&v.cname?' ('+v.cname+')':''}. Location${v.loc.length>1?'s':''}: ${locLabel(v)}.`,
      `Estimated ${x.lead?'leads':'orders'} ${rng(sc,s=>s.x.lead?s.x.leads:s.x.c)} · ${spec.unitP} ${rng(sc,s=>s.x.c)} · revenue ${rng(sc,s=>s.revenue,inr)} · ROAS ${rng(sc,s=>s.roas,xx)}`,
      `ROAS ${xx(r.roas)} · Profit ROAS ${xx(x.profitRoas)} · ROI ${pct(r.roi)} · Breakeven ROAS ${isFinite(x.beRoasVar)?xx(x.beRoasVar):'not reachable'} · Breakeven ${x.lead?'CPL':'CPP'} ${inr(x.beCpl)}`,
      'These are estimates based on the assumptions entered, not guaranteed Meta Ads results.'];
  }
  const this_={key:spec.key,name:spec.name,short:spec.short||spec.name,cat:spec.cat,flow:spec.flow,desc:spec.desc,icon:spec.icon,color:'var(--green)',
    unit:spec.unit,unitP:spec.unitP,goal:DEF_GOAL,cardsClass:'k10',fields,groups,modes:[['simple','Simple'],['advanced','Advanced']],
    presets:[['custom','Custom (my own numbers)',{}],...(spec.presets||[])],
    compute,verdict,layout,scenario,scenNames:['Conservative','Expected','Aggressive'],scenRows,scenTitle:'Scenario planner',
    scenNote:'Conservative: acquisition cost up 15%, conversion rates down 10%, price or deal value down 5%. Aggressive: acquisition cost down 10%, conversion up 10%, value up 5%. Expected uses your inputs.',
    funnelTitle:'Funnel detail',goalPanel,renderGoal,goalInput,actions,onOpt,onInput,formIntro,derived,summary:(r,v)=>summary(r,v),
    insightList:(r,v)=>insightList(this_,r,v),customInput:spec.customInput};
  return this_;
}
return{build,O,X,C,F,G,LOCS};
};
})();
