/* Door Manufacturer / Retailer module.
   Registers MODELS.door through globalThis.MABC_DOOR, which app.js calls with its engine helpers (E).
   Sections: options and fields, door economics (cost per door), compute (customer and dealer funnels),
   scenarios, result layout (forecast, KPIs, insights, economics, breakeven), target calculator, simulators. */
(function(){
'use strict';
globalThis.MABC_DOOR=function(E){
const {F,DROP,inr,num,pct,xx,div,P}=E;
const MK=()=>E.market;
const O=(id,label,type,options,def,group,help,x)=>Object.assign({kind:'opt',id,label,type,options,def,group,help},x||{});
const X=(f,x)=>Object.assign(f,x);
const C=(id,label,unit,def,group,help,x)=>X(F(id,label,unit,def,0,1e7,unit==='%'?0.5:1,group,help||''),Object.assign({c:1},x||{}));

/* ---------- lists ---------- */
const TYPES=[['flush','Flush door'],['laminated','Laminated door'],['veneer','Veneer door'],['membrane','Membrane door'],['wpc','WPC door'],['pvc','PVC door'],['mdf','MDF door'],['hdhmr','HDHMR door'],['solid','Solid wood door'],['teak','Teak door'],['main','Main door'],['bedroom','Bedroom door'],['pooja','Pooja door'],['designer','Designer door'],['fire','Fire rated door'],['bathroom','Bathroom door'],['office','Office door'],['commercial','Commercial door'],['custom','Custom door']];
const TNAME=Object.fromEntries(TYPES);
const LOCS=['Bengaluru','Karnataka','Chennai','Hyderabad','Mumbai','Pune','Delhi NCR','Kerala','Tamil Nadu','Telangana','Maharashtra','Pan India','Custom'];
const FIN=[['unfinished','Unfinished'],['laminate','Laminate'],['veneer','Veneer with polish'],['membrane','Membrane'],['pu','PU'],['duco','Duco'],['paint','Paint'],['natural','Natural oil / wax']];
const OBJ=[['leads','Generate customer leads'],['whatsapp','WhatsApp enquiries'],['website','Website leads'],['calls','Calls'],['instagram','Instagram enquiries'],['dealer','Dealer leads'],['arch','Architect / contractor leads']];
/* objective presets: typical click → enquiry rate, qualification rate and CPM uplift over the location CPM */
const OBJSET={
  leads:{lpConv:8,qualRate:50,cpmX:1,lab:'Enquiries (lead forms)'},
  whatsapp:{lpConv:12,qualRate:40,cpmX:1,lab:'WhatsApp enquiries'},
  website:{lpConv:4,qualRate:60,cpmX:1,lab:'Website leads'},
  calls:{lpConv:3,qualRate:65,cpmX:1,lab:'Calls'},
  instagram:{lpConv:9,qualRate:40,cpmX:1,lab:'Instagram enquiries'},
  dealer:{lpConv:6,tQual:40,cpmX:1.35,lab:'Dealer leads'},
  arch:{lpConv:5,tQual:35,cpmX:1.4,lab:'Architect and contractor leads'}
};
const TRADE_T=[['dealers','Dealers'],['architects','Architects'],['interior','Interior designers'],['builders','Builders'],['contractors','Contractors'],['plydealers','Plywood dealers'],['furniture','Furniture dealers'],['distributors','Distributors']];
const MATS=[['Ply','Plywood','ply',80],['Block','Blockboard','block',70],['Mdf','MDF','mdf',48],['Hdhmr','HDHMR','hdhmr',75],['Wpc','WPC','wpc',125],['Solid','Solid wood','solid',525],['Teak','Teak','teak',1600],['Other','Other','other',85]];

const isTrade=v=>v.objective==='dealer'||v.objective==='arch';
const adv=v=>v.mode!=='simple';
const mfgOn=v=>adv(v)&&v.biz!=='retail';
const retOn=v=>adv(v)&&v.biz!=='mfg';
const lamOn=v=>v.types.includes('laminated');
const locOf=v=>(MK()&&MK().locations[v.loc])||{price:1,cost:1,cpm:170};
const locName=v=>v.loc==='Custom'?(String(v.locName||'').trim()||'your area'):v.loc;

/* ---------- fields ---------- */
const G={biz:'Your door business',size:'Door size',price:'Selling price',simple:'Actual door cost',mix:'Product mix',
  raw:'Raw material',lam:'Laminate',lab:'Labour',oh:'Factory overhead',fin:'Finishing',hw:'Hardware',pk:'Packaging',tr:'Transportation',
  ret:'Buying and landed cost',inst:'Installation',oth:'Other costs',bud:'Meta Ads budget',camp:'Campaign',gen:'Lead generation',
  fun:'Customer funnel',tfun:'Dealer funnel'};
const fields=[
  O('mode','Detail level','seg',[['simple','Simple'],['advanced','Advanced']],'simple',G.biz,'',{show:()=>false}),
  O('biz','What type of door business do you operate?','cards',[['mfg','Manufacturer','I manufacture doors.'],['retail','Retailer / dealer','I purchase doors and sell them.'],['both','Manufacturer + retailer','I manufacture some doors and retail other products.']],'mfg',G.biz,'',{simple:1}),
  O('types','Door types you sell','chips',TYPES,['laminated'],G.biz,'Pick every type you sell. The market reference averages them.',{simple:1}),
  O('loc','Where do you sell?','select',LOCS.map(l=>[l,l]),'Bengaluru',G.biz,'Sets the typical CPM and the market reference for your area.',{simple:1}),
  O('locName','Location name','text',null,'',G.biz,'',{simple:1,show:v=>v.loc==='Custom'}),
  O('quality','Door quality','select',[['economy','Economy'],['standard','Standard'],['premium','Premium']],'standard',G.biz,'Used for the market reference.'),
  O('finish','Finish','select',FIN,'laminate',G.biz,'Used for the market reference.'),

  F('width','Door width','ft',3,1,6,0.25,G.size,'Most Indian doors are about 3 ft wide.'),
  F('height','Door height','ft',7,5,10,0.25,G.size,'Most doors are 7 ft high.'),
  F('thick','Door thickness','mm',32,20,60,1,G.size,'Common sizes are 30, 32 and 35 mm.'),

  O('priceMode','How do you price?','seg',[['sqft','Price per sq ft'],['door','Price per door']],'sqft',G.price),
  X(F('sellSqft','Selling price per sq ft','₹',320,50,5000,5,G.price,'What your customer pays per sq ft of door.'),{show:v=>v.priceMode==='sqft'}),
  X(F('sellDoor','Selling price per door','₹',6720,500,300000,100,G.price,'What your customer pays for one door, before GST.'),{simple:1,show:v=>v.mode==='simple'||v.priceMode==='door'}),

  X(F('simpleCost','Actual cost per door','₹',5100,300,300000,50,G.simple,'Everything one door costs you: making or buying it, delivery, any installation you pay for and commissions. Switch to Advanced to itemise it.'),{simple:1,show:v=>v.mode==='simple'}),

  X(F('mfgShare','Share of doors you manufacture','%',60,0,100,5,G.mix,'The rest are doors you buy and resell.'),{show:v=>adv(v)&&v.biz==='both'}),

  ...MATS.flatMap(([k,l,,rate])=>[C('m'+k,'rate','₹',rate,G.raw,'',{show:mfgOn}),C('q'+k,'quantity','sq ft',k==='Block'?21:0,G.raw,'',{show:mfgOn})]),
  X(F('waste','Material wastage','%',8,0,40,1,G.raw,'Offcuts and rejects, added on top of the material you enter.'),{show:mfgOn}),

  C('lamPrice','Laminate price per sheet','₹',850,G.lam,'',{show:v=>mfgOn(v)&&lamOn(v)}),
  C('lamSize','Sheet size','sq ft',32,G.lam,'An 8 × 4 ft sheet is 32 sq ft.',{show:v=>mfgOn(v)&&lamOn(v)}),
  C('lamSheets','Sheets per door','x',2,G.lam,'Both faces of the door.',{show:v=>mfgOn(v)&&lamOn(v)}),
  C('lamWaste','Laminate wastage','%',5,G.lam,'',{show:v=>mfgOn(v)&&lamOn(v)}),
  C('adhesive','Adhesive per door','₹',120,G.lam,'',{show:v=>mfgOn(v)&&lamOn(v)}),
  C('lamLabour','Laminating labour per door','₹',0,G.lam,'Only if it is not already under Labour.',{show:v=>mfgOn(v)&&lamOn(v)}),

  O('labourMode','How do you count labour?','seg',[['door','Per door'],['month','Monthly labour cost']],'door',G.lab,'',{show:mfgOn}),
  ...[['lbCut','Cutting',60],['lbPress','Pressing',80],['lbLam','Lamination',90],['lbEdge','Edge processing',60],['lbSand','Sanding',40],['lbFinish','Finishing',60],['lbCnc','CNC / carving',0],['lbAssy','Assembly',50],['lbQc','Quality check',20],['lbPack','Packing',30]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.lab,'Labour per door',{show:v=>mfgOn(v)&&v.labourMode==='door'})),
  X(F('lbMonthly','Monthly labour cost','₹',300000,0,5000000,5000,G.lab,'All factory wages for the month. Divided by the doors you produce (under Factory overhead).'),{show:v=>mfgOn(v)&&v.labourMode==='month'}),

  ...[['ohRent','Factory rent',60000],['ohPower','Electricity',25000],['ohMachine','Machine cost (EMI or lease)',30000],['ohMaint','Machine maintenance',8000],['ohDep','Depreciation',15000],['ohCons','Consumables',10000],['ohOther','Other factory expenses',7000]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.oh,'Per month',{show:mfgOn})),
  X(F('prod','Doors you produce per month','doors',600,10,20000,10,G.oh,'Monthly overhead and monthly labour are shared across these doors.'),{show:mfgOn}),

  ...[['fnPrimer','Primer',0],['fnPu','PU',0],['fnDuco','Duco',0],['fnMelamine','Melamine',0],['fnPolish','Polish',0],['fnPaint','Paint',0],['fnUv','UV coating',0],['fnOther','Other finishing',60]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.fin,'Per door',{show:mfgOn})),
  ...[['hwHandle','Handle',0],['hwLock','Lock',0],['hwHinge','Hinges',150],['hwStop','Door stopper',0],['hwBolt','Tower bolt',0],['hwOther','Other hardware',0]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.hw,'Per door. Leave at 0 if the customer buys hardware separately.',{show:mfgOn})),
  ...[['pkBubble','Bubble wrap',40],['pkBox','Cardboard',50],['pkCorner','Corner protection',20],['pkPlastic','Plastic',15],['pkStrap','Strapping',10],['pkOther','Other packaging',0]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.pk,'Per door',{show:mfgOn})),

  O('transMode','How do you count transport?','seg',[['trip','Cost per trip'],['door','Cost per door']],'trip',G.tr,'Enter 0 for legs you do not use.',{show:mfgOn}),
  ...[['trWh','Factory → warehouse',0],['trDealer','Factory → dealer',3000],['trCust','Factory → customer',0],['trLoad','Loading',500],['trUnload','Unloading',500],['trFuel','Fuel',0],['trDriver','Driver',0],['trVehicle','Vehicle',0]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.tr,'',{show:mfgOn})),
  C('trDoors','Doors per trip','doors',40,G.tr,'',{show:v=>mfgOn(v)&&v.transMode==='trip'}),

  C('rtBuy','Purchase price per door','₹',4600,G.ret,'What you pay your supplier.',{show:retOn}),
  C('rtDisc','Supplier discount','%',5,G.ret,'Taken off the purchase price.',{show:retOn}),
  C('rtTrans','Transportation','₹',120,G.ret,'Per door',{show:retOn}),
  C('rtLoad','Loading','₹',30,G.ret,'Per door',{show:retOn}),
  C('rtUnload','Unloading','₹',30,G.ret,'Per door',{show:retOn}),
  C('rtWh','Warehouse','₹',60,G.ret,'Per door',{show:retOn}),
  C('rtHandle','Handling','₹',40,G.ret,'Per door',{show:retOn}),
  C('rtComm','Sales commission','%',2,G.ret,'Of the selling price',{show:retOn}),
  C('rtDamage','Damage / returns','%',1.5,G.ret,'Of the selling price',{show:retOn}),
  C('rtOther','Other costs','₹',50,G.ret,'Per door',{show:retOn}),

  O('instPayer','Who pays for installation?','select',[['mfg','Manufacturer pays'],['customer','Customer pays'],['dealer','Dealer pays'],['none','No installation']],'customer',G.inst,'Installation is only counted as your cost when you are the one paying.',{show:adv}),
  ...[['inCarp','Carpenter',350],['inHelp','Helper',150],['inTravel','Travel',100],['inCons','Consumables',50],['inVisit','Site visit',100],['inFit','Installation charges',0]]
    .map(([id,l,d])=>C(id,l,'₹',d,G.inst,'Per door',{show:v=>adv(v)&&v.instPayer!=='none'})),

  ...[['ocSales','Sales commission','%',2],['ocDealer','Dealer commission','%',0],['ocArch','Architect commission','%',0],['ocContr','Contractor commission','%',0],['ocWarranty','Warranty provision','%',1],['ocDamage','Damage','%',1],['ocReturns','Returns','%',0.5],['ocReplace','Replacement','%',0.5],['ocAdmin','Administrative cost','₹',50],['ocMisc','Miscellaneous cost','₹',50]]
    .map(([id,l,u,d])=>C(id,l,u,d,G.oth,u==='%'?'Of the selling price':'Per door',{show:mfgOn})),

  X(F('spend','Monthly Meta Ads budget','₹',25000,5000,1000000,1000,G.bud,'What you plan to spend on Meta Ads each month.'),{simple:1}),
  X(F('fixed','Other monthly campaign costs','₹',0,0,500000,1000,G.bud,'Agency fee, creatives, tools. Leave at 0 if there are none.'),{show:adv}),

  O('objective','Campaign objective','select',OBJ,'leads',G.camp,'Changing it loads typical conversion and qualification rates for that objective.',{show:adv}),
  O('tradeTargets','Who are you targeting?','chips',TRADE_T,['dealers','architects'],G.camp,'',{show:v=>adv(v)&&isTrade(v)}),

  O('fmode','Forecast method','seg',[['auto','Automatic forecast'],['cpl','Manual CPL']],'auto',G.gen,'Automatic works from CPM, CTR and landing page conversion. Manual uses a CPL you already know.',{show:adv}),
  X(F('cpm','CPM (cost per 1,000 impressions)','₹',180,40,1000,5,G.gen,'Varies by city, audience and season. Check your last 30 days in Ads Manager.'),{show:v=>adv(v)&&v.fmode==='auto'}),
  X(F('ctr','Link click through rate (CTR)','%',1,0.1,5,0.1,G.gen,'Link clicks divided by impressions.'),{show:v=>adv(v)&&v.fmode==='auto'}),
  X(F('lpConv','Landing page conversion rate','%',8,0.5,40,0.5,G.gen,'Clicks that become an enquiry, chat, call or form.'),{show:v=>adv(v)&&v.fmode==='auto'}),
  X(F('cpl','Expected CPL (cost per lead)','₹',300,20,10000,10,G.gen,'What one lead costs you on Meta today.'),{show:v=>adv(v)&&v.fmode==='cpl'}),

  X(F('qualRate','Lead qualification rate','%',50,1,100,1,G.fun,'Leads with a real need, budget and location you serve.'),{show:v=>adv(v)&&!isTrade(v)}),
  X(F('quoteRate','Quotation rate','%',55,1,100,1,G.fun,'Qualified leads you send a quotation to.'),{show:v=>adv(v)&&!isTrade(v)}),
  X(F('visitRate','Site / showroom visit rate','%',55,1,100,1,G.fun,'Quotations that lead to a site measurement or showroom visit.'),{show:v=>adv(v)&&!isTrade(v)}),
  X(F('orderRate','Order conversion rate','%',35,1,100,1,G.fun,'Visits that turn into an order.'),{show:v=>adv(v)&&!isTrade(v)}),
  X(F('doorsPerOrder','Average doors per order','doors',4,1,60,0.5,G.fun,'A flat usually orders 4 to 8 doors. A single replacement is 1.'),{show:v=>adv(v)&&!isTrade(v)}),

  X(F('tQual','Qualified leads','%',40,1,100,1,G.tfun,'Real businesses in your territory with buying potential.'),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tMeet','Qualified → meeting','%',40,1,100,1,G.tfun,'Calls or visits held.'),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tSample','Meeting → sample / catalogue request','%',60,1,100,1,G.tfun,''),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tOnboard','Sample → dealer onboarded','%',35,1,100,1,G.tfun,'Agrees to stock or recommend your doors.'),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tFirst','Onboarded → first order','%',70,1,100,1,G.tfun,'Onboarded partners who place a first order this month.'),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tFirstDoors','Doors in a first order','doors',30,1,2000,1,G.tfun,''),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tRepeat','Repeat orders per year','x',4,0,52,1,G.tfun,''),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tRepeatDoors','Doors in a repeat order','doors',20,1,2000,1,G.tfun,''),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tYears','Years a dealer keeps buying','years',2,0.5,10,0.5,G.tfun,'Used for lifetime value.'),{show:v=>adv(v)&&isTrade(v)}),
  X(F('tDisc','Trade discount off your selling price','%',20,0,60,1,G.tfun,'Dealers buy below your retail price.'),{show:v=>adv(v)&&isTrade(v)}),
  DROP
];

/* ---------- door economics: cost per door ---------- */
const sum=(v,ids)=>ids.reduce((a,id)=>a+(+v[id]||0),0);
const LB=['lbCut','lbPress','lbLam','lbEdge','lbSand','lbFinish','lbCnc','lbAssy','lbQc','lbPack'];
const OH=['ohRent','ohPower','ohMachine','ohMaint','ohDep','ohCons','ohOther'];
const FN=['fnPrimer','fnPu','fnDuco','fnMelamine','fnPolish','fnPaint','fnUv','fnOther'];
const HW=['hwHandle','hwLock','hwHinge','hwStop','hwBolt','hwOther'];
const PK=['pkBubble','pkBox','pkCorner','pkPlastic','pkStrap','pkOther'];
const TR=['trWh','trDealer','trCust','trLoad','trUnload','trFuel','trDriver','trVehicle'];
const IN=['inCarp','inHelp','inTravel','inCons','inVisit','inFit'];
const LINE_LABEL={raw:'Raw material',lam:'Laminate',adh:'Adhesive',labour:'Labour',oh:'Factory overhead',fin:'Finishing',hw:'Hardware',pk:'Packaging',
  buy:'Purchase price (after discount)',wh:'Warehouse and handling',trans:'Transportation',inst:'Installation',comm:'Commission',misc:'Miscellaneous (warranty, damage, returns, admin)',all:'Door cost (all in)'};
const LINE_CAT={raw:'product',lam:'product',adh:'product',labour:'product',oh:'product',fin:'product',hw:'product',pk:'product',buy:'product',wh:'product',all:'product',trans:'transport',inst:'install',comm:'commission',misc:'other'};
function instCounts(v){return (v.instPayer==='mfg'&&v.biz!=='retail')||(v.instPayer==='dealer'&&v.biz!=='mfg')}
function priceOf(v){const area=v.width*v.height;return (v.mode==='simple'||v.priceMode==='door')?v.sellDoor:v.sellSqft*area}
function econ(v,price){
  const L={};let fixedPart=0;
  if(v.mode==='simple'){L.all=v.simpleCost}
  else{
    const s=v.biz==='mfg'?1:v.biz==='retail'?0:P(v.mfgShare);
    const lam=lamOn(v),prod=Math.max(v.prod,1);
    if(s>0){
      const raw=MATS.reduce((a,[k])=>a+(+v['m'+k]||0)*(+v['q'+k]||0),0)*(1+v.waste/100);
      const labourPD=v.labourMode==='month'?v.lbMonthly/prod:sum(v,LB);
      const oh=sum(v,OH)/prod;
      L.raw=s*raw;
      L.lam=s*(lam?v.lamPrice*v.lamSheets*(1+v.lamWaste/100):0);
      L.adh=s*(lam?v.adhesive:0);
      L.labour=s*(labourPD+(lam?v.lamLabour:0));
      L.oh=s*oh;
      L.fin=s*sum(v,FN);L.hw=s*sum(v,HW);L.pk=s*sum(v,PK);
      L.trans=s*(v.transMode==='trip'?sum(v,TR)/Math.max(v.trDoors,1):sum(v,TR));
      L.comm=s*price*(v.ocSales+v.ocDealer+v.ocArch+v.ocContr)/100;
      L.misc=s*(price*(v.ocWarranty+v.ocDamage+v.ocReturns+v.ocReplace)/100+v.ocAdmin+v.ocMisc);
      fixedPart=s*(oh+(v.labourMode==='month'?labourPD:0));
    }
    if(s<1){
      const r=1-s;
      L.buy=r*v.rtBuy*(1-v.rtDisc/100);
      L.wh=r*(v.rtWh+v.rtHandle);
      L.trans=(L.trans||0)+r*(v.rtTrans+v.rtLoad+v.rtUnload);
      L.comm=(L.comm||0)+r*price*v.rtComm/100;
      L.misc=(L.misc||0)+r*(price*v.rtDamage/100+v.rtOther);
    }
    L.inst=v.instPayer!=='none'&&instCounts(v)?sum(v,IN):0;
  }
  /* cost simulator overrides: replace a line, or scale the "other" bucket */
  const ov=v.__ov;
  if(ov)Object.keys(ov).forEach(k=>{
    if(k==='other'){const ks=otherKeys(L),t=ks.reduce((a,x)=>a+L[x],0);ks.forEach(x=>{L[x]=t>0?L[x]*ov.other/t:ov.other/ks.length})}
    else if(k in L)L[k]=ov[k];
  });
  const order=['all','raw','buy','lam','adh','labour','oh','fin','hw','pk','wh','trans','inst','comm','misc'];
  const lines=order.filter(k=>k in L).map(k=>({k,l:LINE_LABEL[k],val:L[k],cat:LINE_CAT[k]}));
  const cost=lines.reduce((a,x)=>a+x.val,0),gp=price-cost;
  const byCat=c=>lines.filter(x=>x.cat===c).reduce((a,x)=>a+x.val,0);
  return{lines,L,cost,gp,margin:price>0?gp/price*100:0,markup:cost>0?gp/cost*100:Infinity,
    contrib:price-(cost-fixedPart),fixedPart,product:byCat('product'),transport:byCat('transport'),install:byCat('install'),commission:byCat('commission'),other:byCat('other')};
}
const otherKeys=L=>['lam','adh','oh','hw','pk','wh','misc'].filter(k=>k in L&&!(k==='lam'));
/* keys the cost simulator exposes, in the order the spec lists them */
function simKeys(L){
  const k=[];
  if('raw' in L)k.push(['raw','Raw material']);
  if('buy' in L)k.push(['buy','Purchase price']);
  if('labour' in L)k.push(['labour','Labour']);
  if('lam' in L)k.push(['lam','Laminate']);
  if('fin' in L)k.push(['fin','Finishing']);
  if('trans' in L)k.push(['trans','Transport']);
  if('inst' in L)k.push(['inst','Installation']);
  if('comm' in L)k.push(['comm','Commission']);
  if(otherKeys(L).length)k.push(['other','Other costs']);
  if('all' in L)k.push(['all','Door cost (all in)']);
  return k;
}

/* ---------- compute ---------- */
function compute(v){
  const price=priceOf(v),ec=econ(v,price),trade=isTrade(v);
  const spend=v.spend,fixed=v.fixed;
  let impr=NaN,clicks=NaN,leads;
  if(v.fmode==='cpl'){leads=spend>0?spend/Math.max(v.cpl,1):0}
  else{const cpm=Math.max(v.cpm,1);impr=spend/cpm*1000;clicks=impr*P(v.ctr);leads=clicks*P(v.lpConv)}
  const cpl=div(spend,leads),leadLab=(OBJSET[v.objective]||OBJSET.leads).lab;
  const top=[
    {l:'Impressions',n:impr,c:['CPM',v.cpm]},
    {l:'Link clicks',n:clicks,r:v.ctr+'% CTR',c:['CPC',div(spend,clicks)]},
    {l:leadLab,n:leads,r:v.fmode==='cpl'?'from your CPL':v.lpConv+'% of clicks',c:['CPL',cpl]}
  ];
  if(trade)return computeTrade(v,price,ec,leads,cpl,impr,clicks,top);

  const qual=leads*P(v.qualRate),quotes=qual*P(v.quoteRate),visits=quotes*P(v.visitRate),orders=visits*P(v.orderRate),doors=orders*v.doorsPerOrder;
  const revenue=doors*price,doorCost=doors*ec.cost,gross=revenue-doorCost,net=gross-spend-fixed;
  const invest=doorCost+spend+fixed,total=spend+fixed;
  const roas=div(revenue,spend),profitRoas=spend>0?net/spend:NaN,roi=invest>0?net/invest*100:0;
  const cac=div(total,orders),gpOrder=ec.gp*v.doorsPerOrder;
  const be=breakeven(revenue,gross,leads,spend,fixed),beCpl=be.cpl,beRoas=be.roas;
  const x={trade:false,price,ec,impr,clicks,leads,cpl,qual,quotes,visits,orders,doors,revenue,doorCost,gross,invest,profitRoas,beCpl,beRoas,gpOrder,spend,fixed,leadLab};
  return{unit:'order',unitP:'orders',units:orders,leads,total,spend,revenue,net,roas,roasLabel:'Meta Ads ROAS',cac,limit:gpOrder,limitLabel:'Breakeven CAC',
    ltv:gpOrder,ltvcac:div(gpOrder,cac),roi,x,
    funnel:[...top,
      {l:'Qualified enquiries',n:qual,r:v.qualRate+'% of leads',c:['Per qualified',div(spend,qual)]},
      {l:'Quotations',n:quotes,r:v.quoteRate+'% of qualified',c:['Per quotation',div(spend,quotes)]},
      {l:'Site / showroom visits',n:visits,r:v.visitRate+'% of quotations',c:['Per visit',div(spend,visits)]},
      {l:'Orders',n:orders,r:v.orderRate+'% of visits',c:['CAC (ads only)',div(spend,orders)]},
      {l:'Doors sold',n:doors,r:num(v.doorsPerOrder)+' per order',c:['Ad cost per door',div(spend,doors)]}],
    cards:[
      {k:'Estimated leads',v:num(leads),s:'CPL '+inr(cpl)},
      {k:'Orders',v:num(orders),s:'Total CAC '+inr(cac)},
      {k:'Doors sold',v:num(doors),s:'at '+inr(price)+' per door'},
      {k:'Revenue',v:inr(revenue),s:'from '+num(doors)+' doors'},
      {k:'Meta Ads ROAS',v:xx(roas),s:'Breakeven '+(isFinite(beRoas)?xx(beRoas):'not reachable'),t:roas>=beRoas?'good':'bad'},
      {k:'Net campaign profit',v:inr(net),s:'Profit ROAS '+xx(profitRoas)+' · ROI '+pct(roi),t:net>=0?'good':'bad'}
    ],
    more:[
      ['Impressions',num(impr)],['Link clicks',num(clicks)],['Cost per click (CPC)',inr(div(spend,clicks))],['Cost per lead (CPL)',inr(cpl)],
      ['Cost per qualified enquiry',inr(div(spend,qual))],['Cost per quotation',inr(div(spend,quotes))],['Cost per site visit',inr(div(spend,visits))],
      ['Lead → order rate',pct(leads>0?orders/leads*100:0)],['Gross profit per door',inr(ec.gp)],['Contribution per door',inr(ec.contrib)],
      ['Cost of doors sold',inr(doorCost)],['Total investment',inr(invest)]
    ],
    pnl:[['Revenue from doors sold',revenue],['Making / buying the doors',-doors*ec.product],['Transportation',-doors*ec.transport],['Installation',-doors*ec.install],
      ['Commissions',-doors*ec.commission],['Other variable costs',-doors*ec.other],['Meta ad spend',-spend],['Other campaign costs',-fixed]],
    note:ec.gp<=0?'Each door costs more than it sells for. No ad budget can fix that: raise the price or cut cost first.':''
  };
}
function computeTrade(v,price,ec,leads,cpl,impr,clicks,top){
  const spend=v.spend,fixed=v.fixed,unit=v.objective==='arch'?'partner':'dealer',unitP=unit+'s';
  const tq=leads*P(v.tQual),meet=tq*P(v.tMeet),samp=meet*P(v.tSample),onb=samp*P(v.tOnboard),first=onb*P(v.tFirst);
  const tradePrice=price*(1-v.tDisc/100),tradeCost=ec.cost-ec.install-ec.commission,gpDoor=tradePrice-tradeCost;
  const firstDoors=first*v.tFirstDoors,firstRev=firstDoors*tradePrice,firstGp=firstDoors*gpDoor;
  const repOrders=first*v.tRepeat,repDoors=repOrders*v.tRepeatDoors,repRev=repDoors*tradePrice;
  const net=firstGp-spend-fixed,total=spend+fixed,invest=firstDoors*tradeCost+total;
  const roas=div(firstRev,spend),roas12=div(firstRev+repRev,spend),profitRoas=spend>0?net/spend:NaN,roi=invest>0?net/invest*100:0;
  const cac=div(total,first),firstVal=v.tFirstDoors*tradePrice,repVal=v.tRepeatDoors*tradePrice;
  const ltvDoors=v.tFirstDoors+v.tRepeat*v.tRepeatDoors*v.tYears,ltv=ltvDoors*gpDoor,ltvRev=ltvDoors*tradePrice;
  const limit=v.tFirstDoors*gpDoor,be=breakeven(firstRev,firstGp,leads,spend,fixed),beCpl=be.cpl,beRoas=be.roas;
  const x={trade:true,price,ec,impr,clicks,leads,cpl,tq,meet,samp,onb,first,doors:firstDoors,tradePrice,tradeCost,gpDoor,firstRev,repRev,repOrders,roas12,
    revenue:firstRev,doorCost:firstDoors*tradeCost,gross:firstGp,invest,profitRoas,beCpl,beRoas,gpOrder:limit,firstVal,repVal,ltv,ltvRev,spend,fixed,unit,unitP};
  return{unit,unitP,units:first,leads,total,spend,revenue:firstRev,net,roas,roasLabel:'ROAS (first orders)',cac,limit,limitLabel:'Breakeven CAC (first order)',
    ltv,ltvcac:div(ltv,cac),roi,x,
    funnel:[...top,
      {l:'Qualified leads',n:tq,r:v.tQual+'% of leads',c:['Per qualified',div(spend,tq)]},
      {l:'Meetings',n:meet,r:v.tMeet+'% of qualified',c:['Per meeting',div(spend,meet)]},
      {l:'Sample / catalogue requests',n:samp,r:v.tSample+'% of meetings',c:['Per request',div(spend,samp)]},
      {l:cap(unitP)+' onboarded',n:onb,r:v.tOnboard+'% of requests',c:['Per onboarding',div(spend,onb)]},
      {l:'First orders',n:first,r:v.tFirst+'% of onboarded',c:['CAC (ads only)',div(spend,first)]},
      {l:'Repeat orders (first year)',n:repOrders,r:v.tRepeat+' per '+unit+' a year',c:['Year one revenue',repRev]}],
    cards:[
      {k:'Trade leads',v:num(leads),s:cap(unit)+' CPL '+inr(cpl)},
      {k:'Meetings',v:num(meet),s:inr(div(spend,meet))+' each'},
      {k:cap(unitP)+' with a first order',v:num(first),s:cap(unit)+' CAC '+inr(cac)},
      {k:'First order revenue',v:inr(firstRev),s:'ROAS '+xx(roas)+' · year one '+xx(roas12)},
      {k:'Net profit this month',v:inr(net),s:'Profit ROAS '+xx(profitRoas)+' · ROI '+pct(roi),t:net>=0?'good':'bad'},
      {k:'Lifetime value per '+unit,v:inr(ltv),s:'LTV : CAC '+xx(div(ltv,cac)),t:div(ltv,cac)>=3?'good':div(ltv,cac)>=1?'warn':'bad'}
    ],
    more:[
      [cap(unit)+' CPL',inr(cpl)],[cap(unit)+' CAC',inr(cac)],['First order value',inr(firstVal)],['Repeat order value',inr(repVal)],
      ['Trade price per door',inr(tradePrice)],['Gross profit per door (trade)',inr(gpDoor)],['Lifetime revenue per '+unit,inr(ltvRev)],
      ['Repeat revenue, first year',inr(repRev)],['ROAS including first year repeats',xx(roas12)],['Total investment',inr(invest)]
    ],
    pnl:[['First order revenue',firstRev],['Cost of doors supplied',-firstDoors*tradeCost],['Meta ad spend',-spend],['Other campaign costs',-fixed]],
    note:gpDoor<=0?'At this trade discount each door sells below cost. Lower the discount or the cost first.':''
  };
}
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
/* Breakeven at this budget, holding margins: the ROAS (or CPL) at which net profit is exactly zero.
   net = μ·revenue − spend − fixed, with μ = gross profit ÷ revenue.
   ROAS needed = (spend + fixed) ÷ (μ·spend). CPL allowed = (gross profit per lead) × spend ÷ (spend + fixed). */
function breakeven(revenue,gross,leads,spend,fixed){
  const mu=revenue>0?gross/revenue:0;
  return{roas:mu>0&&spend>0?(spend+fixed)/(mu*spend):Infinity,
    cpl:leads>0&&spend>0&&gross>0?gross/leads*spend/(spend+fixed):0};
}

/* ---------- scenarios ---------- */
const RATE_C=['quoteRate','visitRate','orderRate','tMeet','tSample','tOnboard','tFirst'];
function scenario(kind,v){
  if(kind==='exp')return{...v};
  const c=kind==='cons'?{cpl:1.15,q:0.85,conv:0.9}:{cpl:0.9,q:1.1,conv:1.1};
  const o={...v,cpm:v.cpm*c.cpl,cpl:v.cpl*c.cpl};
  ['qualRate','tQual'].forEach(k=>o[k]=Math.min(100,v[k]*c.q));
  RATE_C.forEach(k=>o[k]=Math.min(100,v[k]*c.conv));
  return o;
}
const SN=['Conservative','Expected','Aggressive'];
function band(m,v){return['cons','exp','agg'].map(k=>m.compute(scenario(k,v)))}
const rnd=n=>!isFinite(n)?'n/a':Math.abs(n)<10?(Math.round(n*10)/10).toString():new Intl.NumberFormat('en-IN').format(Math.round(n));
function rng(sc,get,fmt){const a=sc.map(get).filter(isFinite);if(!a.length)return 'n/a';const lo=Math.min(...a),hi=Math.max(...a);const f=fmt||rnd;return f(lo)===f(hi)?f(lo):f(lo)+' to '+f(hi)}

/* ---------- market reference ---------- */
function thickF(v){const mk=MK(),b=mk?mk.baseThickness:32;return Math.min(1.5,Math.max(0.8,1+(v.thick-b)/b*0.6))}
function refPrice(v){
  const mk=MK();if(!mk)return null;
  const fm=(mk.finish[v.finish]||{m:1}).m,tf=thickF(v),area=v.width*v.height;
  const rs=v.types.map(t=>mk.lookup('door',t,v.loc,v.quality)).filter(Boolean);
  if(!rs.length)return null;
  const avg=k=>rs.reduce((a,r)=>a+r[k],0)/rs.length*fm*tf;
  const low=avg('low'),high=avg('high'),mid=(low+high)/2;
  return{low,high,mid,area,dLow:low*area,dHigh:high*area,dMid:mid*area,n:rs.length};
}
function costRef(v){
  const mk=MK();if(!mk)return null;
  const g=(c,k)=>mk.lookup(c,k,v.loc,v.quality);
  return{g,mat:Object.fromEntries(MATS.map(([k,,key])=>[k,g('material',key)])),lam:g('laminate','sheet'),adh:g('adhesive','door'),
    lab:g('labour','door'),pk:g('packaging','door'),tr:g('transport','door'),inst:g('installation','door'),hinge:g('hardware','hinge'),stop:g('hardware','stop'),bolt:g('hardware','bolt')};
}
const r5=(n,s)=>Math.round(n/s)*s;
function scaleTo(v,ids,target){const t=sum(v,ids);ids.forEach(id=>{v[id]=r5(t>0?v[id]*target/t:target/ids.length,5)})}

/* ---------- profit curve over budget (uses the scaling assumption) ---------- */
function curve(m,v,E){
  const pts=[];for(let i=0;i<=80;i++){const k=Math.pow(10,-2+i*0.05);pts.push([k,E.scaled(m,v,k).net])}
  let best=pts[0];pts.forEach(p=>{if(p[1]>best[1])best=p});
  const net=k=>E.scaled(m,v,k).net;
  const root=(a,b)=>{for(let i=0;i<60;i++){const c=(a+b)/2;(net(a)<0)===(net(c)<0)?a=c:b=c}return(a+b)/2};
  let lo=null,hi=null;
  if(best[1]>0){
    lo=net(0.0001)>=0?0:root(0.0001,best[0]);
    const last=pts[pts.length-1];
    hi=last[1]>=0?Infinity:root(best[0],pts.find(p=>p[0]>best[0]&&p[1]<0)[0]);
  }
  return{best,lo,hi};
}

/* ---------- verdict ---------- */
function verdict(r){
  const x=r.x;
  if(!(r.units>0))return{t:'bad',h:'No sales at these numbers',p:'Your inputs produce almost no '+r.unitP+'. Raise the budget or improve the funnel rates.'};
  if(x.trade){
    if(r.net>0)return{t:'good',h:'First orders already pay for the campaign',p:`Expected profit this month is ${inr(r.net)}, before any repeat orders. Each ${x.unit} is worth about ${inr(r.ltv)} in gross profit over time.`};
    if(r.ltvcac>=3)return{t:'warn',h:'Loses money this month, then repays it',p:`First orders leave you ${inr(-r.net)} short, but each ${x.unit} returns about ${xx(r.ltvcac)} their acquisition cost over time. Make sure you can fund the wait.`};
    return{t:'bad',h:'Not profitable at these numbers',p:`Each ${x.unit} costs ${inr(r.cac)} to win and returns ${inr(r.ltv)} in lifetime gross profit. Improve meetings and onboarding, or raise order size.`};
  }
  if(r.net>0)return{t:'good',h:'Profitable at these numbers',p:`Expected net profit is ${inr(r.net)} on ${inr(r.revenue)} of revenue. Your ROAS of ${xx(r.roas)} is above the ${xx(x.beRoas)} you need to break even.`};
  if(x.ec.gp<=0)return{t:'bad',h:'Each door loses money before ads',p:`A door sells for ${inr(x.price)} but costs ${inr(x.ec.cost)}. Fix price or cost before spending on ads.`};
  if(r.roas>=1)return{t:'bad',h:'Good ROAS, but the campaign still loses money',p:`Your ROAS is ${xx(r.roas)}, but each door leaves only ${inr(x.ec.gp)} (${pct(x.ec.margin)}) gross profit, so you need ${isFinite(x.beRoas)?xx(x.beRoas):'more than any ROAS'} to break even. Expected loss: ${inr(-r.net)}.`};
  return{t:'bad',h:'Not profitable at these numbers',p:`Revenue does not cover the ad spend yet. Improve lead quality and conversion, or lower your CPL below ${inr(x.beCpl)}.`};
}

/* ---------- result layout ---------- */
function forecastPanel(r,v,sc){
  const x=r.x,row=(l,e,rg,cls)=>`<tr><td>${l}</td><td class="${cls||''}"><b>${e}</b></td><td class="rngc">${rg||''}</td></tr>`;
  const X_=k=>s=>s.x[k];
  let rows;
  if(!x.trade)rows=[
    row('Monthly ad spend',inr(v.spend),''),
    row('Estimated leads',num(x.leads),rng(sc,X_('leads'))),
    row('Average CPL',inr(x.cpl),rng(sc,X_('cpl'),inr)),
    row('Qualified leads',num(x.qual),rng(sc,X_('qual'))),
    row('Quotations',num(x.quotes),rng(sc,X_('quotes'))),
    row('Site / showroom visits',num(x.visits),rng(sc,X_('visits'))),
    row('Orders',num(x.orders),rng(sc,X_('orders'))),
    row('Doors sold',num(x.doors),rng(sc,X_('doors'))),
    row('Average selling price',inr(x.price)+' / door',''),
    row('Revenue',inr(x.revenue),rng(sc,s=>s.revenue,inr)),
    row('ROAS',xx(r.roas),rng(sc,s=>s.roas,xx)),
    row('Total door cost',inr(x.doorCost),rng(sc,X_('doorCost'),inr)),
    row('Net profit',inr(r.net),rng(sc,s=>s.net,inr),r.net>=0?'good':'bad'),
    row('ROI',pct(r.roi),rng(sc,s=>s.roi,pct))];
  else rows=[
    row('Monthly ad spend',inr(v.spend),''),
    row('Trade leads',num(x.leads),rng(sc,X_('leads'))),
    row('Average CPL',inr(x.cpl),rng(sc,X_('cpl'),inr)),
    row('Qualified leads',num(x.tq),rng(sc,X_('tq'))),
    row('Meetings',num(x.meet),rng(sc,X_('meet'))),
    row('Sample / catalogue requests',num(x.samp),rng(sc,X_('samp'))),
    row(cap(x.unitP)+' onboarded',num(x.onb),rng(sc,X_('onb'))),
    row('First orders',num(x.first),rng(sc,X_('first'))),
    row('First order revenue',inr(x.firstRev),rng(sc,s=>s.revenue,inr)),
    row('ROAS (first orders)',xx(r.roas),rng(sc,s=>s.roas,xx)),
    row(cap(x.unit)+' CAC',inr(r.cac),rng(sc,s=>s.cac,inr)),
    row('Net profit this month',inr(r.net),rng(sc,s=>s.net,inr),r.net>=0?'good':'bad'),
    row('ROI',pct(r.roi),rng(sc,s=>s.roi,pct))];
  return `<div class="panel"><h3>Your door ads forecast</h3><div class="tscroll"><table class="fc"><thead><tr><th></th><th>Expected</th><th>Likely range</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <p class="note"><b>These are projections based on the assumptions entered and are not guaranteed Meta Ads results.</b> The likely range runs from the conservative to the aggressive scenario (higher or lower CPL, qualification and conversion).</p></div>`;
}
function kpiPanel(r){
  const x=r.x,per=n=>'₹'+(isFinite(n)?n.toFixed(2):'0');
  const pr=x.profitRoas;
  return `<div class="panel"><h3>ROAS, profit ROAS and ROI</h3><div class="kpi3">
    <div class="kpi"><span class="kk">Meta Ads ROAS</span><b class="kv">${xx(r.roas)}</b><span class="ks">${per(r.roas)} revenue generated for every ₹1 spent on Meta Ads.</span></div>
    <div class="kpi ${pr>=0?'good':'bad'}"><span class="kk">Profit ROAS</span><b class="kv">${xx(pr)}</b><span class="ks">${isFinite(pr)?(pr>=0?`${per(pr)} net profit for every ₹1 spent on Meta Ads.`:`Every ₹1 on Meta Ads loses ${per(-pr)} after all costs.`):'No ad spend entered.'}</span></div>
    <div class="kpi ${r.roi>=0?'good':'bad'}"><span class="kk">ROI</span><b class="kv">${pct(r.roi)}</b><span class="ks">Net profit ÷ everything spent: doors, ads and campaign costs (${inr(x.invest)}).</span></div>
  </div><p class="note">ROAS counts revenue, profit ROAS counts what is left after every cost, and ROI compares that profit with the full investment. A high ROAS alone does not mean the campaign is profitable${isFinite(x.beRoas)?`: at your margins you need at least ${xx(x.beRoas)} ROAS to break even`:''}.</p></div>`;
}
function insights(m,r,v){
  const x=r.x,li=[];
  li.push(`Your projected CPL is <b>${inr(x.cpl)}</b>. Your maximum profitable CPL is <b>${inr(x.beCpl)}</b>.`);
  li.push(`Your projected ${x.trade?x.unit+' ':''}CAC is <b>${inr(r.cac)}</b>. Your maximum profitable CAC is <b>${inr(r.limit)}</b>.`);
  li.push(`Your projected ROAS is <b>${xx(r.roas)}</b>. Your breakeven ROAS is <b>${isFinite(x.beRoas)?xx(x.beRoas):'not reachable'}</b>.`);
  const stages=x.trade
    ?[['tQual','Lead → qualified'],['tMeet','Qualified → meeting'],['tSample','Meeting → sample request'],['tOnboard','Sample → onboarded'],['tFirst','Onboarded → first order']]
    :[['qualRate','Lead → qualified'],['quoteRate','Qualified → quotation'],['visitRate','Quotation → site visit'],['orderRate','Site visit → order']];
  const w=stages.reduce((a,s)=>v[s[0]]<v[a[0]]?s:a);
  li.push(`Your largest funnel drop off is <b>${w[1]}</b>: only ${pct(v[w[0]])} move on.`);
  const to=Math.min(100,Math.round(v[w[0]]+10)),alt=m.compute({...v,[w[0]]:to}),gain=alt.units-r.units;
  if(gain>0)li.push(`Improving ${w[1].toLowerCase()} from ${pct(v[w[0]])} to ${pct(to)} could generate approximately <b>${rnd(gain)} additional ${r.unitP}</b> (${inr(alt.revenue-r.revenue)} more revenue) a month.`);
  li.push(`At your current assumptions, every ₹1 spent on Meta generates <b>₹${isFinite(r.roas)?r.roas.toFixed(2):'0'}</b> in revenue.`);
  if(!x.trade)li.push(`Each door leaves <b>${inr(x.ec.gp)}</b> gross profit (${pct(x.ec.margin)} margin) before ads.`);
  else li.push(`Each ${x.unit} is worth about <b>${inr(x.ltv)}</b> in lifetime gross profit, against a CAC of ${inr(r.cac)}.`);
  return `<div class="panel"><h3>Key insights</h3><ul class="ins">${li.map(t=>`<li>${t}</li>`).join('')}</ul></div>`;
}
function econPanel(r,v){
  const x=r.x,ec=x.ec,p=x.price;
  const lines=ec.lines.map(l=>`<tr><td>${l.l}</td><td>${inr(l.val)}</td><td class="sub">${pct(p>0?l.val/p*100:0)}</td></tr>`).join('');
  const t=`<div class="tscroll"><table><thead><tr><th>Cost per door</th><th>₹</th><th>Of price</th></tr></thead><tbody>${lines}
    <tr class="tot"><td>Total cost per door</td><td>${inr(ec.cost)}</td><td class="sub">${pct(p>0?ec.cost/p*100:0)}</td></tr></tbody></table></div>`;
  const prof=`<div class="more">
    <div><span>Selling price</span><b>${inr(p)}</b></div><div><span>Total cost per door</span><b>${inr(ec.cost)}</b></div>
    <div><span>Gross profit per door</span><b style="color:var(--${ec.gp>=0?'good':'bad'})">${inr(ec.gp)}</b></div><div><span>Gross margin</span><b>${pct(ec.margin)}</b></div>
    <div><span>Markup on cost</span><b>${pct(ec.markup)}</b></div><div><span>Contribution margin per door</span><b>${inr(ec.contrib)} (${pct(p>0?ec.contrib/p*100:0)})</b></div></div>`;
  const note=v.mode==='simple'?'Simple mode uses the one cost you entered. Switch to Advanced to itemise it.':
    `Factory overhead${v.labourMode==='month'?' and monthly labour':''} are fixed costs shared across ${num(v.prod)} doors a month; contribution margin leaves them out. `+
    (v.instPayer==='none'||!instCounts(v)?'Installation is not counted: '+(v.instPayer==='none'?'you do not install.':'someone else pays for it.'):'');
  return `<div class="panel"><h3>Door economics</h3>${t}<h4 class="h4">Profit per door</h4>${prof}<p class="note">${note}</p></div>`;
}
function waterfall(r){
  const x=r.x,ec=x.ec,L=ec.L,p=x.price;if(!(p>0))return '';
  const perDoorAds=x.doors>0?(x.spend+x.fixed)/x.doors:0;
  const oth=['lam','adh','oh','pk','wh','misc'].filter(k=>k in L);
  const steps=[['Door cost (all in)',L.all||0],['Raw material',L.raw||0],['Purchase price',L.buy||0],
    ['Labour',L.labour||0],['Finishing',L.fin||0],['Hardware',L.hw||0],['Transportation',L.trans||0],['Installation',L.inst||0],['Commission',L.comm||0],
    ['Other door costs',oth.reduce((a,k)=>a+L[k],0)],['Meta Ads and campaign costs',perDoorAds]
  ].filter(s=>s[1]>0);
  let left=p;const W=n=>Math.max(0,Math.min(100,n/p*100));
  const rows=[`<div class="wfr"><span>Selling price</span><div class="wft"><i class="wfp" style="left:0;width:100%"></i></div><b>${inr(p)}</b></div>`];
  steps.forEach(s=>{const from=left-s[1];rows.push(`<div class="wfr"><span>${s[0]}</span><div class="wft"><i style="left:${W(Math.max(from,0))}%;width:${W(Math.min(s[1],Math.max(left,0)))}%"></i></div><b>${inr(s[1])}</b></div>`);left=from});
  rows.push(`<div class="wfr tot"><span>Net profit per door</span><div class="wft"><i class="${left>=0?'wfg':'wfb'}" style="left:0;width:${W(Math.abs(left))}%"></i></div><b style="color:var(--${left>=0?'good':'bad'})">${inr(left)}</b></div>`);
  return `<div class="panel"><h3>Where each door's price goes</h3><div class="wf">${rows.join('')}</div><p class="note">Each bar is taken out of the selling price in turn. Meta Ads cost per door = (ad spend + campaign costs) ÷ doors sold${x.trade?' in first orders':''}. ${left<0?'The red bar is the loss per door.':''}</p></div>`;
}
function breakevenPanel(m,r,v,parts,E){
  const x=r.x,c=curve(m,v,E);
  const spendTxt=c.best[1]<=0?'None. Every budget loses money at these economics.':
    (c.hi===Infinity?`Above ${inr(v.spend*c.lo)}, with no ceiling found up to ${inr(v.spend*100)} at your ${v.drop}% scaling assumption.`:
    (v.spend*c.lo<1000?`Up to ${inr(v.spend*c.hi)} a month`:`${inr(v.spend*c.lo)} to ${inr(v.spend*c.hi)} a month`));
  const cmp=(a,b,lowGood)=>isFinite(a)&&isFinite(b)?(lowGood?a<=b:a>=b)?'good':'bad':'';
  return `<div class="panel"><h3>Breakeven analysis</h3>${parts.meterBody}
    <div class="more be">
      <div><span>Breakeven CPL<small>Maximum CPL you can afford</small></span><b>${inr(x.beCpl)}<small class="${cmp(x.cpl,x.beCpl,1)}">projected ${inr(x.cpl)}</small></b></div>
      <div><span>Breakeven CAC<small>Maximum cost to win ${x.trade?'a '+x.unit:'an order'}</small></span><b>${inr(r.limit)}<small class="${cmp(r.cac,r.limit,1)}">projected ${inr(r.cac)}</small></b></div>
      <div><span>Breakeven ROAS<small>Minimum ROAS to avoid a loss</small></span><b>${isFinite(x.beRoas)?xx(x.beRoas):'not reachable'}<small class="${cmp(r.roas,x.beRoas,0)}">projected ${xx(r.roas)}</small></b></div>
      <div><span>Maximum profitable ad spend<small>Includes your scaling assumption</small></span><b>${spendTxt}${c.best[1]>0?`<small>most profit near ${inr(v.spend*c.best[0])} (${inr(c.best[1])})</small>`:''}</b></div>
    </div></div>`;
}
function marketPanel(v){
  const mk=MK();if(!mk)return '';
  const q=(mk.quality[v.quality]||{}).label||'Standard';
  const rows=[];
  v.types.forEach(t=>{const r=mk.lookup('door',t,v.loc,v.quality);if(r)rows.push([r.row.label+' (selling price)',r])});
  [['material','ply'],['material','block'],['material','mdf'],['material','hdhmr'],['material','wpc'],['material','solid'],['material','teak'],['laminate','sheet'],['adhesive','door'],
   ['hardware','handle'],['hardware','lock'],['hardware','hinge'],['labour','door'],['finishing','pu'],['finishing','duco'],['finishing','polish'],['packaging','door'],['transport','door'],['transport','trip'],['installation','door']]
   .forEach(([c,k])=>{const r=mk.lookup(c,k,v.loc,v.quality);if(r)rows.push([r.row.label,r])});
  return `<div class="panel"><h3>Market reference data</h3><p class="note" style="margin:0 0 10px"><b>${mk.note}</b> Showing ${locName(v)}, ${q} quality. Edit <code>js/market.js</code> to replace these with your own supplier quotes.</p>
    <div class="tscroll"><table class="mref"><thead><tr><th>Item</th><th>Range</th><th>Unit</th><th>Source</th><th>Updated</th></tr></thead><tbody>${
    rows.map(([l,r])=>`<tr><td>${l}</td><td>${inr(r.low)} to ${inr(r.high)}</td><td>${r.row.unit}</td><td class="sub">${r.row.source}</td><td class="sub">${r.row.updated}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function layout(parts,r,v,E){
  const m=E.m,sc=band(m,v),a=adv(v);
  return [parts.verdict,parts.note,parts.cards,forecastPanel(r,v,sc),kpiPanel(r),insights(m,r,v),parts.funnel,
    r.x.trade?'':econPanel(r,v),waterfall(r),parts.pnl,breakevenPanel(m,r,v,parts,E),parts.scen,
    a?parts.scale:'',a?parts.more:'',a?marketPanel(v):''].join('');
}
function scenRows(r){
  const X_=k=>s=>s.x[k];
  if(r.x.trade)return[['Ad spend',s=>inr(s.spend)],['Leads',X_('leads'),'n'],['CPL',s=>inr(s.x.cpl)],['Qualified leads',X_('tq'),'n'],['Meetings',X_('meet'),'n'],
    [cap(r.x.unitP)+' onboarded',X_('onb'),'n'],['First orders',X_('first'),'n'],['First order revenue',s=>inr(s.revenue)],['ROAS',s=>xx(s.roas)],['Profit',s=>inr(s.net),1],['ROI',s=>pct(s.roi)]]
    .map(rw=>rw[2]==='n'?[rw[0],s=>rnd(rw[1](s))]:rw);
  return[['Ad spend',s=>inr(s.spend)],['Leads',s=>rnd(s.x.leads)],['CPL',s=>inr(s.x.cpl)],['Qualified leads',s=>rnd(s.x.qual)],['Quotations',s=>rnd(s.x.quotes)],
    ['Site visits',s=>rnd(s.x.visits)],['Orders',s=>rnd(s.x.orders)],['Doors sold',s=>rnd(s.x.doors)],['Revenue',s=>inr(s.revenue)],['ROAS',s=>xx(s.roas)],['Profit',s=>inr(s.net),1],['ROI',s=>pct(s.roi)]];
}

/* ---------- target calculator (doors, revenue, profit) ---------- */
const TK={doors:['I want to sell X doors','doors / month','doors'],dealers:['I want X new dealers','dealers / month','dealers'],revenue:['I want ₹X revenue','₹ / month','revenue'],profit:['I want ₹X profit','₹ / month','profit']};
const DEF_GOAL={kind:'doors',doors:50,dealers:3,revenue:1000000,profit:200000};
function kinds(v){return[isTrade(v)?'dealers':'doors','revenue','profit']}
function goalPanel(v,g){
  g=Object.assign({},DEF_GOAL,g&&typeof g==='object'?g:{});
  const ks=kinds(v),k=ks.includes(g.kind)?g.kind:ks[0],t=TK[k];
  return `<div class="panel" id="door-goal"><h3>Target calculator</h3>
    <div class="seg tgt" role="radiogroup" aria-label="Target type">${ks.map(x=>`<button type="button" role="radio" data-act="tgt" data-k="${x}" aria-checked="${x===k}">${TK[x][0]}</button>`).join('')}</div>
    <div class="goal-in"><label for="tgt">${k==='doors'?'I want to sell':k==='dealers'?'I want':'I want'}</label>
      <div class="inp">${k==='revenue'||k==='profit'?'<span class="u">₹</span>':''}<input id="tgt" data-tgt="${k}" type="number" inputmode="decimal" min="0" step="any" value="${g[k]}"><span class="u">${k==='revenue'||k==='profit'?'/ month':t[1]}</span></div></div>
    <div id="goal-out"></div></div>`;
}
function solve(m,v,E,get,T){
  const f=k=>get(E.scaled(m,v,k));
  let hi=1;for(let i=0;i<30&&f(hi)<T;i++)hi*=2;
  if(f(hi)<T)return null;
  let lo=0;for(let i=0;i<60;i++){const c=(lo+hi)/2;f(c)<T?lo=c:hi=c}
  return hi;
}
function renderGoal(E){
  const out=E.$('#goal-out');if(!out)return;
  const m=E.m,v=E.v,g=Object.assign({},DEF_GOAL,E.goal&&typeof E.goal==='object'?E.goal:{});
  const ks=kinds(v),k=ks.includes(g.kind)?g.kind:ks[0],T=+g[k],base=m.compute(v),x=base.x;
  if(!(T>0)){out.innerHTML='<p class="note">Enter a target above.</p>';return}
  if(!(base.units>0)){out.innerHTML='<p class="note">Your current inputs produce no '+base.unitP+', so a budget cannot be estimated.</p>';return}
  let mult;
  if(k==='profit'){
    const c=curve(m,v,E);
    if(c.best[1]<T){out.innerHTML=`<p class="note">That profit is not reachable at these numbers. The most you can make is about <b>${inr(c.best[1])}</b> a month, at a budget near ${inr(v.spend*c.best[0])}. Improve price, cost or conversion to aim higher.</p>`;return}
    let lo=0,hi=c.best[0];const f=kk=>E.scaled(m,v,kk).net;
    if(f(0.0001)>=T)hi=0.0001;else for(let i=0;i<60;i++){const cc=(lo+hi)/2;f(cc)<T?lo=cc:hi=cc}
    mult=hi;
  }else mult=solve(m,v,E,k==='revenue'?s=>s.revenue:k==='doors'?s=>s.x.doors:s=>s.units,T);
  if(mult===null){out.innerHTML='<p class="note">That target is out of reach even at a very large budget with your scaling assumption. Lower it or improve conversion.</p>';return}
  const s=E.scaled(m,v,mult),y=s.x,spend=v.spend*mult;
  const it=(l,val)=>isFinite(typeof val==='number'?val:1)?`<div><span>${l}</span><b>${typeof val==='number'?rnd(val):val}</b></div>`:'';
  let rows;
  if(!y.trade)rows=[it('Required ad spend',inr(spend)+' / month'),it('Required impressions',y.impr),it('Required clicks',y.clicks),it('Required leads',y.leads),
    it('Required qualified leads',y.qual),it('Required quotations',y.quotes),it('Required site visits',y.visits),it('Required orders (customers)',y.orders),
    it('Doors sold',y.doors),it('Revenue',inr(s.revenue)),it('Net profit',inr(s.net)),it('ROAS at that budget',xx(s.roas))];
  else rows=[it('Required ad spend',inr(spend)+' / month'),it('Required impressions',y.impr),it('Required clicks',y.clicks),it('Required leads',y.leads),
    it('Required qualified leads',y.tq),it('Required meetings',y.meet),it('Required sample requests',y.samp),it(cap(y.unitP)+' with a first order',y.first),
    it('First order revenue',inr(s.revenue)),it('Net profit this month',inr(s.net)),it('ROAS at that budget',xx(s.roas))];
  let extra='';
  if(k==='revenue'&&!y.trade){
    const needOrders=T/(x.price*v.doorsPerOrder),need=x.leads>0?needOrders/x.leads*100:Infinity,now=x.leads>0?x.orders/x.leads*100:0;
    extra=`<p class="note">Required ROAS: <b>${xx(div(T,spend))}</b>. Without raising the budget, you would need <b>${pct(need)}</b> of leads to become orders (now ${pct(now)}).</p>`;
  }
  out.innerHTML=`<div class="more">${rows.join('')}</div>${extra}<p class="note">${mult>1&&v.drop>0?'Includes cost inflation from spending '+xx(mult).replace('x','×')+' your current budget.':'Based on your current efficiency.'} These are projections, not guaranteed Meta Ads results.</p>`;
}

/* ---------- simulators (Advanced mode) ---------- */
const SIM={lq:{},price:null,cost:{}};
function simPanels(r,v){
  const x=r.x,lqIds=x.trade?[['tQual','Lead qualification'],['tMeet','Qualified → meeting'],['tFirst','Onboarded → first order']]:[['qualRate','Lead qualification'],['quoteRate','Quotation rate'],['orderRate','Order conversion']];
  const sl=(key,label,val,min,max,step,fmt)=>`<div class="simrow"><label for="s-${key}">${label} <b id="sv-${key}">${fmt(val)}</b></label><input id="s-${key}" type="range" data-sim="${key}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const lq=`<div class="panel"><h3>What if lead quality changes?</h3><p class="note" style="margin:0 0 12px">Cheap leads that never order can look good in Ads Manager. Move the sliders to see how quality changes the result.</p>
    ${lqIds.map(([id,l])=>sl('lq:'+id,l,SIM.lq[id]!==undefined?SIM.lq[id]:v[id],1,100,1,n=>n+'%')).join('')}
    <div id="sim-lq"></div><button type="button" class="btn btn-line btn-sm" data-act="simReset" data-s="lq">Reset to my inputs</button></div>`;
  const p=SIM.price!==null?SIM.price:Math.round(x.price),pmax=Math.max(6000,Math.ceil(x.price*1.5/500)*500);
  const pr=`<div class="panel"><h3>What if I change my selling price?</h3>
    ${sl('price','Selling price per door',p,3000,pmax,500,n=>inr(+n))}
    <div class="pchips">${[3000,3500,4000,4500,5000,5500,6000].map(n=>`<button type="button" class="chip" data-act="simPrice" data-p="${n}" aria-pressed="${p===n}">${inr(n)}</button>`).join('')}
      <label class="pcust">Custom <span class="inp"><span class="u">₹</span><input type="number" data-sim="priceC" min="0" step="50" value="${p}" aria-label="Custom selling price"></span></label></div>
    <div id="sim-price"></div><button type="button" class="btn btn-line btn-sm" data-act="simReset" data-s="price">Reset to my price</button></div>`;
  const keys=simKeys(x.ec.L);
  const cs=`<div class="panel"><h3>Cost simulator</h3><p class="note" style="margin:0 0 12px">Per door. Try a cheaper material, a new transporter or lower commissions.</p>
    ${keys.map(([k,l])=>{const base=k==='other'?otherKeys(x.ec.L).reduce((a,q)=>a+x.ec.L[q],0):x.ec.L[k];const val=SIM.cost[k]!==undefined?SIM.cost[k]:Math.round(base);
      return sl('cost:'+k,l,val,0,Math.max(500,Math.ceil(base*2.5/50)*50),10,n=>inr(+n))}).join('')}
    <div id="sim-cost"></div><button type="button" class="btn btn-line btn-sm" data-act="simReset" data-s="cost">Reset to my costs</button></div>`;
  return lq+pr+cs;
}
function simOut(m,v,E,which){
  const base=m.compute(v);
  const cmp=(rows,alt)=>`<div class="tscroll"><table class="simt"><thead><tr><th></th><th>Now</th><th>Simulated</th></tr></thead><tbody>${rows.map(([l,f,flag])=>
    `<tr><td>${l}</td><td>${f(base)}</td><td class="${flag?(alt.net>=0?'good':'bad'):''}"><b>${f(alt)}</b></td></tr>`).join('')}</tbody></table></div>`;
  if(which==='lq'){const alt=m.compute(Object.assign({},v,SIM.lq));const el=E.$('#sim-lq');if(el)el.innerHTML=cmp(base.x.trade?
    [[cap(base.unitP)+' with a first order',s=>rnd(s.units)],['First order revenue',s=>inr(s.revenue)],['ROAS',s=>xx(s.roas)],['Profit',s=>inr(s.net),1],['ROI',s=>pct(s.roi)]]:
    [['Orders',s=>rnd(s.units)],['Doors sold',s=>rnd(s.x.doors)],['Revenue',s=>inr(s.revenue)],['ROAS',s=>xx(s.roas)],['Profit',s=>inr(s.net),1],['ROI',s=>pct(s.roi)]],alt)}
  if(which==='price'){const p=SIM.price!==null?SIM.price:base.x.price;const alt=m.compute(Object.assign({},v,{priceMode:'door',sellDoor:p}));const el=E.$('#sim-price');if(el)el.innerHTML=cmp(
    [['Revenue',s=>inr(s.revenue)],['Gross profit',s=>inr(s.x.gross)],['Margin per door',s=>inr(s.x.ec.gp)+' ('+pct(s.x.ec.margin)+')'],['Breakeven ROAS',s=>isFinite(s.x.beRoas)?xx(s.x.beRoas):'n/a'],['Profit',s=>inr(s.net),1],['ROI',s=>pct(s.roi)]],alt)}
  if(which==='cost'){const alt=m.compute(Object.assign({},v,{__ov:Object.assign({},SIM.cost)}));const el=E.$('#sim-cost');if(el)el.innerHTML=cmp(
    [['Total door cost',s=>inr(s.x.ec.cost)],['Profit per door',s=>inr(s.x.ec.gp)],['Margin',s=>pct(s.x.ec.margin)],['Maximum CAC',s=>inr(s.limit)],['Breakeven ROAS',s=>isFinite(s.x.beRoas)?xx(s.x.beRoas):'n/a'],['Net profit',s=>inr(s.net),1]],alt)}
}
function renderSims(r,v,E){
  const box=E.$('#sims');if(!box)return;
  if(!adv(v)){box.innerHTML='';return}
  box.innerHTML=simPanels(r,v);['lq','price','cost'].forEach(w=>simOut(E.m,v,E,w));
}

/* ---------- derived displays (group notes and subtotals) ---------- */
function derived(v,r){
  const x=r.x,ec=x.ec,L=ec.L,d={},per=n=>inr(n)+' / door',area=v.width*v.height;
  const ref=refPrice(v),mk=MK();
  d['note:'+G.size]=`Door area = ${num(v.width)} × ${num(v.height)} = <b>${num(area)} sq ft</b>`;
  d['note:'+G.price]=`Average selling price <b>${inr(x.price)} / door</b>`+(v.mode!=='simple'&&v.priceMode==='sqft'?` (${num(area)} sq ft × ${inr(v.sellSqft)})`:'')+
    (ref?`<div class="ref"><b>Market reference:</b> ${inr(ref.dLow)} to ${inr(ref.dHigh)} per door (${inr(ref.low)} to ${inr(ref.high)} per sq ft) for ${v.types.map(t=>TNAME[t]).join(', ')} in ${locName(v)}.<br><i>${mk.note}</i> Not guaranteed pricing.<br><button type="button" class="btn btn-line btn-sm" data-act="mref">Use market reference</button></div>`:'');
  d['note:'+G.simple]=`Gross profit <b>${inr(ec.gp)} / door</b> (${pct(ec.margin)} margin)`;
  d['note:'+G.mix]=`Blended cost ${per(ec.cost)}`;
  const s=(k,n)=>{d['sub:'+k]=per(n)};
  if('raw' in L)s(G.raw,L.raw);
  if(lamOn(v))s(G.lam,(L.lam||0)+(L.adh||0));
  if('labour' in L){s(G.lab,L.labour);d['note:'+G.lab]=v.labourMode==='month'?`${inr(v.lbMonthly)} ÷ ${num(v.prod)} doors = <b>${per(v.lbMonthly/Math.max(v.prod,1))}</b>`:`Total labour <b>${per(L.labour)}</b>`}
  if('oh' in L){s(G.oh,L.oh);d['note:'+G.oh]=`${inr(sum(v,OH))} a month ÷ ${num(v.prod)} doors = <b>${per(sum(v,OH)/Math.max(v.prod,1))}</b>`}
  if('fin' in L)s(G.fin,L.fin);if('hw' in L)s(G.hw,L.hw);if('pk' in L)s(G.pk,L.pk);
  if(v.biz!=='retail'&&v.mode!=='simple'){const t=v.transMode==='trip'?sum(v,TR)/Math.max(v.trDoors,1):sum(v,TR);s(G.tr,t);
    d['note:'+G.tr]=v.transMode==='trip'?`${inr(sum(v,TR))} per trip ÷ ${num(v.trDoors)} doors = <b>${per(t)}</b>`:`<b>${per(t)}</b>`}
  if('buy' in L){const lc=v.rtBuy*(1-v.rtDisc/100)+v.rtTrans+v.rtLoad+v.rtUnload+v.rtWh+v.rtHandle+x.price*(v.rtComm+v.rtDamage)/100+v.rtOther;s(G.ret,lc);d['note:'+G.ret]=`Total landed cost <b>${per(lc)}</b>, gross profit <b>${per(x.price-lc)}</b> (${pct(x.price>0?(x.price-lc)/x.price*100:0)}) on resold doors, before installation.`}
  s(G.inst,sum(v,IN));d['note:'+G.inst]=v.instPayer==='none'?'No installation, so nothing is counted.':instCounts(v)?`Counted as your cost: <b>${per(sum(v,IN))}</b>`:'Not counted as your cost, because '+(v.instPayer==='customer'?'the customer pays.':v.instPayer==='dealer'?'the dealer pays.':'the manufacturer pays.');
  if(v.biz!=='retail'&&v.mode!=='simple')s(G.oth,(L.misc||0)+(L.comm||0));
  d['note:'+G.bud]=`<div class="pchips">${[10000,15000,25000,50000,100000].map(n=>`<button type="button" class="chip" data-spend="${n}" aria-pressed="${v.spend===n}">₹${new Intl.NumberFormat('en-IN').format(n)}</button>`).join('')}<button type="button" class="chip" data-act="customSpend" aria-pressed="${![10000,15000,25000,50000,100000].includes(v.spend)}">Custom</button></div>`;
  d['note:'+G.gen]=v.fmode==='cpl'?`${inr(v.spend)} ÷ ${inr(v.cpl)} = <b>${num(x.leads)} leads</b>`:`Impressions ${num(x.impr)} → clicks ${num(x.clicks)} → leads <b>${num(x.leads)}</b>. CPC ${inr(div(v.spend,x.clicks))}, CPL <b>${inr(x.cpl)}</b>.`;
  d['note:'+G.fun]=`${num(x.leads)} leads → ${num(x.qual)} qualified → ${num(x.quotes)} quotations → ${num(x.visits)} visits → ${num(x.orders)} orders → <b>${num(x.doors)} doors</b>`;
  d['note:'+G.tfun]=x.trade?`Trade price ${per(x.tradePrice)}, gross profit ${per(x.gpDoor)}. First order value <b>${inr(x.firstVal)}</b>, repeat order value <b>${inr(x.repVal)}</b>.`:'';
  d['note:'+G.camp]=isTrade(v)?'Dealer and architect campaigns use the B2B door lead funnel: leads, meetings, samples, onboarding, first and repeat orders.':`Funnel: ${(OBJSET[v.objective]||OBJSET.leads).lab.toLowerCase()} → qualified → quotation → site visit → order.`;
  return d;
}
const GROUPS={
  [G.size]:{note:1},[G.price]:{note:1},[G.simple]:{note:1},[G.mix]:{note:1},
  [G.raw]:{collapse:1,open:1,matrix:{cols:['₹ per sq ft','Sq ft per door'],rows:MATS.map(([k,l])=>[l,'m'+k,'q'+k])}},
  [G.lam]:{collapse:1,note:1},[G.lab]:{collapse:1,note:1},[G.oh]:{collapse:1,note:1},[G.fin]:{collapse:1},[G.hw]:{collapse:1},[G.pk]:{collapse:1},
  [G.tr]:{collapse:1,note:1},[G.ret]:{collapse:1,open:1,note:1},[G.inst]:{collapse:1,note:1},[G.oth]:{collapse:1},
  [G.bud]:{note:1},[G.camp]:{note:1},[G.gen]:{note:1},[G.fun]:{note:1},[G.tfun]:{note:1}
};

/* ---------- actions ---------- */
function applyObjective(v){
  const o=OBJSET[v.objective]||OBJSET.leads;
  v.cpm=r5(locOf(v).cpm*o.cpmX,5);v.lpConv=o.lpConv;if(o.qualRate)v.qualRate=o.qualRate;if(o.tQual)v.tQual=o.tQual;
}
const actions={
  mref(v){const r=refPrice(v);if(!r)return 'No market reference is available for these door types.';
    v.sellSqft=r5(r.mid,5);v.sellDoor=r5(r.dMid,50);
    return `Selling price set to the market reference midpoint: ${inr(v.sellDoor)} per door. It is indicative only; replace it with your real price.`},
  mcost(v){const c=costRef(v);if(!c)return false;const msgs=[];
    if(v.biz!=='retail'){
      MATS.forEach(([k])=>{if(c.mat[k])v['m'+k]=r5(c.mat[k].mid,1)});
      if(c.lam)v.lamPrice=r5(c.lam.mid,10);if(c.adh)v.adhesive=r5(c.adh.mid,5);
      if(c.lab){v.labourMode='door';scaleTo(v,LB,c.lab.mid)}
      if(c.pk)scaleTo(v,PK,c.pk.mid);
      if(c.hinge)v.hwHinge=r5(c.hinge.mid,5);
      if(c.tr){v.transMode='door';TR.forEach(id=>v[id]=0);v.trCust=r5(c.tr.mid,5)}
      const fm={pu:['fnPu','pu'],duco:['fnDuco','duco'],veneer:['fnPolish','polish'],paint:['fnPaint','paint']}[v.finish];
      if(fm){const f=c.g('finishing',fm[1]);if(f)v[fm[0]]=r5(f.mid*v.width*v.height,10)}
      msgs.push('material rates, laminate, adhesive, labour, hinges, packaging, delivery'+(fm?' and finishing':''));
    }
    if(v.biz!=='mfg'){const r=refPrice(v);if(r){v.rtBuy=r5(r.dMid*0.7,50);msgs.push('purchase price (assumed 30% below the retail reference)')}}
    if(c.inst)scaleTo(v,IN,c.inst.mid);
    return `Filled ${msgs.join(' and ')} and installation from the market reference for ${locName(v)}. Handle and lock were left as they are. Review each value.`},
  customSpend(v,E){const i=E.$('#f-spend');if(i){i.focus();i.select()}return false},
  tgt(v,E,el){const g=Object.assign({},DEF_GOAL,E.goal&&typeof E.goal==='object'?E.goal:{},{kind:el.dataset.k});E.setGoal(g);
    const box=E.$('#door-goal');if(box)box.outerHTML=goalPanel(v,g);renderGoal(Object.assign({},E,{goal:g}));return false},
  simReset(v,E,el){const s=el.dataset.s;if(s==='price')SIM.price=null;else SIM[s]={};renderSims(E.m.compute(v),v,E);return false},
  simPrice(v,E,el){SIM.price=+el.dataset.p;renderSims(E.m.compute(v),v,E);return false}
};
function simInput(t,E){
  const k=t.dataset.sim,val=+t.value,v=E.v;
  if(k.startsWith('lq:')){SIM.lq[k.slice(3)]=val;const b=E.$('#sv-'+CSS.escape(k));if(b)b.textContent=val+'%';simOut(E.m,v,E,'lq')}
  else if(k==='price'||k==='priceC'){if(!(val>0))return;SIM.price=val;const b=E.$('#sv-price');if(b)b.textContent=inr(val);
    if(k==='price'){const c=E.$('[data-sim="priceC"]');if(c)c.value=val}else{const s=E.$('#s-price');if(s)s.value=val}
    E.$$('[data-act="simPrice"]').forEach(c=>c.setAttribute('aria-pressed',String(+c.dataset.p===val)));simOut(E.m,v,E,'price')}
  else if(k.startsWith('cost:')){SIM.cost[k.slice(5)]=val;const b=E.$('#sv-'+CSS.escape(k));if(b)b.textContent=inr(val);simOut(E.m,v,E,'cost')}
}
function goalInput(t,E){
  const g=Object.assign({},DEF_GOAL,E.goal&&typeof E.goal==='object'?E.goal:{});g[t.dataset.tgt]=parseFloat(t.value)||0;g.kind=t.dataset.tgt;E.setGoal(g);renderGoal(Object.assign({},E,{goal:g}));
}
function onOpt(id,val,v){
  if(id==='loc'){const L=locOf(v),o=OBJSET[v.objective]||OBJSET.leads;v.cpm=r5(L.cpm*o.cpmX,5);
    return `CPM set to ${inr(v.cpm)}, a typical level for ${locName(v)}. ${adv(v)?'Edit it under Lead generation.':'Switch to Advanced to edit it.'}`}
  if(id==='objective'){applyObjective(v);const o=OBJSET[val];
    return `Loaded typical rates for ${o.lab.toLowerCase()}: ${v.lpConv}% of clicks become leads${isTrade(v)?'':', '+v.qualRate+'% qualify'}, CPM ${inr(v.cpm)}. Edit them if your numbers differ.`}
  if(id==='mode')return val==='advanced'?'Advanced mode: itemised door costs, funnel rates, simulators and market data.':'Simple mode: seven questions, the rest is estimated for you.';
  return '';
}
function formIntro(v){
  if(!adv(v))return `<div class="intro"><b>Simple mode.</b> Answer seven questions: business type, door type, location, selling price, actual door cost, Meta Ads budget and your target number of doors (in the Target calculator). Everything else uses typical values for ${locName(v)}.</div>`;
  return `<div class="intro"><b>Advanced mode.</b> Itemise your door cost and set every funnel rate. Every market reference value can be overridden.
    <button type="button" class="btn btn-line btn-sm" data-act="mcost">Fill costs from market reference</button></div>`;
}
function summary(r,v){
  const x=r.x,sc=band(this_,v),L=[];
  L.push(`Door business: ${{mfg:'Manufacturer',retail:'Retailer / dealer',both:'Manufacturer + retailer'}[v.biz]}, ${v.types.map(t=>TNAME[t]).join(', ')}, ${locName(v)}`);
  L.push(`Selling price ${inr(x.price)} per door, cost ${inr(x.ec.cost)}, gross profit ${inr(x.ec.gp)} (${pct(x.ec.margin)})`);
  L.push(`Estimated leads ${rng(sc,s=>s.x.leads)} · CPL ${rng(sc,s=>s.x.cpl,inr)} · ${x.trade?'first orders '+rng(sc,s=>s.x.first):'orders '+rng(sc,s=>s.x.orders)+' · doors '+rng(sc,s=>s.x.doors)}`);
  L.push(`Revenue ${rng(sc,s=>s.revenue,inr)} · ROAS ${rng(sc,s=>s.roas,xx)} · Net profit ${rng(sc,s=>s.net,inr)}`);
  L.push(`ROAS ${xx(r.roas)} · Profit ROAS ${xx(x.profitRoas)} · ROI ${pct(r.roi)} · Breakeven ROAS ${isFinite(x.beRoas)?xx(x.beRoas):'not reachable'} · Breakeven CPL ${inr(x.beCpl)}`);
  L.push('These are projections based on the assumptions entered and are not guaranteed Meta Ads results. Market reference prices are indicative only.');
  return L;
}

const this_={
  key:'door',name:'Door manufacturer / retailer',short:'Doors',color:'var(--green)',unit:'order',unitP:'orders',
  goal:DEF_GOAL,fields,groups:GROUPS,
  modes:[['simple','Simple'],['advanced','Advanced']],
  presets:[
    ['custom','Custom (my own numbers)',{}],
    ['factory','Flush and laminated door factory',{biz:'mfg',types:['flush','laminated'],priceMode:'sqft',sellSqft:300,objective:'leads',lpConv:8,qualRate:50,doorsPerOrder:5}],
    ['showroom','Door showroom / dealer',{biz:'retail',types:['laminated','membrane','designer'],priceMode:'door',sellDoor:9000,simpleCost:7200,rtBuy:6300,objective:'whatsapp',lpConv:12,qualRate:40,orderRate:30,doorsPerOrder:4}],
    ['premium','Premium main and teak doors',{types:['main','teak','pooja'],priceMode:'door',sellDoor:48000,simpleCost:33000,quality:'premium',finish:'natural',qualRate:45,orderRate:25,doorsPerOrder:1.5,cpm:200}],
    ['trade','Dealer and architect network',{biz:'mfg',objective:'dealer',cpm:245,lpConv:6,tQual:40,tFirstDoors:30,tRepeat:4,tRepeatDoors:20,tDisc:20}]
  ],
  compute,verdict,layout,scenario,scenNames:SN,scenRows,scenTitle:'Scenario planner',
  scenNote:'Conservative: CPL up 15%, qualification down 15%, every later conversion rate down 10%. Aggressive: CPL down 10%, qualification up 10%, conversion up 10%. Expected uses your inputs.',
  funnelTitle:'Your door Meta Ads funnel',
  goalPanel,renderGoal,goalInput,simInput,actions,onOpt,formIntro,derived,
  renderSims:true,after:(r,v,E)=>renderSims(r,v,E),
  summary:(r,v)=>summary(r,v)
};
return this_;
};
})();
