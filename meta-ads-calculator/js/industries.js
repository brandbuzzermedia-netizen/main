/* Industry definitions for the Meta Ads Calculator.
   Each industry has its own funnel stages, inputs, revenue model and cost engine (econ).
   The framework (js/framework.js) supplies the shared ad maths, ROAS / profit ROAS / ROI, breakeven,
   scenarios, goals, insights and validation. Doors live in js/door.js.

   Every default below is a starting placeholder so the calculator shows something on first load.
   None of them is a benchmark. Replace them with your own numbers (see js/benchmarks.js for references). */
(function(){
'use strict';
globalThis.MABC_MODULES=globalThis.MABC_MODULES||[];

/* ---------- icons (24px stroke paths) ---------- */
const I={
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  home:'<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  health:'<path d="M12 21s-7-4.4-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6C19 16.6 12 21 12 21z"/><path d="M12 10v5M9.5 12.5h5"/>',
  tooth:'<path d="M7 3c-2.5 0-4 2-4 4.5 0 3 1.5 4 2 7 .5 3 1 6.5 2.5 6.5S9.5 17 12 17s3 4 4.5 4 2-3.5 2.5-6.5c.5-3 2-4 2-7C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z"/>',
  book:'<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  rupee:'<path d="M6 3h12M6 8h12M6 13h3a6 5 0 0 0 0-10M9 13l8 8"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  sofa:'<path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0zM4 18v2M20 18v2"/>',
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  car:'<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M3 12h18"/>',
  rings:'<circle cx="9" cy="14" r="6"/><circle cx="15" cy="14" r="6"/><path d="M10 4l2-2 2 2"/>',
  briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  factory:'<path d="M2 20V9l6 4V9l6 4V4h8v16z"/><path d="M6 17h2M11 17h2M16 17h2"/>',
  tree:'<path d="M12 22v-6"/><path d="M12 2 5 12h4l-3 4h12l-3-4h4z"/>',
  door:'<path d="M3 21h18"/><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M14.5 12.5h.01"/>',
  bricks:'<rect x="2" y="4" width="20" height="16" rx="1"/><path d="M2 9.3h20M2 14.7h20M8 4v5.3M16 4v5.3M12 9.3v5.4M8 14.7V20M16 14.7V20"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  code:'<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  truck:'<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  shirt:'<path d="M20.4 6.6 16 3a4 4 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.3 1.3l1.7 3a1 1 0 0 0 1.3.4L8 10.5V21h8V10.5l1.7.8a1 1 0 0 0 1.3-.4l1.7-3a1 1 0 0 0-.3-1.3z"/>',
  sparkle:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  chair:'<path d="M6 3h12v8H6zM5 11h14v4H5zM7 15v6M17 15v6"/>',
  cpu:'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  gem:'<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9l4 12 4-12-3-6M2 9h20"/>',
  lamp:'<path d="M8 2h8l3 9H5zM12 11v8M8 21h8"/>',
  food:'<path d="M3 11h18a9 9 0 0 1-18 0zM7 7c0-2 2-2 2-4M12 7c0-2 2-2 2-4M17 7c0-2 2-2 2-4"/>',
  dumbbell:'<path d="M6.5 6.5v11M17.5 6.5v11M6.5 12h11M3 9v6M21 9v6"/>',
  megaphone:'<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  scale:'<path d="M12 3v18M5 21h14M3 7h18M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  calc:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/>',
  ruler:'<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  bulb:'<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
globalThis.MABC_ICONS=I;

/* ---------- dashboard catalogue ---------- */
globalThis.MABC_CATALOG=[
  {cat:'Lead generation businesses',items:[{key:'service'},{key:'realestate'},{key:'clinic'},{key:'education'},{key:'finance'},{key:'travel'},{key:'interior'},{key:'homeservices'},{key:'automotive'},{key:'wedding'}]},
  {cat:'B2B',items:[{key:'b2b'},{key:'manufacturing'},{key:'timber'},{key:'door',name:'Doors'},{key:'buildmat'},{key:'machinery'},{key:'saas'},{key:'wholesale'}]},
  {cat:'B2C / Ecommerce',items:[{key:'b2c'},{key:'d2c'},{key:'fashion'},{key:'beauty'},{key:'furniture'},{key:'electronics'},{key:'jewellery'},{key:'homedecor'},{key:'food'},{key:'fitness'}]},
  {cat:'Professional / local services',items:[{key:'agency'},{key:'legal'},{key:'accounting'},{key:'architecture'},{key:'photography'},{key:'salon'},{key:'fitness',name:'Gym / Fitness',alias:1},{key:'dental'},{key:'education',name:'Coaching',alias:1},{key:'consulting'}]},
  {cat:'Your own funnel',items:[{key:'custom'}]}
];

globalThis.MABC_MODULES.push(function(E){
const FW=globalThis.MABC_FRAMEWORK(E);
const {O,X,F,G}=FW,P=E.P,inr=E.inr,pct=E.pct,xx=E.xx,div=E.div,cnt=E.cnt;
const S=(id,l,r,def,help,x)=>Object.assign({id,l,r,def,help},x||{});
/* value input (price / ticket): varies in scenarios, asked in Simple mode */
const V=(id,label,def,help,x)=>X(F(id,label,'₹',def,0,1e10,100,G.eco,help||''),Object.assign({v:1,simple:1},x||{}));
/* economics number (margins, counts, months) */
const N=(id,label,unit,def,min,max,step,help,x)=>X(F(id,label,unit,def,min,max,step,G.eco,help||''),Object.assign({cost:1},x||{}));
/* cost line input (compact) */
const K=(id,label,unit,def,help,x)=>X(F(id,label,unit,def,0,1e9,unit==='%'?0.5:1,G.cost,help||''),Object.assign({c:1,cost:1},x||{}));
const pc=x=>P(x);
const pos=a=>Math.max(0,a||0);
const Ln=(l,a)=>[l,pos(a)];
const adv=v=>v.mode!=='simple';
const firstYearMonths=(churn)=>{let s=0,k=1;for(let t=0;t<12;t++){s+=k;k*=1-pc(churn)}return s};
const recurNote='Revenue in ROAS counts only the months you choose; lifetime value is shown separately.';

/* ecommerce style economics, shared by ecommerce, D2C, fashion, beauty, electronics, home decor (ecommerce mode) */
function ecom(v,c,o){
  o=o||{};const aov=v.aov*(1-pc(v.disc||0)),booked=c*aov,ret=booked*pc(v.rto||0),kept=booked-ret,refund=kept*pc(v.refund||0);
  const lines=[Ln('Returns and RTO (revenue lost)',ret),Ln('Refunds',refund),Ln('Product cost (COGS)',(kept-refund)*pc(v.cogs)),Ln('Shipping (every order, including returns)',c*(v.ship||0)),Ln('Payment gateway fees',(kept-refund)*pc(v.gateway||0))];
  if(v.warranty)lines.push(Ln('Warranty provision',(kept-refund)*pc(v.warranty)));
  return{booked,kept:kept-refund,aov,lines};
}

const specs=[
/* ===== LEAD GENERATION ===== */
{key:'service',name:'Service business',cat:'lead',icon:'phone',kind:'lead',unit:'customer',unitP:'customers',goal:30,
  flow:'Lead → Qualified → Appointment → Show up → Customer',desc:'Clinics, salons, consultants and local services that close through calls or visits.',
  ad:{spend:50000,cpm:180,ctr:1.2,lpConv:10},simpleAsk:'ticket size and margin',
  stages:[S('qualRate','Qualified leads','Lead qualification',60),S('apptRate','Appointments','Qualified lead → appointment',40),S('showRate','Show ups','Show rate',70),S('closeRate','Customers','Closing rate',35)],
  fields:[V('ticket','Average ticket size',15000,'What a new customer pays for the first sale.'),N('margin','Gross margin','%',60,0,100,1,'After the direct cost of delivering the service.',{simple:1}),
    K('salesComm','Sales commission','%',5,'Of revenue'),N('repeat','Purchases per customer over their lifetime','x',1.5,1,20,0.1,'For lifetime value.')],
  costTitle:'Cost engine: service delivery + sales commission',
  econ(v,c){const rev=c*v.ticket;return{revenue:rev,lines:[Ln('Service delivery',rev*(1-pc(v.margin))),Ln('Sales commission',rev*pc(v.salesComm))],ltv:v.ticket*(pc(v.margin)-pc(v.salesComm))*v.repeat}}},

{key:'realestate',name:'Real estate',cat:'lead',icon:'home',kind:'lead',unit:'sale',unitP:'sales',goal:5,
  flow:'Lead → Qualified → Site visit → Booking → Sale',desc:'Brokers, channel partners and developers selling property.',
  ad:{spend:100000,cpm:220,ctr:0.9,lpConv:7},simpleAsk:'property price and your commission',
  pre:[O('reMode','How do you earn?','seg',[['commission','Commission (broker / channel partner)'],['developer','Full sale price (developer)']],'commission',G.eco,'',{simple:1})],
  stages:[S('qualRate','Qualified leads','Lead qualification',30),S('visitRate','Site visits','Qualified lead → site visit',25),S('negoRate','Negotiations','Site visit → negotiation',40),S('bookRate','Bookings','Negotiation → booking',35),S('closeRate','Sales','Booking → registered sale',85)],
  fields:[V('price','Average property price',8000000,''),X(N('commission','Your commission','%',2,0,20,0.1,'Of the property price.'),{simple:1,show:v=>v.reMode!=='developer'}),
    X(N('devMargin','Developer gross margin','%',22,0,80,1,'After land and construction cost.'),{simple:1,show:v=>v.reMode==='developer'}),
    X(K('subBroker','Brokerage shared with sub brokers','%',20,'Of your commission'),{show:v=>adv(v)&&v.reMode!=='developer'}),
    X(K('cpBrokerage','Channel partner brokerage','%',2,'Of the sale price'),{show:v=>adv(v)&&v.reMode==='developer'}),
    K('incentive','Sales team incentives','%',10,'Of your revenue')],
  costTitle:'Cost engine: brokerage + sales team',beWhat:'brokerage and sales costs',
  econ(v,c,n){const dev=v.reMode==='developer',rev=dev?c*v.price:c*v.price*pc(v.commission);
    const lines=dev?[Ln('Land and construction cost',rev*(1-pc(v.devMargin))),Ln('Channel partner brokerage',rev*pc(v.cpBrokerage)),Ln('Sales team incentives',rev*pc(v.incentive))]:
      [Ln('Brokerage shared with sub brokers',rev*pc(v.subBroker)),Ln('Sales team incentives',rev*pc(v.incentive))];
    const sp=v.spend,st=n.counts;
    return{revenue:rev,lines,revLabel:dev?'full sale price':'your commission',
      extras:[['Average revenue per sale',inr(dev?v.price:v.price*pc(v.commission))],['Cost per site visit',inr(div(sp,st[1]))],['Cost per booking',inr(div(sp,st[3]))],['Revenue per lead',inr(div(rev,n.leads))]]}}},

{key:'clinic',name:'Healthcare / Clinic',cat:'lead',icon:'health',kind:'lead',unit:'patient',unitP:'patients',goal:60,
  flow:'Lead → Appointment → Show up → Patient → Treatment',desc:'Clinics and specialists earning from consultations and treatments.',
  ad:{spend:40000,cpm:170,ctr:1.1,lpConv:9},simpleAsk:'consultation fee and treatment value',
  stages:[S('apptRate','Appointments','Lead → appointment',40),S('showRate','Show ups','Show rate',70),S('patientRate','Patients','Show up → registered patient',90)],
  fields:[V('consultFee','Average consultation fee',700,''),V('treatValue','Average treatment value',9000,''),N('treatConv','Treatment conversion','%',35,0,100,1,'Patients who go on to a treatment.',{simple:1,rate:1}),
    N('repeatRate','Repeat treatment rate','%',30,0,300,1,'Extra treatments per treated patient, as a %.'),N('treatMargin','Treatment gross margin','%',55,0,100,1,'After consumables, doctor share and lab costs.'),K('consultCost','Consultation delivery cost','%',25,'Of consultation fees')],
  costTitle:'Cost engine: treatment delivery + consultation cost',
  econ(v,c){const tr=c*pc(v.treatConv)*(1+pc(v.repeatRate)),cr=c*v.consultFee,trr=tr*v.treatValue;
    return{revenue:cr+trr,lines:[Ln('Treatment delivery (consumables, doctor share)',trr*(1-pc(v.treatMargin))),Ln('Consultation delivery',cr*pc(v.consultCost))],
      extras:[['Treatments',cnt(tr)],['Revenue per patient',inr(c>0?(cr+trr)/c:0)]]}}},

{key:'education',name:'Education / Coaching',cat:'lead',icon:'book',kind:'lead',unit:'student',unitP:'students',goal:30,
  flow:'Lead → Qualified → Counselling → Show up → Enrollment',desc:'Institutes, courses and coaching sold through counselling calls.',
  ad:{spend:60000,cpm:150,ctr:1.3,lpConv:10},simpleAsk:'course price',
  stages:[S('qualRate','Qualified leads','Lead qualification',50),S('counselRate','Counselling calls booked','Counselling rate',50),S('showRate','Counselling attended','Show rate',60),S('enrollRate','Enrollments','Enrollment rate',20)],
  fields:[V('price','Course price',35000,''),N('upsellRate','Upsell rate','%',15,0,100,1,'Students who buy an add on.'),V('upsellValue','Upsell value',8000,'',{simple:0}),
    K('delivery','Course delivery cost','%',30,'Faculty, platform, material, as % of revenue'),K('counsellor','Counsellor incentive','%',5,'Of revenue')],
  costTitle:'Cost engine: course delivery + counsellor incentives',
  econ(v,c){const base=c*v.price,up=c*pc(v.upsellRate)*v.upsellValue,rev=base+up;
    return{revenue:rev,lines:[Ln('Course delivery',rev*pc(v.delivery)),Ln('Counsellor incentives',rev*pc(v.counsellor))],extras:[['Upsell revenue',inr(up)],['Revenue per student',inr(div(rev,c))]]}}},

{key:'finance',name:'Finance / Insurance',cat:'lead',icon:'rupee',kind:'lead',unit:'customer',unitP:'customers',goal:40,
  flow:'Lead → Qualified → Application → Approval → Customer',desc:'Loans, insurance, cards and investment products earning a commission.',
  ad:{spend:50000,cpm:200,ctr:0.9,lpConv:8},simpleAsk:'revenue per customer',
  pre:[O('product','Product','select',[['loans','Loans'],['insurance','Insurance'],['cards','Credit cards'],['invest','Investments']],'loans',G.eco,'Recorded in the report.',{show:v=>v.mode!=='simple'})],
  stages:[S('qualRate','Qualified leads','Lead qualification',40),S('appRate','Applications','Qualified → application',45),S('approveRate','Approvals','Approval rate',60),S('convRate','Customers','Approval → customer',85)],
  fields:[V('revPer','Average commission / revenue per customer',7000,''),K('payout','Sub agent / DSA payout','%',20,'Of revenue'),K('processing','Processing cost per customer','₹',600,'Documentation, verification')],
  costTitle:'Cost engine: agent payouts + processing',
  econ(v,c){const rev=c*v.revPer;return{revenue:rev,lines:[Ln('Sub agent / DSA payouts',rev*pc(v.payout)),Ln('Processing',c*v.processing)]}}},

{key:'travel',name:'Travel / Hospitality',cat:'lead',icon:'plane',unit:'booking',unitP:'bookings',goal:30,
  kind:v=>v.sub==='hotel'?'order':'lead',
  flow:'Enquiry → Quotation → Booking, or visit → booking → guest',desc:'Travel agencies and tour operators, or hotels and homestays taking direct bookings.',
  ad:{spend:50000,cpm:170,ctr:1.2,lpConv:9},simpleAsk:'booking value and margin',
  pre:[O('sub','Business type','seg',[['travel','Travel agency / tours'],['hotel','Hotel / homestay']],'travel',G.eco,'',{simple:1})],
  stageDefs:[S('tqual','Qualified enquiries','Enquiry qualification',50,'',{show:v=>v.sub!=='hotel'}),S('tquote','Quotations','Qualified → quotation',60,'',{show:v=>v.sub!=='hotel'}),S('tbook','Bookings','Booking conversion',20,'',{show:v=>v.sub!=='hotel'}),
    S('hvisit','Website visits','Clicks that load your booking page',80,'',{show:v=>v.sub==='hotel'}),S('hbook','Bookings','Visit → booking',3,'',{show:v=>v.sub==='hotel'})],
  stages(v){return v.sub==='hotel'?[S('hvisit','Website visits'),S('hbook','Bookings'),{id:'hcancel',l:'Stays (after cancellations)',nofield:1,get:v=>100-v.hcancel,set:(v,x)=>{v.hcancel=100-x}}]:[S('tqual','Qualified enquiries'),S('tquote','Quotations'),S('tbook','Bookings')]},
  fields:[X(V('bookingValue','Average booking value',55000,''),{show:v=>v.sub!=='hotel'}),X(N('tmargin','Gross margin','%',12,0,100,0.5,'After paying hotels, airlines and suppliers.',{simple:1}),{show:v=>v.sub!=='hotel'}),
    X(V('roomRate','Average room rate per night',4500,''),{show:v=>v.sub==='hotel'}),X(N('nights','Average stay','nights',2,1,30,0.5,''),{show:v=>v.sub==='hotel'}),
    X(N('roomsPer','Rooms per booking','x',1.2,1,20,0.1,''),{show:v=>v.sub==='hotel'}),X(N('guestsPer','Guests per booking','x',2,1,20,0.5,''),{show:v=>v.sub==='hotel'}),
    X(N('hcancel','Cancellation rate','%',12,0,90,1,'Bookings cancelled before the stay.',{simple:1,rate:0}),{show:v=>v.sub==='hotel'}),
    X(V('extraRev','Additional revenue per guest',900,'Food, spa, transfers.',{simple:0}),{show:v=>v.sub==='hotel'}),
    X(N('roomsAvail','Rooms available','rooms',30,1,5000,1,'For the capacity check.'),{show:v=>adv(v)&&v.sub==='hotel'}),X(N('occupancy','Current occupancy','%',60,0,100,1,'Without these ads.'),{show:v=>adv(v)&&v.sub==='hotel'}),
    X(K('roomCost','Cost per room night','%',30,'Housekeeping, amenities, utilities, as % of room revenue'),{show:v=>v.sub==='hotel'}),K('gateway','Payment gateway fees','%',1.5,'Of revenue')],
  costTitle:'Cost engine: supplier cost or room costs + payment fees',
  econ(v,c){
    if(v.sub==='hotel'){const nights=c*v.nights*v.roomsPer,room=nights*v.roomRate,extra=c*v.guestsPer*v.extraRev,rev=room+extra,spare=v.roomsAvail*30.4*(1-pc(v.occupancy));
      return{revenue:rev,lines:[Ln('Room costs',room*pc(v.roomCost)),Ln('Payment gateway fees',rev*pc(v.gateway))],
        extras:[['Room nights',cnt(nights)],['Room revenue',inr(room)],['Additional guest revenue',inr(extra)],['Spare room nights this month',cnt(spare)]],
        warn:nights>spare?[`These bookings need ${cnt(nights)} room nights but only about ${cnt(spare)} are free at ${pct(v.occupancy)} occupancy. Revenue above capacity is not achievable.`]:[]}}
    const rev=c*v.bookingValue;return{revenue:rev,lines:[Ln('Supplier cost (hotels, flights, transport)',rev*(1-pc(v.tmargin))),Ln('Payment gateway fees',rev*pc(v.gateway))]}}},

{key:'interior',name:'Interior design',cat:'lead',icon:'sofa',kind:'lead',unit:'project',unitP:'projects',goal:4,
  flow:'Lead → Consultation → Site visit → Quotation → Project',desc:'Interior designers and home interior firms.',
  ad:{spend:60000,cpm:230,ctr:0.9,lpConv:6},simpleAsk:'project value and margin',
  stages:[S('qualRate','Qualified leads','Lead qualification',40),S('consultRate','Consultations','Qualified → consultation',50),S('siteRate','Site visits','Consultation → site visit',60),S('quoteRate','Quotations','Site visit → quotation',70),S('closeRate','Projects','Closing rate',15)],
  fields:[V('projectValue','Average project value',900000,''),N('margin','Gross margin','%',25,0,100,1,'After materials, vendors and site execution.',{simple:1}),K('comm','Sales / referral commission','%',3,'Of revenue')],
  costTitle:'Cost engine: materials and execution + commission',
  econ(v,c){const rev=c*v.projectValue;return{revenue:rev,lines:[Ln('Materials, vendors and execution',rev*(1-pc(v.margin))),Ln('Sales / referral commission',rev*pc(v.comm))]}}},

{key:'homeservices',name:'Home services',cat:'lead',icon:'wrench',kind:'lead',unit:'job',unitP:'jobs',goal:100,
  flow:'Lead → Qualified → Booking → Service completed',desc:'Plumbing, electrical, cleaning, pest control, AC repair, painting, renovation.',
  ad:{spend:25000,cpm:150,ctr:1.3,lpConv:11},simpleAsk:'job value and service cost',
  pre:[O('service','Service','select',[['plumbing','Plumbing'],['electrical','Electrical'],['cleaning','Cleaning'],['pest','Pest control'],['ac','AC repair'],['painting','Painting'],['renovation','Renovation']],'ac',G.eco,'Recorded in the report.',{simple:1})],
  stages:[S('qualRate','Qualified leads','Lead qualification',70),S('bookRate','Bookings','Qualified → booking',50),S('completeRate','Jobs completed','Completion rate',90)],
  fields:[V('jobValue','Average job value',2200,''),X(N('serviceCost','Service cost per job','₹',1100,0,1e7,10,'Technician, materials, travel.',{simple:1}),{cost:1}),K('platform','Platform / lead commission','%',0,'Of revenue'),
    N('repeat','Repeat jobs per customer (a year)','x',0.8,0,20,0.1,'For lifetime value.')],
  costTitle:'Cost engine: service cost + platform commission',
  econ(v,c){const rev=c*v.jobValue,sc=c*v.serviceCost,pl=rev*pc(v.platform);return{revenue:rev,lines:[Ln('Service cost (technician, materials, travel)',sc),Ln('Platform commission',pl)],ltv:(v.jobValue*(1-pc(v.platform))-v.serviceCost)*(1+v.repeat)}}},

{key:'automotive',name:'Automotive',cat:'lead',icon:'car',kind:'lead',unit:'sale',unitP:'sales',goal:10,
  flow:'Lead → Qualified → Test drive / appointment → Purchase',desc:'Dealerships, used cars, service centres, detailing and accessories.',
  ad:{spend:80000,cpm:200,ctr:1,lpConv:7},simpleAsk:'price and margin',
  pre:[O('seg','Segment','select',[['new','New car dealership'],['used','Used cars'],['service','Car service'],['detailing','Detailing'],['accessories','Accessories']],'new',G.eco,'Sales segments use vehicle price; service segments use service value.',{simple:1})],
  stages:[S('qualRate','Qualified leads','Lead qualification',40),S('testRate','Test drives / appointments','Qualified → test drive or appointment',35),S('buyRate','Purchases','Purchase rate',20)],
  fields:[X(V('vehiclePrice','Average vehicle price',850000,''),{show:v=>v.seg==='new'||v.seg==='used'}),X(N('dealerMargin','Dealer margin','%',5,0,50,0.5,'',{simple:1}),{show:v=>v.seg==='new'||v.seg==='used'}),
    X(V('serviceValue','Average service / job value',5500,''),{show:v=>v.seg!=='new'&&v.seg!=='used'}),X(N('serviceMargin','Service margin','%',45,0,100,1,'',{simple:1}),{show:v=>v.seg!=='new'&&v.seg!=='used'}),
    K('incentive','Sales incentive per sale','₹',2500,'')],
  onOpt(id,val,v){if(id==='seg'){const sale=val==='new'||val==='used';v.testRate=sale?35:60;v.buyRate=sale?20:70;return sale?'Loaded vehicle sale rates. Edit them if yours differ.':'Loaded service rates: 60% book an appointment, 70% of those buy. Edit them if yours differ.'}},
  costTitle:'Cost engine: vehicle or service cost + incentives',
  econ(v,c){const sale=v.seg==='new'||v.seg==='used',val=sale?v.vehiclePrice:v.serviceValue,m=sale?v.dealerMargin:v.serviceMargin,rev=c*val;
    return{revenue:rev,lines:[Ln(sale?'Vehicle cost':'Parts and labour',rev*(1-pc(m))),Ln('Sales incentives',c*v.incentive)]}}},

{key:'wedding',name:'Wedding / Events',cat:'lead',icon:'rings',kind:'lead',unit:'booking',unitP:'bookings',goal:5,
  flow:'Lead → Qualified → Meeting → Quotation → Booking',desc:'Wedding planners, venues, decorators and event companies.',
  ad:{spend:40000,cpm:170,ctr:1.1,lpConv:8},simpleAsk:'package price and margin',
  stages:[S('qualRate','Qualified leads','Lead qualification',35),S('meetRate','Meetings','Qualified → meeting',45),S('quoteRate','Quotations','Meeting → quotation',70),S('bookRate','Bookings','Booking rate',20)],
  fields:[V('packagePrice','Average package price',300000,''),N('margin','Gross margin','%',30,0,100,1,'After vendors, decor, staff.',{simple:1}),K('comm','Vendor / planner commission','%',5,'Of revenue')],
  costTitle:'Cost engine: vendors and staff + commission',
  econ(v,c){const rev=c*v.packagePrice;return{revenue:rev,lines:[Ln('Vendors, decor and staff',rev*(1-pc(v.margin))),Ln('Commission',rev*pc(v.comm))]}}},

/* ===== B2B ===== */
{key:'b2b',name:'B2B products',cat:'b2b',icon:'briefcase',kind:'lead',unit:'customer',unitP:'customers',goal:3,
  flow:'Lead → MQL → SQL → Meeting → Opportunity → Customer',desc:'Businesses selling products to other businesses through a sales team.',
  ad:{spend:100000,cpm:350,ctr:0.8,lpConv:7},simpleAsk:'deal size and margin',
  stages:[S('mqlRate','MQLs','Lead qualification (lead → MQL)',40),S('sqlRate','SQLs','MQL → SQL',40),S('meetRate','Meetings','SQL → meeting',60),S('oppRate','Opportunities','Meeting → opportunity',50),S('closeRate','Customers','Closing rate',25)],
  fields:[X(V('productPrice','Product price (per unit)',25000,'Used to show units per deal.'),{simple:0}),V('dealSize','Average deal size',300000,''),N('margin','Gross margin','%',40,0,100,1,'After product and delivery cost.',{simple:1}),
    K('comm','Sales commission','%',5,'Of revenue'),N('cycle','Sales cycle','days',45,1,720,1,'Revenue from this month lands roughly this many days later.')],
  costTitle:'Cost engine: product cost + sales commission',
  econ(v,c,n){const rev=c*v.dealSize;return{revenue:rev,lines:[Ln('Product and delivery cost',rev*(1-pc(v.margin))),Ln('Sales commission',rev*pc(v.comm))],
    extras:[['Pipeline value (opportunities × deal size)',inr(n.counts[3]*v.dealSize)],['Units per deal',E.num(div(v.dealSize,v.productPrice))],['Revenue lands after',v.cycle+' days']]}}},

{key:'manufacturing',name:'Manufacturing',cat:'b2b',icon:'factory',kind:'lead',unit:'order',unitP:'orders',goal:6,
  flow:'Lead → Qualified → Enquiry → Quotation → Negotiation → Order',desc:'Manufacturers winning orders from business buyers.',
  ad:{spend:75000,cpm:280,ctr:0.9,lpConv:7},simpleAsk:'order value and manufacturing cost',
  stages:[S('qualRate','Qualified leads','Lead qualification',40),S('enqRate','Enquiries with specs','Qualified → enquiry',60),S('quoteRate','Quotations','Quotation rate',60),S('negoRate','Negotiations','Quotation → negotiation',55),S('closeRate','Orders','Closing rate',35)],
  fields:[V('aov','Average order value',250000,''),X(K('rm','Raw material','%',45,'Of order value'),{simple:1}),X(K('labour','Labour','%',12,'Of order value'),{simple:1}),X(K('overhead','Factory overhead','%',8,'Of order value'),{simple:1}),X(K('logistics','Logistics','%',4,'Of order value'),{simple:1}),K('comm','Sales commission','%',2,'Of order value')],
  costTitle:'Cost engine: raw material + labour + factory overhead + logistics',ecoNote:(v,r)=>`Manufacturing cost ${pct(v.rm+v.labour+v.overhead+v.logistics)} of order value, gross margin <b>${pct(r.x.mu*100)}</b>`,
  econ(v,c){const rev=c*v.aov;return{revenue:rev,lines:[Ln('Raw material',rev*pc(v.rm)),Ln('Labour',rev*pc(v.labour)),Ln('Factory overhead',rev*pc(v.overhead)),Ln('Logistics',rev*pc(v.logistics)),Ln('Sales commission',rev*pc(v.comm))]}}},

{key:'timber',name:'Timber',cat:'b2b',icon:'tree',kind:'lead',unit:'order',unitP:'orders',goal:10,
  flow:'Lead → Quote → Order → CFT sold → Revenue',desc:'Timber importers, depots and traders selling by CFT or CBM.',
  ad:{spend:50000,cpm:220,ctr:0.9,lpConv:7},simpleAsk:'selling price, purchase cost and order volume',
  pre:[O('species','Timber species','select',[['burmateak','Teak (Burma)'],['africateak','Teak (African)'],['ghanateak','Ghana teak'],['sal','Sal'],['pine','Pine'],['meranti','Meranti'],['oak','Oak'],['ash','Ash'],['sapele','Sapele'],['other','Other']],'africateak',G.eco,'Recorded in the report. Species does not change any price: enter your own.',{simple:1}),
    O('grade','Grade','select',[['a','Grade A / FAS'],['b','Grade B / Select'],['c','Grade C / Common']],'a',G.eco,'',{show:v=>v.mode!=='simple'}),
    O('tunit','Sell and quote in','seg',[['cft','CFT'],['cbm','CBM']],'cft',G.eco,'1 CBM = 35.3147 CFT.',{simple:1})],
  stages:[S('qualRate','Qualified leads','Lead qualification',45),S('quoteRate','Quotations','Qualified → quotation',55),S('closeRate','Orders','Quotation → order',25)],
  fields:[X(V('sellCft','Selling price per CFT',2100,''),{show:v=>v.tunit!=='cbm'}),X(V('sellCbm','Selling price per CBM',74160,''),{show:v=>v.tunit==='cbm'}),
    X(N('volCft','Average order volume','CFT',150,1,100000,1,'',{simple:1}),{show:v=>v.tunit!=='cbm'}),X(N('volCbm','Average order volume','CBM',4.25,0.1,5000,0.05,'',{simple:1}),{show:v=>v.tunit==='cbm'}),
    K('buyCbm','Purchase cost per CBM','₹',38000,'Price paid to the supplier',{simple:1}),K('importCbm','Import cost per CBM','₹',1500,'Insurance, documentation, bank charges'),K('freightCbm','Freight per CBM','₹',4500,'Ocean or road freight to port'),
    K('duty','Import duty','%',10,'Of purchase + import cost + freight'),K('portCbm','Port charges per CBM','₹',1200,''),K('transCbm','Transportation per CBM','₹',1500,'Port to depot'),K('whCbm','Warehouse per CBM','₹',800,''),
    K('procCft','Processing per CFT','₹',60,'Sawing, planing, seasoning'),K('waste','Wastage','%',12,'Volume lost in processing and grading'),K('comm','Sales commission','%',1,'Of revenue'),K('delivCft','Delivery to customer per CFT','₹',25,'')],
  costTitle:'Cost engine: purchase + import + freight + duty + port + warehouse + wastage + processing',
  econ(v,c){const CF=35.3147,vol=v.tunit==='cbm'?v.volCbm*CF:v.volCft,price=v.tunit==='cbm'?v.sellCbm/CF:v.sellCft;
    const cif=v.buyCbm+v.importCbm+v.freightCbm,landedCbm=cif*(1+pc(v.duty))+v.portCbm+v.transCbm+v.whCbm,sellable=1-Math.min(0.95,pc(v.waste));
    const landedCft=landedCbm/CF/sellable+v.procCft,cft=c*vol,rev=cft*price;
    const per=k=>cft/CF/sellable*k;
    return{revenue:rev,revLabel:'timber sold',lines:[Ln('Purchase',per(v.buyCbm)),Ln('Import costs',per(v.importCbm)),Ln('Freight',per(v.freightCbm)),Ln('Import duty',per(cif*pc(v.duty))),Ln('Port charges',per(v.portCbm)),Ln('Transportation',per(v.transCbm)),Ln('Warehouse',per(v.whCbm)),Ln('Processing',cft*v.procCft),Ln('Delivery to customer',cft*v.delivCft),Ln('Sales commission',rev*pc(v.comm))],
      timber:{cft,cbm:cft/CF,landedCft,landedCbm,price,profitCft:price-landedCft-v.delivCft-price*pc(v.comm),sellable},
      extras:[['CFT sold',cnt(cft)],['CBM sold',E.num(cft/CF)],['Landed cost per sellable CFT',inr(landedCft)],['Profit per CFT (before ads)',inr(price-landedCft-v.delivCft-price*pc(v.comm))]]}},
  panels(r){const t=r.x.e.timber;if(!t)return '';
    return `<div class="panel"><h3>Landed cost and profit per CFT</h3><div class="more">
      <div><span>CFT sold</span><b>${cnt(t.cft)}</b></div><div><span>CBM sold</span><b>${E.num(t.cbm)}</b></div>
      <div><span>Landed cost per CBM purchased</span><b>${inr(t.landedCbm)}</b></div><div><span>Usable after wastage</span><b>${pct(t.sellable*100)}</b></div>
      <div><span>Landed cost per sellable CFT (incl. processing)</span><b>${inr(t.landedCft)}</b></div><div><span>Selling price per CFT</span><b>${inr(t.price)}</b></div>
      <div><span>Profit per CFT before ads</span><b style="color:var(--${t.profitCft>=0?'good':'bad'})">${inr(t.profitCft)}</b></div><div><span>Margin per CFT</span><b>${pct(t.price>0?t.profitCft/t.price*100:0)}</b></div>
    </div><p class="note">Duty is charged on purchase + import cost + freight. Wastage raises the cost of every usable CFT.</p></div>`}},

{key:'buildmat',name:'Building materials',cat:'b2b',icon:'bricks',kind:'lead',unit:'order',unitP:'orders',goal:15,
  flow:'Lead → Dealer / customer → Quotation → Order',desc:'Plywood, laminates, tiles, sanitaryware, doors, windows and flooring.',
  ad:{spend:40000,cpm:200,ctr:1,lpConv:8},simpleAsk:'price, purchase cost and order value',
  pre:[O('product','Product','select',[['plywood','Plywood'],['laminates','Laminates'],['tiles','Tiles'],['sanitary','Sanitaryware'],['doors','Doors'],['windows','Windows'],['flooring','Flooring']],'plywood',G.eco,'Recorded in the report.',{simple:1}),
    O('buyer','Main buyer','seg',[['dealer','Dealers'],['customer','End customers']],'dealer',G.eco,'',{show:v=>v.mode!=='simple'})],
  stages:[S('qualRate','Qualified dealers / customers','Lead qualification',50),S('quoteRate','Quotations','Qualified → quotation',50),S('closeRate','Orders','Quotation → order',30)],
  fields:[X(V('productPrice','Product price per unit',1600,''),{simple:1}),X(N('purchaseCost','Purchase cost per unit','₹',1250,0,1e8,10,'',{simple:1}),{cost:1}),V('aov','Average order value',45000,''),K('delivery','Delivery','%',2,'Of order value'),K('comm','Sales commission','%',1.5,'Of order value')],
  costTitle:'Cost engine: purchase cost + delivery + commission',ecoNote:(v,r)=>`Product margin ${pct(v.productPrice>0?(1-v.purchaseCost/v.productPrice)*100:0)}, ${E.num(div(v.aov,v.productPrice))} units per order, gross margin <b>${pct(r.x.mu*100)}</b>`,
  econ(v,c){const rev=c*v.aov,ratio=v.productPrice>0?v.purchaseCost/v.productPrice:1;
    return{revenue:rev,lines:[Ln('Purchase cost',rev*ratio),Ln('Delivery',rev*pc(v.delivery)),Ln('Sales commission',rev*pc(v.comm))],
      warn:ratio>=1?['Your purchase cost is at or above your selling price.']:[]}}},

{key:'machinery',name:'Industrial machinery',cat:'b2b',icon:'gear',kind:'lead',unit:'sale',unitP:'sales',goal:2,
  flow:'Lead → Technical discussion → Demo → Quotation → Negotiation → Sale',desc:'Capital equipment with long, technical sales cycles.',
  ad:{spend:100000,cpm:320,ctr:0.8,lpConv:6},simpleAsk:'deal size and margin',
  stages:[S('techQual','Technically qualified','Technical qualification',35),S('techRate','Technical discussions','Qualified → technical discussion',60),S('demoRate','Demos','Demo rate',50),S('quoteRate','Quotations','Demo → quotation',60),S('negoRate','Negotiations','Quotation → negotiation',60),S('closeRate','Sales','Closing rate',35)],
  fields:[X(V('machinePrice','Machine list price',2500000,'Shown for reference.'),{simple:0}),V('dealSize','Average deal size',2800000,'Machine plus accessories and spares.'),N('margin','Gross margin','%',25,0,100,1,'',{simple:1}),
    K('install','Installation and commissioning per sale','₹',40000,''),K('comm','Sales commission','%',3,'Of revenue'),N('cycle','Sales cycle','days',90,1,1000,1,'')],
  costTitle:'Cost engine: machine cost + installation + commission',
  econ(v,c,n){const rev=c*v.dealSize;return{revenue:rev,lines:[Ln('Machine and parts cost',rev*(1-pc(v.margin))),Ln('Installation and commissioning',c*v.install),Ln('Sales commission',rev*pc(v.comm))],
    extras:[['Pipeline value (quotations × deal size)',inr(n.counts[3]*v.dealSize)],['Revenue lands after',v.cycle+' days']],note:c<1?'You expect fewer than one sale a month. Judge machinery campaigns over a full sales cycle.':''}}},

{key:'saas',name:'SaaS / IT services',cat:'b2b',icon:'code',kind:'order',unit:'paying customer',unitP:'paying customers',goal:30,
  flow:'Visitor → Signup → Trial → Paid customer',desc:'Software sold by subscription after a signup or trial.',
  ad:{spend:60000,cpm:250,ctr:1},simpleAsk:'subscription price',
  stages:[S('visitRate','Website visitors','Clicks that load your site',85),S('signupRate','Signups','Visitor → signup',8),S('trialRate','Trials started','Signup → trial',60),S('paidRate','Paying customers','Trial to paid',20)],
  fields:[V('monthly','Monthly subscription',2500,''),V('annual','Annual subscription (per year)',25000,'',{simple:0}),N('annualShare','Customers choosing annual','%',30,0,100,1,''),
    N('churn','Monthly churn','%',3,0,100,0.5,'Monthly customers who cancel each month.'),N('lifetime','Customer lifetime','months',24,1,240,1,'For LTV.'),N('margin','Gross margin','%',80,0,100,1,'After hosting and support.',{simple:1}),
    K('salesCost','Sales cost per customer','₹',1500,''),K('onboard','Onboarding per customer','₹',1000,'')],
  costTitle:'Cost engine: hosting and support + sales + onboarding',beWhat:'hosting, support, sales and onboarding',
  econ(v,c){const a=pc(v.annualShare),mEq=(1-a)*v.monthly+a*v.annual/12,fy=c*((1-a)*v.monthly*firstYearMonths(v.churn)+a*v.annual),mrr=c*mEq;
    const gpm=mEq*pc(v.margin),ltv=gpm*v.lifetime-v.salesCost-v.onboard;
    return{revenue:fy,revLabel:'first 12 months of subscriptions',lines:[Ln('Hosting and support',fy*(1-pc(v.margin))),Ln('Sales cost',c*v.salesCost),Ln('Onboarding',c*v.onboard)],ltv,
      extras:[['MRR added',inr(mrr)],['ARR added',inr(mrr*12)],['Payback period',gpm>0?E.num((v.spend+v.fixed)/Math.max(c,1e-9)/gpm)+' months':'n/a'],['Lifetime revenue per customer',inr(mEq*v.lifetime)]],note:recurNote}}},

{key:'wholesale',name:'Wholesale / Distribution',cat:'b2b',icon:'truck',kind:'lead',unit:'dealer',unitP:'dealers',goal:5,
  flow:'Lead → Qualified dealer → Meeting → First order → Repeat orders',desc:'Distributors and wholesalers building a dealer network.',
  ad:{spend:50000,cpm:260,ctr:0.9,lpConv:6},simpleAsk:'first order, monthly order and margin',
  stages:[S('qualRate','Qualified dealers','Dealer qualification',40),S('meetRate','Meetings','Qualified → meeting',45),S('firstRate','Dealers with a first order','Meeting → first order',35)],
  fields:[V('firstOrder','Average first order',150000,''),V('monthlyOrder','Monthly order per active dealer',60000,''),N('margin','Your gross margin','%',14,0,100,0.5,'',{simple:1}),
    N('repeatRate','Dealers who keep ordering','%',70,0,100,1,'',{rate:1}),N('lifetime','Dealer lifetime','months',24,1,240,1,''),K('freight','Freight and handling','%',2,'Of order value')],
  costTitle:'Cost engine: goods + freight',
  econ(v,c){const first=c*v.firstOrder,m=pc(v.margin)-pc(v.freight),recurring=c*pc(v.repeatRate)*v.monthlyOrder;
    return{revenue:first,revLabel:'first orders this month',lines:[Ln('Cost of goods',first*(1-pc(v.margin))),Ln('Freight and handling',first*pc(v.freight))],ltv:(v.firstOrder+v.monthlyOrder*pc(v.repeatRate)*v.lifetime)*m,
      extras:[['Recurring revenue per month (from these dealers)',inr(recurring)],['Recurring revenue, next 12 months',inr(recurring*12)],['ROAS including 12 months of repeats',xx(div(first+recurring*12,v.spend))]]}}},

/* ===== B2C / ECOMMERCE ===== */
{key:'b2c',name:'Ecommerce',cat:'b2c',icon:'cart',kind:'order',unit:'order',unitP:'orders',goal:500,
  flow:'Click → Product view → Cart → Checkout → Purchase',desc:'Online stores selling through a website checkout.',
  ad:{spend:100000,cpm:150,ctr:1.4},simpleAsk:'AOV and product cost',
  stages:[S('lpvRate','Website visitors','Clicks that load your page',80),S('pvRate','Product views','Visitor → product view',60),S('atcRate','Add to carts','Product view → cart',10),S('icRate','Checkouts','Cart → checkout',45),S('buyRate','Purchases','Checkout → purchase',50)],
  fields:[X(V('productPrice','Average product price',900,'Used to show items per order.'),{simple:0}),V('aov','Average order value (AOV)',1200,''),X(K('cogs','Product cost (COGS)','%',35,'Of order value'),{simple:1}),K('ship','Shipping per order','₹',90,''),K('gateway','Payment gateway','%',2,''),K('rto','Returns / RTO','%',12,'Orders returned or refused'),K('refund','Refunds','%',3,'Of delivered orders')],
  costTitle:'Cost engine: COGS + shipping + payment + returns',beWhat:'COGS, shipping, payment fees and returns',
  econ(v,c){const e=ecom(v,c);return{revenue:e.booked,revLabel:'booked orders, as Meta reports',lines:e.lines,extras:[['Revenue kept after returns and refunds',inr(e.kept)],['Net ROAS (kept revenue)',xx(div(e.kept,v.spend))],['Items per order',E.num(div(v.aov,v.productPrice))]]}}},

{key:'d2c',name:'D2C',cat:'b2c',icon:'box',kind:'order',unit:'customer',unitP:'customers',goal:400,
  flow:'Click → Product view → Cart → Purchase → Repeat purchase',desc:'Direct to consumer brands with repeat orders, subscriptions, upsells and cross sells.',
  ad:{spend:100000,cpm:160,ctr:1.3},simpleAsk:'AOV, product cost and repeat rate',
  stages:[S('lpvRate','Website visitors','Clicks that load your page',80),S('pvRate','Product views','Visitor → product view',60),S('atcRate','Add to carts','Product view → cart',10),S('icRate','Checkouts','Cart → checkout',45),S('buyRate','First purchases','Checkout → purchase',50)],
  fields:[V('aov','First order value (AOV)',1100,''),X(K('cogs','Product cost (COGS)','%',30,'Of order value'),{simple:1}),K('ship','Shipping per order','₹',80,''),K('gateway','Payment gateway','%',2,''),K('rto','Returns / RTO','%',8,''),
    N('upsellRate','Upsell take rate','%',15,0,100,1,''),N('upsellValue','Upsell value','₹',300,0,1e6,10,''),N('crossRate','Cross sell take rate','%',10,0,100,1,''),N('crossValue','Cross sell value','₹',400,0,1e6,10,''),
    N('repeatRate','Customers who buy again','%',35,0,100,1,'',{simple:1,rate:1}),N('repeatOrders','Repeat orders per year','x',3,0,52,0.5,''),N('years','Customer lifetime','years',2,0.5,20,0.5,''),
    N('subShare','Customers on subscription','%',10,0,100,1,''),N('subMonthly','Subscription value per month','₹',600,0,1e6,10,''),N('subMonths','Average subscription length','months',6,0,120,1,'')],
  costTitle:'Cost engine: COGS + shipping + payment + returns',
  econ(v,c){const e=ecom(v,c),extra=c*(pc(v.upsellRate)*v.upsellValue+pc(v.crossRate)*v.crossValue),mu=e.booked>0?1-e.lines.reduce((a,l)=>a+l[1],0)/e.booked:0;
    const firstRev=e.booked+extra,rep=c*pc(v.repeatRate)*v.repeatOrders*v.years*v.aov,sub=c*pc(v.subShare)*v.subMonthly*v.subMonths;
    const lines=[...e.lines,Ln('Upsell and cross sell product cost',extra*pc(v.cogs))];
    return{revenue:firstRev,revLabel:'first orders incl. upsells and cross sells',lines,ltv:c>0?((firstRev+rep+sub)/c)*mu:0,
      extras:[['First order revenue',inr(firstRev)],['Repeat revenue (lifetime)',inr(rep)],['Subscription revenue (lifetime)',inr(sub)],['Lifetime revenue per customer',inr(div(firstRev+rep+sub,c))],['Lifetime ROAS',xx(div(firstRev+rep+sub,v.spend))]]}}},

{key:'fashion',name:'Fashion',cat:'b2c',icon:'shirt',kind:'order',unit:'order',unitP:'orders',goal:600,
  flow:'Traffic → Product view → Cart → Checkout → Purchase',desc:'Apparel and accessories online, where discounts and returns decide profit.',
  ad:{spend:100000,cpm:140,ctr:1.4},simpleAsk:'AOV, product cost and returns',
  stages:[S('lpvRate','Traffic (page views)','Clicks that load your page',80),S('pvRate','Product views','Visitor → product view',55),S('atcRate','Add to carts','Product view → cart',9),S('icRate','Checkouts','Cart → checkout',45),S('buyRate','Purchases','Checkout → purchase',45)],
  fields:[X(V('productPrice','Average product price',1100,''),{simple:0}),V('aov','AOV before discounts',1400,''),N('disc','Average discount','%',10,0,90,1,''),X(K('cogs','Product cost','%',40,'Of order value'),{simple:1}),K('ship','Shipping per order','₹',90,''),X(K('rto','Returns','%',20,''),{simple:1}),K('gateway','Payment fees','%',2,'')],
  costTitle:'Cost engine: COGS + shipping + payment + returns',
  econ(v,c){const e=ecom(v,c);return{revenue:e.booked,revLabel:'booked orders after discounts',lines:e.lines,extras:[['Discounts given',inr(c*v.aov*pc(v.disc))],['Net revenue (after returns)',inr(e.kept)],['Net ROAS',xx(div(e.kept,v.spend))]]}}},

{key:'beauty',name:'Beauty / Cosmetics',cat:'b2c',icon:'sparkle',kind:'order',unit:'customer',unitP:'customers',goal:500,
  flow:'Visitor → Product view → Cart → Purchase → Repeat purchase',desc:'Beauty, skincare and personal care brands with repeat buyers.',
  ad:{spend:80000,cpm:160,ctr:1.5},simpleAsk:'AOV, product cost and repeat rate',
  stages:[S('lpvRate','Visitors','Clicks that load your page',80),S('pvRate','Product views','Visitor → product view',60),S('atcRate','Add to carts','Product view → cart',10),S('buyRate','Purchases','Cart → purchase',30)],
  fields:[X(V('productPrice','Average product price',650,''),{simple:0}),V('aov','AOV',800,''),X(K('cogs','Product cost','%',30,'Of order value'),{simple:1}),K('ship','Shipping per order','₹',70,''),K('gateway','Payment gateway','%',2,''),K('rto','Returns / RTO','%',5,''),
    N('repeatRate','Repeat purchase rate','%',40,0,100,1,'',{simple:1,rate:1}),N('repeatOrders','Repeat orders per year','x',3,0,52,0.5,''),N('years','Customer lifetime','years',2,0.5,20,0.5,'')],
  costTitle:'Cost engine: COGS + shipping + payment + returns',
  econ(v,c){const e=ecom(v,c),mu=e.booked>0?1-e.lines.reduce((a,l)=>a+l[1],0)/e.booked:0,rep=c*pc(v.repeatRate)*v.repeatOrders*v.years*v.aov;
    return{revenue:e.booked,revLabel:'first orders',lines:e.lines,ltv:c>0?(e.booked+rep)/c*mu:0,extras:[['Repeat revenue (lifetime)',inr(rep)],['Lifetime ROAS',xx(div(e.booked+rep,v.spend))]]}}},

{key:'furniture',name:'Furniture',cat:'b2c',icon:'chair',kind:'lead',unit:'order',unitP:'orders',goal:15,
  flow:'Enquiry → Qualified → Quotation → Visit → Order',desc:'Furniture makers and showrooms selling through enquiries and visits.',
  ad:{spend:60000,cpm:190,ctr:1,lpConv:7},simpleAsk:'order value and product cost',
  stages:[S('qualRate','Qualified leads','Enquiry qualification',50),S('quoteRate','Quotations','Qualified → quotation',55),S('visitRate','Showroom / site visits','Quotation → visit',50),S('closeRate','Orders','Closing rate',30)],
  fields:[X(V('productPrice','Average product price',35000,''),{simple:0}),V('aov','Average order value',55000,''),X(K('cost','Manufacturing / purchase cost','%',55,'Of order value'),{simple:1}),K('delivery','Delivery per order','₹',1500,''),K('install','Installation per order','₹',800,''),K('comm','Sales commission','%',2,'')],
  costTitle:'Cost engine: product cost + delivery + installation',
  econ(v,c){const rev=c*v.aov;return{revenue:rev,lines:[Ln('Manufacturing / purchase cost',rev*pc(v.cost)),Ln('Delivery',c*v.delivery),Ln('Installation',c*v.install),Ln('Sales commission',rev*pc(v.comm))]}}},

{key:'electronics',name:'Electronics',cat:'b2c',icon:'cpu',kind:'order',unit:'order',unitP:'orders',goal:300,
  flow:'Click → Product view → Cart → Checkout → Purchase',desc:'Gadgets and appliances online, where margins are thin.',
  ad:{spend:80000,cpm:170,ctr:1.2},simpleAsk:'AOV and product cost',
  stages:[S('lpvRate','Website visitors','Clicks that load your page',80),S('pvRate','Product views','Visitor → product view',55),S('atcRate','Add to carts','Product view → cart',8),S('icRate','Checkouts','Cart → checkout',45),S('buyRate','Purchases','Checkout → purchase',55)],
  fields:[V('aov','AOV',4000,''),X(K('cogs','COGS','%',72,'Of order value'),{simple:1}),K('warranty','Warranty provision','%',2,''),K('ship','Shipping per order','₹',120,''),K('gateway','Payment fee','%',2,''),K('rto','Returns','%',6,'')],
  costTitle:'Cost engine: COGS + warranty + shipping + payment + returns',
  econ(v,c){const e=ecom(v,c);return{revenue:e.booked,revLabel:'booked orders',lines:e.lines,extras:[['Contribution profit',inr(e.booked-e.lines.reduce((a,l)=>a+l[1],0))]]}}},

{key:'jewellery',name:'Jewellery',cat:'b2c',icon:'gem',kind:'lead',unit:'customer',unitP:'customers',goal:10,
  flow:'Enquiry → Product view → Appointment / visit → Purchase',desc:'Jewellers selling through enquiries, catalogues and store visits.',
  ad:{spend:50000,cpm:200,ctr:1,lpConv:7},simpleAsk:'order value and product cost',
  stages:[S('qualRate','Qualified enquiries','Lead qualification',45),S('pvRate','Catalogue / product views shared','Qualified → product view',70),S('visitRate','Appointments / store visits','Appointment rate',30),S('buyRate','Purchases','Purchase rate',40)],
  fields:[V('aov','Average order value',90000,''),X(K('cost','Product cost (metal, stones, making)','%',82,'Of order value'),{simple:1}),K('incentive','Sales incentive','%',1,'')],
  costTitle:'Cost engine: product cost + sales incentive',
  econ(v,c){const rev=c*v.aov;return{revenue:rev,lines:[Ln('Product cost (metal, stones, making)',rev*pc(v.cost)),Ln('Sales incentive',rev*pc(v.incentive))]}}},

{key:'homedecor',name:'Home decor',cat:'b2c',icon:'lamp',unit:'order',unitP:'orders',goal:40,
  kind:v=>v.hmode==='ecom'?'order':'lead',
  flow:'Lead mode or ecommerce mode, your choice',desc:'Furniture, decor, lighting, wall art, rugs and accessories.',
  ad:{spend:40000,cpm:160,ctr:1.2,lpConv:8},simpleAsk:'order value and product cost',
  pre:[O('hmode','Which funnel fits you?','seg',[['lead','Lead mode (enquiries)'],['ecom','Ecommerce mode (checkout)']],'ecom',G.eco,'',{simple:1}),
    O('category','Category','select',[['furniture','Furniture'],['decor','Decor'],['lighting','Lighting'],['wallart','Wall art'],['rugs','Rugs'],['accessories','Accessories']],'decor',G.eco,'Recorded in the report.',{simple:1})],
  stageDefs:[S('hq','Qualified leads','Lead qualification',50,'',{show:v=>v.hmode!=='ecom'}),S('hquote','Quotations','Qualified → quotation',50,'',{show:v=>v.hmode!=='ecom'}),S('hord','Orders','Quotation → order',35,'',{show:v=>v.hmode!=='ecom'}),
    S('lpvRate','Website visitors','Clicks that load your page',80,'',{show:v=>v.hmode==='ecom'}),S('pvRate','Product views','Visitor → product view',55,'',{show:v=>v.hmode==='ecom'}),S('atcRate','Add to carts','Product view → cart',8,'',{show:v=>v.hmode==='ecom'}),S('icRate','Checkouts','Cart → checkout',45,'',{show:v=>v.hmode==='ecom'}),S('buyRate','Purchases','Checkout → purchase',50,'',{show:v=>v.hmode==='ecom'})],
  stages(v){return v.hmode==='ecom'?[S('lpvRate','Website visitors'),S('pvRate','Product views'),S('atcRate','Add to carts'),S('icRate','Checkouts'),S('buyRate','Purchases')]:[S('hq','Qualified leads'),S('hquote','Quotations'),S('hord','Orders')]},
  fields:[V('aov','Average order value',7000,''),X(K('cogs','Product cost','%',45,'Of order value'),{simple:1}),K('ship','Shipping / delivery per order','₹',250,''),X(K('gateway','Payment gateway','%',2,''),{show:v=>v.hmode==='ecom'}),X(K('rto','Returns','%',6,''),{show:v=>v.hmode==='ecom'}),K('install','Installation per order','₹',0,''),X(K('comm','Sales commission','%',2,''),{show:v=>v.hmode!=='ecom'})],
  costTitle:'Cost engine: product cost + delivery + payment + returns',
  econ(v,c){if(v.hmode==='ecom'){const e=ecom(v,c);return{revenue:e.booked,revLabel:'booked orders',lines:[...e.lines,Ln('Installation',c*v.install)]}}
    const rev=c*v.aov;return{revenue:rev,lines:[Ln('Product cost',rev*pc(v.cogs)),Ln('Delivery',c*v.ship),Ln('Installation',c*v.install),Ln('Sales commission',rev*pc(v.comm))]}}},

{key:'food',name:'Food / Restaurant',cat:'b2c',icon:'food',kind:'order',unit:'order',unitP:'orders',goal:600,
  flow:'Ad → Menu view → Order → Repeat order',desc:'Restaurants, cloud kitchens and food brands taking orders.',
  ad:{spend:25000,cpm:120,ctr:1.6},simpleAsk:'order value and food cost',
  stages:[S('menuRate','Menu views','Clicks that open your menu',70),S('orderRate','Orders','Menu view → order',10)],
  fields:[V('aov','Average order value',450,''),X(K('foodCost','Food cost','%',32,'Of order value'),{simple:1}),K('delivery','Packaging and delivery per order','₹',45,''),K('platform','Platform fee','%',0,'Aggregator commission; 0 for direct orders'),
    N('repeatRate','Customers who order again','%',35,0,100,1,'',{rate:1}),N('repeatPerMonth','Repeat orders per month','x',2,0,30,0.5,''),N('months','Months a repeat customer stays','months',6,1,60,1,'')],
  costTitle:'Cost engine: food cost + delivery + platform fee',
  econ(v,c){const rev=c*v.aov,lines=[Ln('Food cost',rev*pc(v.foodCost)),Ln('Packaging and delivery',c*v.delivery),Ln('Platform fee',rev*pc(v.platform))],per=v.aov*(1-pc(v.foodCost)-pc(v.platform))-v.delivery;
    const rep=c*pc(v.repeatRate)*v.repeatPerMonth*v.months;
    return{revenue:rev,revLabel:'first orders',lines,ltv:per*(1+pc(v.repeatRate)*v.repeatPerMonth*v.months),extras:[['Repeat orders (lifetime)',cnt(rep)],['Repeat revenue (lifetime)',inr(rep*v.aov)],['Contribution profit per order',inr(per)]]}}},

{key:'fitness',name:'Fitness',cat:'b2c',icon:'dumbbell',kind:'lead',unit:'member',unitP:'members',goal:30,
  flow:'Lead → Trial → Visit → Membership',desc:'Gyms, studios and fitness programmes with monthly members.',
  ad:{spend:30000,cpm:150,ctr:1.3,lpConv:10},simpleAsk:'joining and monthly fees',
  stages:[S('trialRate','Trials booked','Lead → trial',40),S('visitRate','Trial visits','Trial show rate',60),S('convRate','Members','Visit → membership',35)],
  fields:[V('joining','Membership / joining fee',2000,''),V('monthlyFee','Monthly fee',2500,''),N('lifetime','Average member lifetime','months',8,1,120,1,''),N('monthsCounted','Months of fees counted in ROAS','months',1,0,24,1,recurNote),K('cost','Variable cost (trainers, facility)','%',30,'Of revenue')],
  costTitle:'Cost engine: trainers and facility',
  econ(v,c){const mc=Math.min(v.monthsCounted,v.lifetime),rev=c*(v.joining+v.monthlyFee*mc);
    return{revenue:rev,revLabel:`joining fee + ${mc} month${mc===1?'':'s'} of fees`,lines:[Ln('Trainers and facility',rev*pc(v.cost))],ltv:(v.joining+v.monthlyFee*v.lifetime)*(1-pc(v.cost)),
      extras:[['Monthly recurring revenue added',inr(c*v.monthlyFee)],['Lifetime revenue per member',inr(v.joining+v.monthlyFee*v.lifetime)]]}}},

/* ===== PROFESSIONAL / LOCAL ===== */
{key:'agency',name:'Digital marketing agency',cat:'pro',icon:'megaphone',kind:'lead',unit:'client',unitP:'clients',goal:4,
  flow:'Lead → Qualified → Meeting → Proposal → Client',desc:'Agencies winning retainer clients.',
  ad:{spend:40000,cpm:250,ctr:0.9,lpConv:6},simpleAsk:'monthly retainer and margin',
  stages:[S('qualRate','Qualified leads','Lead qualification',40),S('meetRate','Meetings','Qualified → meeting',45),S('proposalRate','Proposals','Meeting → proposal',60),S('closeRate','Clients','Closing rate',30)],
  fields:[V('retainer','Average monthly retainer',50000,''),N('lifetime','Average client lifetime','months',10,1,120,1,''),N('margin','Gross margin','%',45,0,100,1,'After team and tools.',{simple:1}),V('setup','One time setup fee',0,'',{simple:0}),N('monthsCounted','Months of retainer counted in ROAS','months',3,0,24,1,recurNote)],
  costTitle:'Cost engine: team and tools',
  econ(v,c){const mc=Math.min(v.monthsCounted,v.lifetime),rev=c*(v.retainer*mc+v.setup);
    return{revenue:rev,revLabel:`${mc} month${mc===1?'':'s'} of retainer + setup`,lines:[Ln('Team and tools',rev*(1-pc(v.margin)))],ltv:(v.retainer*v.lifetime+v.setup)*pc(v.margin),
      extras:[['MRR added',inr(c*v.retainer)],['Lifetime revenue per client',inr(v.retainer*v.lifetime+v.setup)]]}}},

{key:'legal',name:'Legal services',cat:'pro',icon:'scale',kind:'lead',unit:'client',unitP:'clients',goal:8,
  flow:'Lead → Qualified → Consultation → Client',desc:'Lawyers and law firms with paid consultations and cases.',
  ad:{spend:30000,cpm:220,ctr:0.9,lpConv:8},simpleAsk:'consultation fee and case value',
  stages:[S('qualRate','Qualified leads','Lead qualification',50),S('consultRate','Consultations','Consultation rate',45),S('closeRate','Clients','Closing rate',35)],
  fields:[V('consultFee','Consultation fee',1500,''),V('caseValue','Average case value',60000,''),N('margin','Gross margin','%',70,0,100,1,'After associate time and filing costs.',{simple:1}),K('referral','Referral fee','%',0,'')],
  costTitle:'Cost engine: associate time and filings + referrals',
  econ(v,c,n){const cons=n.counts[1],rev=cons*v.consultFee+c*v.caseValue;return{revenue:rev,lines:[Ln('Associate time and filings',rev*(1-pc(v.margin))),Ln('Referral fees',rev*pc(v.referral))],extras:[['Consultation revenue',inr(cons*v.consultFee)]]}}},

{key:'accounting',name:'Accounting / CA',cat:'pro',icon:'calc',kind:'lead',unit:'client',unitP:'clients',goal:10,
  flow:'Lead → Consultation → Proposal → Client',desc:'CAs and accounting firms with monthly retainers and annual filings.',
  ad:{spend:25000,cpm:200,ctr:0.9,lpConv:8},simpleAsk:'retainer and annual fees',
  stages:[S('qualRate','Qualified leads','Lead qualification',60),S('consultRate','Consultations','Consultation rate',50),S('proposalRate','Proposals','Consultation → proposal',60),S('closeRate','Clients','Closing rate',45)],
  fields:[V('retainer','Monthly retainer',8000,''),V('annualExtra','Annual filings and one time fees (a year)',15000,''),N('years','Client lifetime','years',3,0.5,30,0.5,''),N('margin','Gross margin','%',55,0,100,1,'',{simple:1}),N('monthsCounted','Months of revenue counted in ROAS','months',12,0,24,1,recurNote)],
  costTitle:'Cost engine: staff time',
  econ(v,c){const mc=v.monthsCounted,rev=c*(v.retainer*mc+v.annualExtra*Math.min(1,mc/12)),ann=v.retainer*12+v.annualExtra;
    return{revenue:rev,revLabel:`${mc} months of client revenue`,lines:[Ln('Staff time',rev*(1-pc(v.margin)))],ltv:ann*v.years*pc(v.margin),
      extras:[['MRR added',inr(c*v.retainer)],['ARR added',inr(c*ann)],['Annual value per client',inr(ann)]]}}},

{key:'architecture',name:'Architecture',cat:'pro',icon:'ruler',kind:'lead',unit:'project',unitP:'projects',goal:3,
  flow:'Lead → Consultation → Site visit → Proposal → Project',desc:'Architects and design studios.',
  ad:{spend:40000,cpm:230,ctr:0.9,lpConv:6},simpleAsk:'project fee and margin',
  stages:[S('qualRate','Qualified leads','Lead qualification',40),S('consultRate','Consultations','Consultation rate',50),S('siteRate','Site visits','Consultation → site visit',60),S('proposalRate','Proposals','Site visit → proposal',70),S('closeRate','Projects','Closing rate',30)],
  fields:[V('projectValue','Average project fee',500000,''),N('margin','Gross margin','%',50,0,100,1,'After staff and consultants.',{simple:1})],
  costTitle:'Cost engine: staff and consultants',
  econ(v,c){const rev=c*v.projectValue;return{revenue:rev,lines:[Ln('Staff and consultants',rev*(1-pc(v.margin)))]}}},

{key:'photography',name:'Photography',cat:'pro',icon:'camera',kind:'lead',unit:'booking',unitP:'bookings',goal:8,
  flow:'Lead → Enquiry → Call → Quotation → Booking',desc:'Wedding, event, commercial and portrait photographers.',
  ad:{spend:20000,cpm:160,ctr:1.2,lpConv:8},simpleAsk:'package price and costs',
  pre:[O('genre','Type','select',[['wedding','Wedding'],['events','Events'],['commercial','Commercial'],['portrait','Portrait']],'wedding',G.eco,'Recorded in the report.',{simple:1})],
  stages:[S('qualRate','Qualified enquiries','Lead qualification',60),S('callRate','Calls','Enquiry → call',60),S('quoteRate','Quotations','Call → quotation',70),S('bookRate','Bookings','Booking rate',25)],
  fields:[V('packagePrice','Average package price',80000,''),X(K('cost','Shoot costs (team, editing, travel, albums)','%',35,'Of revenue'),{simple:1})],
  costTitle:'Cost engine: team, editing, travel and albums',
  econ(v,c){const rev=c*v.packagePrice;return{revenue:rev,lines:[Ln('Team, editing, travel and albums',rev*pc(v.cost))]}}},

{key:'salon',name:'Salon / Spa',cat:'pro',icon:'scissors',kind:'lead',unit:'customer',unitP:'customers',goal:100,
  flow:'Lead / booking → Appointment → Visit → Purchase → Repeat visit',desc:'Salons, spas and beauty studios with repeat visits.',
  ad:{spend:20000,cpm:130,ctr:1.5,lpConv:12},simpleAsk:'average bill and service cost',
  stages:[S('apptRate','Appointments','Lead → appointment',60),S('showRate','Visits','Show rate',70),S('buyRate','Paying customers','Visit → purchase',90)],
  fields:[V('avgBill','Average bill',1800,''),X(K('serviceCost','Service cost (products, stylist share)','%',35,'Of revenue'),{simple:1}),N('repeatPct','Customers who return','%',60,0,100,1,'',{rate:1}),N('visits','Repeat visits per year','x',5,0,52,0.5,''),N('years','Customer lifetime','years',2,0.5,20,0.5,'')],
  costTitle:'Cost engine: products and stylist share',
  econ(v,c){const rev=c*v.avgBill,ltvRev=v.avgBill*(1+pc(v.repeatPct)*v.visits*v.years);
    return{revenue:rev,revLabel:'first visits',lines:[Ln('Products and stylist share',rev*pc(v.serviceCost))],ltv:ltvRev*(1-pc(v.serviceCost)),extras:[['Lifetime revenue per customer',inr(ltvRev)],['Lifetime ROAS',xx(div(c*ltvRev,v.spend))]]}}},

{key:'dental',name:'Dental',cat:'pro',icon:'tooth',kind:'lead',unit:'patient',unitP:'treated patients',goal:25,
  flow:'Lead → Appointment → Consultation → Treatment → Patient value',desc:'Dental clinics earning from consultations and treatment plans.',
  ad:{spend:30000,cpm:160,ctr:1.1,lpConv:9},simpleAsk:'consultation fee and treatment value',
  stages:[S('apptRate','Appointments','Lead → appointment',40),S('showRate','Consultations','Appointment show rate',70),S('treatRate','Treatments started','Treatment conversion',45)],
  fields:[V('consultFee','Consultation fee',500,''),V('treatValue','Average treatment value',18000,''),N('margin','Treatment gross margin','%',60,0,100,1,'After lab work, materials, doctor share.',{simple:1}),
    K('consultCost','Consultation cost','%',20,'Of consultation fees'),N('repeat','Repeat treatment rate (a year)','%',25,0,300,1,''),N('years','Patient lifetime','years',4,0.5,30,0.5,'')],
  costTitle:'Cost engine: lab, materials and doctor share',
  econ(v,c,n){const cons=n.counts[1],cr=cons*v.consultFee,tr=c*v.treatValue;
    return{revenue:cr+tr,lines:[Ln('Lab, materials and doctor share',tr*(1-pc(v.margin))),Ln('Consultation cost',cr*pc(v.consultCost))],ltv:v.treatValue*pc(v.margin)*(1+pc(v.repeat)*v.years),
      extras:[['Cost per appointment',inr(div(v.spend,n.counts[0]))],['Lifetime value per patient',inr(v.treatValue*(1+pc(v.repeat)*v.years))]]}}},

{key:'consulting',name:'Consulting',cat:'pro',icon:'bulb',kind:'lead',unit:'client',unitP:'clients',goal:3,
  flow:'Lead → Qualified → Discovery call → Proposal → Client',desc:'Consultants and advisory firms selling projects.',
  ad:{spend:40000,cpm:280,ctr:0.8,lpConv:6},simpleAsk:'project value and margin',
  stages:[S('qualRate','Qualified leads','Lead qualification',45),S('callRate','Discovery calls','Qualified → call',50),S('proposalRate','Proposals','Call → proposal',55),S('closeRate','Clients','Closing rate',30)],
  fields:[V('fee','Paid discovery / diagnostic fee',0,'Charged per discovery call, if any.',{simple:0}),V('projectValue','Average project value',250000,''),N('margin','Gross margin','%',60,0,100,1,'',{simple:1})],
  costTitle:'Cost engine: consultant time',
  econ(v,c,n){const calls=n.counts[1],rev=calls*v.fee+c*v.projectValue;return{revenue:rev,lines:[Ln('Consultant time and delivery',rev*(1-pc(v.margin)))]}}},

/* ===== CUSTOM ===== */
{key:'custom',name:'Custom industry',cat:'custom',icon:'plus',unit:'customer',unitP:'customers',goal:20,custom:1,
  kind:v=>v.ckind==='order'?'order':'lead',
  flow:'Build your own funnel stages',desc:'Any business not listed: name it, define the funnel, set price and costs.',
  ad:{spend:30000,cpm:180,ctr:1,lpConv:8},simpleAsk:'price and costs',
  pre:[O('cname','Business name','text',null,'My business',G.eco,'',{simple:1}),O('ckind','Funnel starts with','seg',[['lead','Leads (CPL)'],['order','Website clicks (CPP)']],'lead',G.eco,'',{simple:1}),
    X(Object.assign(O('cstages','Funnel stages','text',null,[{name:'Qualified leads',rate:50},{name:'Meetings',rate:40},{name:'Customers',rate:30}],G.eco,''),{}),{show:()=>false})],
  stages(v){return(v.cstages||[]).map((s,i)=>({id:'cs'+i,l:String(s.name||'Stage '+(i+1)).slice(0,40),r:s.name,get:v=>Math.min(100,Math.max(0,+v.cstages[i].rate||0)),set:(v,x)=>{v.cstages[i].rate=x}}))},
  fields:[V('price','Product / service price',20000,''),X(K('cogs','COGS','%',40,'Of revenue'),{simple:1}),K('other','Other cost per customer','₹',500,''),K('comm','Sales commission','%',0,'')],
  costTitle:'Cost engine: COGS + other costs + commission',
  econ(v,c){const rev=c*v.price;return{revenue:rev,lines:[Ln('COGS',rev*pc(v.cogs)),Ln('Other costs',c*v.other),Ln('Sales commission',rev*pc(v.comm))]}},
  builder(v){const st=v.cstages||[];return `<fieldset class="cbuild"><legend>Your funnel stages</legend>
    <p class="gnote">Each rate is the share of the previous stage that moves on. The last stage is your customers. Starts from ${v.ckind==='order'?'website clicks':'leads'}.</p>
    ${st.map((s,i)=>`<div class="cst"><span class="cn">${i+1}</span><input type="text" data-cust="name:${i}" value="${String(s.name).replace(/"/g,'&quot;')}" aria-label="Stage ${i+1} name" maxlength="40"><div class="inp"><input type="number" data-cust="rate:${i}" value="${s.rate}" min="0" max="100" step="0.5" aria-label="Stage ${i+1} rate"><span class="u">%</span></div><button type="button" class="cdel" data-act="cdel" data-i="${i}" aria-label="Remove stage ${i+1}">×</button></div>`).join('')}
    ${st.length<10?'<button type="button" class="btn btn-line btn-sm" data-act="cadd">Add a stage</button>':''}</fieldset>`},
  customInput(t,Eng){const [k,i]=t.dataset.cust.split(':'),s=Eng.v.cstages[+i];if(!s)return;
    if(k==='name')s.name=t.value;else{let n=parseFloat(t.value);n=isNaN(n)?0:Math.min(100,Math.max(0,n));if(+t.value>100)t.value=100;s.rate=n}},
  actions:{cadd(v){if(v.cstages.length<10)v.cstages.push({name:'New stage',rate:50})},cdel(v,E_,el){if(v.cstages.length>1)v.cstages.splice(+el.dataset.i,1);else return 'Keep at least one stage.'}}}
];
return specs.map(FW.build);
});
})();
