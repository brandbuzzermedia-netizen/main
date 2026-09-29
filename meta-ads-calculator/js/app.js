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

const MODELS={
service:{
  key:'service',name:'Service Business',short:'Service',color:'var(--svc)',unit:'customer',unitP:'customers',goal:20,
  fields:[
    F('spend','Monthly Meta ad budget','₹',50000,5000,1000000,1000,'Ad delivery','What you plan to spend on Meta Ads each month.'),
    F('cpm','CPM (cost per 1,000 impressions)','₹',180,50,800,5,'Ad delivery','Varies by city, audience and season. Check your last 30 days in Ads Manager.'),
    F('ctr','Link click through rate','%',1.2,0.2,4,0.1,'Ad delivery','Clicks on your link divided by impressions.',true),
    F('lpConv','Click → lead','%',10,1,40,0.5,'Lead capture','Of people who click, how many fill the form or start a chat.',true),
    F('contactRate','Leads you actually reach','%',65,10,100,1,'Sales funnel','Leads who pick up or reply after your team follows up.',true),
    F('apptRate','Reached → appointment / visit booked','%',35,5,100,1,'Sales funnel','Of the people you reach, how many book a call, visit or meeting.',true),
    F('showRate','Appointments that show up','%',70,20,100,1,'Sales funnel','Missed appointments reduce this. Reminders raise it.',true),
    F('closeRate','Showed up → paying customer','%',30,3,100,1,'Sales funnel','Your close rate after a meeting or visit.',true),
    F('avgRevenue','First sale value per customer','₹',15000,500,1000000,500,'Business economics','Revenue from a new customer’s first purchase or project.'),
    F('repeat','Purchases per customer over their lifetime','x',1.5,1,10,0.1,'Business economics','1 = buys once. 3 = an average customer buys three times.'),
    F('margin','Gross margin','%',60,5,100,1,'Business economics','What is left after direct delivery costs (staff time, materials, commissions).'),
    F('fixed','Other monthly campaign costs','₹',10000,0,500000,1000,'Business economics','Agency fee, creatives, tools, telecaller cost for this campaign.'),
    DROP
  ],
  presets:[
    ['custom','Custom (my own numbers)',{}],
    ['clinic','Clinic / dental',{cpm:220,ctr:1.1,lpConv:9,contactRate:70,apptRate:40,showRate:70,closeRate:60,avgRevenue:8000,repeat:2,margin:55}],
    ['salon','Salon / spa',{cpm:150,ctr:1.5,lpConv:12,contactRate:70,apptRate:45,showRate:65,closeRate:75,avgRevenue:2500,repeat:4,margin:60}],
    ['realestate','Real estate services',{cpm:250,ctr:0.9,lpConv:8,contactRate:55,apptRate:20,showRate:55,closeRate:6,avgRevenue:150000,repeat:1,margin:85}],
    ['consultant','Consultant / coach',{cpm:200,ctr:1,lpConv:10,contactRate:60,apptRate:30,showRate:60,closeRate:25,avgRevenue:25000,repeat:1.2,margin:80}],
    ['lawyer','Lawyer / legal',{cpm:260,ctr:0.8,lpConv:8,contactRate:60,apptRate:35,showRate:65,closeRate:40,avgRevenue:30000,repeat:1.2,margin:70}],
    ['interior','Interior designer / architect',{cpm:240,ctr:0.9,lpConv:7,contactRate:55,apptRate:25,showRate:60,closeRate:15,avgRevenue:250000,repeat:1,margin:30}],
    ['gym','Gym / fitness',{cpm:140,ctr:1.6,lpConv:14,contactRate:65,apptRate:40,showRate:60,closeRate:35,avgRevenue:12000,repeat:1.5,margin:65}],
    ['coaching','Coaching / education',{cpm:170,ctr:1.3,lpConv:12,contactRate:60,apptRate:35,showRate:60,closeRate:25,avgRevenue:30000,repeat:1.2,margin:70}]
  ],
  compute(v){
    const cpm=Math.max(v.cpm,1);
    const impr=v.spend/cpm*1000,clicks=impr*P(v.ctr),leads=clicks*P(v.lpConv);
    const contacted=leads*P(v.contactRate),appts=contacted*P(v.apptRate),held=appts*P(v.showRate),units=held*P(v.closeRate);
    const total=v.spend+v.fixed,revenue=units*v.avgRevenue,gp=revenue*P(v.margin),net=gp-total;
    const gpUnit=v.avgRevenue*P(v.margin),ltv=gpUnit*v.repeat,cac=div(total,units);
    const roas=div(revenue,v.spend),roi=total>0?net/total*100:0,ltvcac=div(ltv,cac);
    const beRoas=v.margin>0?100/v.margin:Infinity;
    const maxCpl=leads>0?Math.max(0,(gp-v.fixed)/leads):0;
    return{unit:'customer',unitP:'customers',units,leads,total,spend:v.spend,revenue,net,roas,roasLabel:'ROAS',cac,limit:gpUnit,limitLabel:'Breakeven CAC',ltvcac,ltv,roi,
      funnel:[
        {l:'Impressions',n:impr,c:['CPM',cpm]},
        {l:'Link clicks',n:clicks,r:v.ctr+'% CTR',c:['CPC',div(v.spend,clicks)]},
        {l:'Leads',n:leads,r:v.lpConv+'% of clicks',c:['CPL',div(v.spend,leads)]},
        {l:'Leads reached',n:contacted,r:v.contactRate+'% of leads',c:['Per reached lead',div(v.spend,contacted)]},
        {l:'Appointments booked',n:appts,r:v.apptRate+'% of reached',c:['Per appointment',div(v.spend,appts)]},
        {l:'Appointments held',n:held,r:v.showRate+'% show up',c:['Per meeting held',div(v.spend,held)]},
        {l:'New customers',n:units,r:v.closeRate+'% close',c:['CAC (ads only)',div(v.spend,units)]}
      ],
      cards:[
        {k:'Leads',v:num(leads),s:'CPL '+inr(div(v.spend,leads))},
        {k:'Appointments held',v:num(held),s:inr(div(v.spend,held))+' each'},
        {k:'New customers',v:num(units),s:'Total CAC '+inr(cac)},
        {k:'Revenue (first sale)',v:inr(revenue),s:'ROAS '+xx(roas)},
        {k:'Net profit',v:inr(net),s:'ROI '+pct(roi),t:net>=0?'good':'bad'},
        {k:'LTV : CAC',v:xx(ltvcac),s:'Lifetime gross profit '+inr(ltv),t:ltvcac>=3?'good':ltvcac>=1?'warn':'bad'}
      ],
      more:[
        ['Impressions',num(impr)],['Cost per click (CPC)',inr(div(v.spend,clicks))],
        ['Lead → customer rate',pct(leads>0?units/leads*100:0)],['Breakeven ROAS (ads only)',xx(beRoas)],
        ['Max CPL to break even',inr(maxCpl)],['Gross profit per customer',inr(gpUnit)],
        ['Lifetime revenue',inr(units*v.avgRevenue*v.repeat)],['Net profit incl. repeat sales',inr(units*ltv-total)]
      ],
      pnl:[['Revenue from first sales',revenue],['Cost of delivering the service',-(revenue-gp)],['Meta ad spend',-v.spend],['Agency, creative & other costs',-v.fixed]]
    };
  }
},
b2b:{
  key:'b2b',name:'B2B',short:'B2B',color:'var(--b2b)',unit:'deal',unitP:'deals',goal:3,
  fields:[
    F('spend','Monthly Meta ad budget','₹',100000,10000,2000000,5000,'Ad delivery','What you plan to spend on Meta Ads each month.'),
    F('cpm','CPM (cost per 1,000 impressions)','₹',350,80,1000,10,'Ad delivery','B2B audiences (decision makers) usually cost more to reach.'),
    F('ctr','Link click through rate','%',0.9,0.2,4,0.1,'Ad delivery','Clicks on your link divided by impressions.',true),
    F('lpConv','Click → lead','%',8,1,40,0.5,'Lead capture','Of people who click, how many submit a form or book.',true),
    F('mqlRate','Leads that fit your ideal customer','%',40,5,100,1,'Sales pipeline','Right company size, role and budget. Meta leads often include many poor fits.',true),
    F('sqlRate','Fitting leads → discovery call / demo held','%',30,5,100,1,'Sales pipeline','Of the qualified leads, how many actually get on a call.',true),
    F('oppRate','Calls → proposal / quote sent','%',50,5,100,1,'Sales pipeline','Calls that turn into a real proposal.',true),
    F('closeRate','Proposals → deal won','%',20,3,80,1,'Sales pipeline','Your proposal win rate.',true),
    F('acv','Average first year deal value','₹',300000,10000,5000000,10000,'Business economics','Contract value you bill in the first 12 months.'),
    F('years','Average years a client stays','x',2,1,10,0.5,'Business economics','1 = a single project. Higher if contracts renew or expand.'),
    F('margin','Gross margin','%',50,5,100,1,'Business economics','After the direct cost of delivering the work or product.'),
    F('fixed','Sales team & other monthly costs','₹',60000,0,1000000,5000,'Business economics','SDR / sales salary share, CRM, tools, creatives, agency fee for this campaign.'),
    F('cycle','Sales cycle length','days',45,7,365,1,'Business economics','Revenue from this month’s ads lands roughly this many days later. Plan cash flow accordingly.'),
    DROP
  ],
  presets:[
    ['custom','Custom (my own numbers)',{}],
    ['saas','SaaS / software product',{cpm:380,ctr:0.8,lpConv:6,mqlRate:35,sqlRate:25,oppRate:45,closeRate:20,acv:240000,years:2.5,margin:80,cycle:45}],
    ['it','IT / software services',{cpm:350,ctr:0.8,lpConv:7,mqlRate:40,sqlRate:30,oppRate:50,closeRate:18,acv:600000,years:1.5,margin:30,cycle:60}],
    ['agency','Marketing / creative agency',{cpm:300,ctr:1,lpConv:9,mqlRate:40,sqlRate:35,oppRate:55,closeRate:25,acv:360000,years:1.5,margin:55,cycle:30}],
    ['mfg','Manufacturer / wholesaler',{cpm:280,ctr:0.9,lpConv:7,mqlRate:35,sqlRate:30,oppRate:50,closeRate:22,acv:500000,years:2,margin:25,cycle:60}],
    ['staffing','Staffing / HR services',{cpm:300,ctr:1,lpConv:8,mqlRate:40,sqlRate:30,oppRate:45,closeRate:20,acv:200000,years:2,margin:25,cycle:30}]
  ],
  compute(v){
    const cpm=Math.max(v.cpm,1);
    const impr=v.spend/cpm*1000,clicks=impr*P(v.ctr),leads=clicks*P(v.lpConv);
    const mql=leads*P(v.mqlRate),sql=mql*P(v.sqlRate),opp=sql*P(v.oppRate),units=opp*P(v.closeRate);
    const total=v.spend+v.fixed,revenue=units*v.acv,gp=revenue*P(v.margin),net=gp-total;
    const gpUnit=v.acv*P(v.margin),ltv=gpUnit*v.years,cac=div(total,units);
    const roas=div(revenue,v.spend),roi=total>0?net/total*100:0,ltvcac=div(ltv,cac);
    const monthlyGp=gpUnit/12,payback=isFinite(cac)&&monthlyGp>0?cac/monthlyGp:Infinity;
    return{unit:'deal',unitP:'deals',units,leads,total,spend:v.spend,revenue,net,roas,roasLabel:'ROAS',cac,limit:gpUnit,limitLabel:'Breakeven CAC',ltvcac,ltv,roi,
      funnel:[
        {l:'Impressions',n:impr,c:['CPM',cpm]},
        {l:'Link clicks',n:clicks,r:v.ctr+'% CTR',c:['CPC',div(v.spend,clicks)]},
        {l:'Leads',n:leads,r:v.lpConv+'% of clicks',c:['CPL',div(v.spend,leads)]},
        {l:'Qualified leads (MQL)',n:mql,r:v.mqlRate+'% of leads',c:['Cost per MQL',div(v.spend,mql)]},
        {l:'Discovery calls held (SQL)',n:sql,r:v.sqlRate+'% of MQLs',c:['Cost per SQL',div(v.spend,sql)]},
        {l:'Proposals sent',n:opp,r:v.oppRate+'% of calls',c:['Cost per proposal',div(v.spend,opp)]},
        {l:'Deals won',n:units,r:v.closeRate+'% win rate',c:['CAC (ads only)',div(v.spend,units)]}
      ],
      cards:[
        {k:'Leads',v:num(leads),s:'CPL '+inr(div(v.spend,leads))},
        {k:'Qualified leads',v:num(mql),s:inr(div(v.spend,mql))+' each'},
        {k:'Deals won',v:num(units),s:'Chance of ≥1 deal: '+pct((1-Math.exp(-units))*100)},
        {k:'First year revenue',v:inr(revenue),s:'Pipeline '+inr(opp*v.acv)},
        {k:'Net profit (year 1)',v:inr(net),s:'ROI '+pct(roi),t:net>=0?'good':'bad'},
        {k:'LTV : CAC',v:xx(ltvcac),s:'Total CAC '+inr(cac),t:ltvcac>=3?'good':ltvcac>=1?'warn':'bad'}
      ],
      more:[
        ['Cost per proposal',inr(div(v.spend,opp))],['Lead → deal rate',pct(leads>0?units/leads*100:0)],
        ['ROAS (first year revenue)',xx(roas)],['Breakeven ROAS (ads only)',xx(v.margin>0?100/v.margin:Infinity)],
        ['CAC payback',isFinite(payback)?num(payback)+' months + '+v.cycle+' day sales cycle':'n/a'],['Gross profit per deal (yr 1)',inr(gpUnit)],
        ['Lifetime gross profit per client',inr(ltv)],['Revenue lands after',v.cycle+' days']
      ],
      pnl:[['First year revenue from won deals',revenue],['Cost of delivery',-(revenue-gp)],['Meta ad spend',-v.spend],['Sales team & other costs',-v.fixed]],
      note:units<1?'You expect fewer than one deal a month. B2B results at low volume are lumpy: a month can deliver zero or three. Judge this over 3 to 6 months.':''
    };
  }
},
b2c:{
  key:'b2c',name:'B2C / Ecommerce',short:'B2C',color:'var(--b2c)',unit:'order',unitP:'orders',goal:500,
  fields:[
    F('spend','Monthly Meta ad budget','₹',100000,10000,3000000,5000,'Ad delivery','What you plan to spend on Meta Ads each month.'),
    F('cpm','CPM (cost per 1,000 impressions)','₹',150,50,600,5,'Ad delivery','Varies by audience, creative and season (festive sales push it up).'),
    F('ctr','Link click through rate','%',1.4,0.3,4,0.1,'Ad delivery','Link clicks divided by impressions.',true),
    F('lpvRate','Clicks that load your page','%',80,40,100,1,'Store funnel','Link clicks → landing page views. Slow pages lose people here.',true),
    F('atcRate','Page views → add to cart','%',8,1,25,0.5,'Store funnel','Visitors who add a product to cart.',true),
    F('icRate','Add to cart → checkout started','%',45,10,90,1,'Store funnel','Carts that reach checkout.',true),
    F('buyRate','Checkout → order placed','%',45,10,90,1,'Store funnel','Checkouts that complete, including COD confirmations.',true),
    F('aov','Average order value','₹',1200,100,50000,50,'Order economics','What a customer pays per order.'),
    F('cogs','Product cost (COGS)','%',35,5,90,1,'Order economics','Cost of goods as a share of order value.'),
    F('ship','Shipping & packaging per order','₹',90,0,500,5,'Order economics','Charged on every shipped order, including ones that come back.'),
    F('gateway','Payment gateway fee','%',2,0,5,0.1,'Order economics','Deducted from revenue you keep.'),
    F('rto','Returns / RTO','%',15,0,50,1,'Order economics','Orders that are returned or refused (common with COD). They earn nothing but still cost shipping.'),
    F('repeat','Orders per customer over their lifetime','x',1.3,1,10,0.1,'Order economics','1 = never reorders.'),
    F('fixed','Other monthly costs','₹',25000,0,500000,1000,'Order economics','Agency fee, creatives, tools, influencer or content costs for this campaign.'),
    DROP
  ],
  presets:[
    ['custom','Custom (my own numbers)',{}],
    ['fashion','Fashion & apparel',{cpm:140,ctr:1.4,lpvRate:78,atcRate:7,icRate:45,buyRate:45,aov:1300,cogs:40,ship:90,rto:22,repeat:1.4}],
    ['beauty','Beauty & personal care',{cpm:160,ctr:1.5,lpvRate:80,atcRate:8,icRate:45,buyRate:50,aov:800,cogs:30,ship:80,rto:15,repeat:2}],
    ['decor','Home decor',{cpm:150,ctr:1.2,lpvRate:75,atcRate:6,icRate:40,buyRate:45,aov:2200,cogs:45,ship:150,rto:12,repeat:1.2}],
    ['electronics','Electronics & gadgets',{cpm:170,ctr:1.3,lpvRate:78,atcRate:6,icRate:40,buyRate:50,aov:2500,cogs:65,ship:100,rto:10,repeat:1.2}],
    ['food','Food & snacks',{cpm:130,ctr:1.6,lpvRate:80,atcRate:9,icRate:48,buyRate:50,aov:700,cogs:45,ship:70,rto:8,repeat:2}],
    ['toys','Toys & kids',{cpm:145,ctr:1.5,lpvRate:80,atcRate:8,icRate:45,buyRate:48,aov:1100,cogs:45,ship:90,rto:12,repeat:1.5}]
  ],
  compute(v){
    const cpm=Math.max(v.cpm,1);
    const impr=v.spend/cpm*1000,clicks=impr*P(v.ctr),lpv=clicks*P(v.lpvRate),atc=lpv*P(v.atcRate),ic=atc*P(v.icRate),units=ic*P(v.buyRate);
    const delivered=units*(1-P(v.rto)),booked=units*v.aov,netRev=delivered*v.aov;
    const cogsCost=netRev*P(v.cogs),gate=netRev*P(v.gateway),ship=units*v.ship;
    const contribution=netRev-cogsCost-gate-ship,total=v.spend+v.fixed,net=contribution-total;
    const perOrder=units>0?contribution/units:0,ltv=perOrder*v.repeat,cac=div(total,units);
    const roas=div(booked,v.spend),netRoas=div(netRev,v.spend),roi=total>0?net/total*100:0,ltvcac=div(ltv,cac);
    const cm=booked>0?contribution/booked:0,beRoas=cm>0?1/cm:Infinity;
    return{unit:'order',unitP:'orders',units,total,spend:v.spend,revenue:booked,net,roas,roasLabel:'ROAS (as Meta reports it)',cac,limit:perOrder,limitLabel:'Breakeven CPA',ltvcac,ltv,roi,
      funnel:[
        {l:'Impressions',n:impr,c:['CPM',cpm]},
        {l:'Link clicks',n:clicks,r:v.ctr+'% CTR',c:['CPC',div(v.spend,clicks)]},
        {l:'Landing page views',n:lpv,r:v.lpvRate+'% of clicks',c:['Per page view',div(v.spend,lpv)]},
        {l:'Add to carts',n:atc,r:v.atcRate+'% of views',c:['Per add to cart',div(v.spend,atc)]},
        {l:'Checkouts started',n:ic,r:v.icRate+'% of carts',c:['Per checkout',div(v.spend,ic)]},
        {l:'Orders',n:units,r:v.buyRate+'% of checkouts',c:['CPA (ads only)',div(v.spend,units)]}
      ],
      cards:[
        {k:'Orders',v:num(units),s:'CPA '+inr(div(v.spend,units))},
        {k:'Revenue booked',v:inr(booked),s:'ROAS '+xx(roas)},
        {k:'Revenue kept after returns',v:inr(netRev),s:'Net ROAS '+xx(netRoas)},
        {k:'Contribution before ads',v:inr(contribution),s:inr(perOrder)+' per order',t:contribution>0?'':'bad'},
        {k:'Net profit',v:inr(net),s:'ROI '+pct(roi),t:net>=0?'good':'bad'},
        {k:'LTV : CAC',v:xx(ltvcac),s:'Total CPA '+inr(cac),t:ltvcac>=3?'good':ltvcac>=1?'warn':'bad'}
      ],
      more:[
        ['Cost per click (CPC)',inr(div(v.spend,clicks))],['Click → order rate',pct(clicks>0?units/clicks*100:0)],
        ['Orders delivered',num(delivered)],['Breakeven ROAS (ads only)',isFinite(beRoas)?xx(beRoas):'Not reachable'],
        ['Contribution per order',inr(perOrder)],['Cost per add to cart',inr(div(v.spend,atc))],
        ['Lifetime contribution per customer',inr(ltv)],['Net profit incl. repeat orders',inr(units*ltv-total)]
      ],
      pnl:[['Revenue kept (delivered orders)',netRev],['Product cost',-cogsCost],['Payment fees',-gate],['Shipping & packaging',-ship],['Meta ad spend',-v.spend],['Other monthly costs',-v.fixed]],
      note:v.rto>0?'Returns cut your revenue by '+inr(booked-netRev)+' while shipping is still paid on every order. Meta’s ROAS shows booked revenue, so your real return is the net ROAS above.':''
    };
  }
}};

/* ---------- plug in modules (js/door.js) ---------- */
const clone=x=>Array.isArray(x)?x.slice():(x&&typeof x==='object'?JSON.parse(JSON.stringify(x)):x);
const ENGINE={F,DROP,inr,num,pct,xx,div,P,cl,$,$$,toast,cap:s=>s.charAt(0).toUpperCase()+s.slice(1),
  scaled:(m,v,mult)=>scaledOf(m,v,mult),scenario:(m,v,k)=>scenarioOf(m,v,k),
  get market(){return globalThis.MABC_MARKET||null}};
if(typeof globalThis.MABC_DOOR==='function')MODELS.door=globalThis.MABC_DOOR(ENGINE);

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
  $$('.model').forEach(c=>c.setAttribute('aria-pressed',c.dataset.m===key?'true':'false'));
  shell();
  const g=$('.calc-grid'),rm=$('#res-main');g.classList.add('enter');rm.classList.add('fresh');
  update();
  setTimeout(()=>{g.classList.remove('enter');rm.classList.remove('fresh')},1800);
  if(scroll){const r=matchMedia('(prefers-reduced-motion:reduce)').matches;$('#calculator').scrollIntoView({behavior:r?'auto':'smooth',block:'start'})}
}
document.addEventListener('click',e=>{
  const p=e.target.closest('[data-pick]');
  if(p){e.stopPropagation();setModel(p.dataset.pick,true);return}
  const c=e.target.closest('.model');
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
      <div class="tabs" role="tablist" aria-label="Business model">
        ${Object.values(MODELS).map(x=>`<button class="tab" role="tab" data-tab="${x.key}" aria-selected="${x.key===cur}" style="--tc:${x.color}">${x.name}</button>`).join('')}
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
        <div class="actions">
          <button class="btn btn-green btn-sm" type="button" id="copy">Copy summary</button>
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
  if(t.id==='goal'){goal[cur]=parseFloat(t.value)||0;save();renderGoal();return}
  const id=t.dataset&&t.dataset.id;if(!id)return;
  const val=parseFloat(t.value);const n=isNaN(val)?0:Math.max(0,val);
  state[cur][id]=n;
  const peer=t.dataset.r?$('#f-'+id):$(`input[data-r][data-id="${id}"]`);
  if(peer&&peer!==t)peer.value=n;
  markCustom();
  save();schedule();
});
root.addEventListener('change',e=>{
  const t=e.target;
  if(t.tagName==='SELECT'&&t.dataset.opt){setOpt(t.dataset.opt,t.value);return}
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
    return `<div class="frow"><div class="fl">${s.l}${s.r?`<small>${s.r}</small>`:''}</div><div class="fbar" aria-hidden="true"><i data-w="${w}" style="width:${fresh?0:(oldBars[i]||0)}%;transition-delay:${fresh?i*70+300:0}ms"></i></div><div class="fv"><b>${num(s.n)}</b><small>${s.c[0]} ${inr(s.c[1])}</small></div></div>`}).join('');
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
    cards:`<div class="cards">${r.cards.map(c=>`<div class="card ${c.t||''}" data-k="${c.k}"><div class="k">${c.k}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join('')}</div>`,
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
  globalThis.__MABC_EXPOSE__({MODELS,state,inr,num,xx,pct,splitNum,fmtNum,zeroOf,tweenText,verdict,scaledOf,scenarioOf,ENGINE,
    open:function(k,vals){cur=k;load(k);if(vals)Object.assign(state[k],vals);shell();update();return{vals:state[k],summary:summaryText(),html:lastHtml}}});
}

/* ---------- scroll reveals ---------- */
(function(){
  const els=$$('.rv');
  if(RM.matches||!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
  document.documentElement.classList.add('js-rv');
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -5% 0px'});
  els.forEach(e=>io.observe(e));
})();
})();
