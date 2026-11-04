/* Market reference database for the Door module.
   Edit this file to change any reference price. Every row is a planning placeholder,
   NOT verified supplier pricing: replace rows with real quotes as you collect them
   (and update `source` and `updated` on those rows).

   Row fields:
     cat       door | material | laminate | adhesive | hardware | labour | finishing | packaging | transport | installation
     key       item key (door type key, material key, hardware item...)
     label     shown in the reference table
     unit      what low/high are measured in
     low/high  price range for the Standard quality level
     location  'all' or a location name from `locations` (a location row beats an 'all' row)
     quality   'all' or economy | standard | premium (a quality row beats an 'all' row)
     source    where the numbers came from
     updated   YYYY-MM
   Prices for 'all' rows are adjusted by the location and quality multipliers below.
   A row for a specific location or quality is used as is. */
(function(){
'use strict';
const SRC='GBS planning estimate. Not verified against supplier quotes.';
const UPD='2026-09';
const R=(cat,key,label,unit,low,high,extra)=>Object.assign({cat,key,label,unit,low,high,location:'all',quality:'all',source:SRC,updated:UPD},extra||{});

const MARKET={
  note:'Indicative market reference. Actual prices vary by supplier, quality, size and finish.',
  source:SRC,
  updated:UPD,
  /* price: multiplier on door selling prices; cost: multiplier on materials and labour; cpm: typical Meta CPM in ₹ */
  locations:{
    'Bengaluru':{price:1.00,cost:1.00,cpm:180},
    'Karnataka':{price:0.93,cost:0.95,cpm:140},
    'Chennai':{price:0.98,cost:0.98,cpm:170},
    'Hyderabad':{price:0.97,cost:0.97,cpm:170},
    'Mumbai':{price:1.12,cost:1.08,cpm:200},
    'Pune':{price:1.02,cost:1.00,cpm:170},
    'Delhi NCR':{price:1.05,cost:1.02,cpm:190},
    'Kerala':{price:1.03,cost:1.02,cpm:150},
    'Tamil Nadu':{price:0.94,cost:0.95,cpm:140},
    'Telangana':{price:0.93,cost:0.95,cpm:140},
    'Maharashtra':{price:1.00,cost:1.00,cpm:160},
    'Pan India':{price:1.00,cost:1.00,cpm:150},
    'Custom':{price:1.00,cost:1.00,cpm:170}
  },
  quality:{
    economy:{label:'Economy',m:0.80},
    standard:{label:'Standard',m:1.00},
    premium:{label:'Premium',m:1.40}
  },
  /* multiplier on door selling price for the finish */
  finish:{
    unfinished:{label:'Unfinished',m:0.85},
    laminate:{label:'Laminate',m:1.00},
    veneer:{label:'Veneer with polish',m:1.12},
    membrane:{label:'Membrane',m:1.08},
    pu:{label:'PU',m:1.20},
    duco:{label:'Duco',m:1.22},
    paint:{label:'Paint',m:0.95},
    natural:{label:'Natural oil / wax',m:1.05}
  },
  /* reference thickness in mm; price scales gently with thickness */
  baseThickness:32,
  rows:[
    /* door selling prices, ₹ per sq ft of door, standard quality, laminate finish, 32 mm */
    R('door','flush','Flush door','₹ / sq ft',130,220),
    R('door','laminated','Laminated door','₹ / sq ft',260,380),
    R('door','veneer','Veneer door','₹ / sq ft',300,480),
    R('door','membrane','Membrane door','₹ / sq ft',320,520),
    R('door','wpc','WPC door','₹ / sq ft',250,420),
    R('door','pvc','PVC door','₹ / sq ft',140,260),
    R('door','mdf','MDF door','₹ / sq ft',200,340),
    R('door','hdhmr','HDHMR door','₹ / sq ft',260,420),
    R('door','solid','Solid wood door','₹ / sq ft',700,1400),
    R('door','teak','Teak door','₹ / sq ft',1600,3500),
    R('door','main','Main door','₹ / sq ft',900,2400),
    R('door','bedroom','Bedroom door','₹ / sq ft',260,420),
    R('door','pooja','Pooja door','₹ / sq ft',800,2200),
    R('door','designer','Designer door','₹ / sq ft',450,900),
    R('door','fire','Fire rated door','₹ / sq ft',600,1100),
    R('door','bathroom','Bathroom door','₹ / sq ft',150,300),
    R('door','office','Office door','₹ / sq ft',280,480),
    R('door','commercial','Commercial door','₹ / sq ft',350,650),
    R('door','custom','Custom door','₹ / sq ft',300,600),

    /* raw material, ₹ per sq ft of board used */
    R('material','ply','Plywood','₹ / sq ft',55,110),
    R('material','block','Blockboard','₹ / sq ft',60,100),
    R('material','mdf','MDF','₹ / sq ft',35,60),
    R('material','hdhmr','HDHMR','₹ / sq ft',55,95),
    R('material','wpc','WPC board','₹ / sq ft',90,160),
    R('material','solid','Solid wood','₹ / sq ft',350,700),
    R('material','teak','Teak','₹ / sq ft',1000,2200),
    R('material','other','Other material','₹ / sq ft',50,120),

    R('laminate','sheet','Laminate sheet (8 × 4 ft, about 1 mm)','₹ / sheet',800,1800),
    R('adhesive','door','Adhesive','₹ / door',100,250),

    R('hardware','handle','Handle','₹ / door',150,1500),
    R('hardware','lock','Lock','₹ / door',300,2500),
    R('hardware','hinge','Hinges (set of 3)','₹ / door',120,450),
    R('hardware','stop','Door stopper','₹ / door',40,200),
    R('hardware','bolt','Tower bolt','₹ / door',60,250),

    R('labour','door','Factory labour, all processes','₹ / door',350,900),

    R('finishing','pu','PU finish','₹ / sq ft',60,140),
    R('finishing','duco','Duco finish','₹ / sq ft',90,180),
    R('finishing','melamine','Melamine finish','₹ / sq ft',30,70),
    R('finishing','polish','Polish','₹ / sq ft',25,60),
    R('finishing','paint','Paint','₹ / sq ft',15,40),
    R('finishing','uv','UV coating','₹ / sq ft',20,50),

    R('packaging','door','Packaging, all materials','₹ / door',80,200),
    R('transport','door','Local delivery','₹ / door',80,250),
    R('transport','trip','Local delivery trip (small truck)','₹ / trip',2500,6000),
    R('installation','door','Installation, carpenter and helper','₹ / door',500,1200)
  ]
};

/* Lookup: best row for cat + key at a location and quality.
   Returns {low, high, mid, row} with multipliers applied, or null. */
MARKET.lookup=function(cat,key,location,quality){
  const q=quality||'standard',loc=location||'Bengaluru';
  const cands=MARKET.rows.filter(r=>r.cat===cat&&r.key===key&&(r.location==='all'||r.location===loc)&&(r.quality==='all'||r.quality===q));
  if(!cands.length)return null;
  cands.sort((a,b)=>((b.location!=='all')*2+(b.quality!=='all'))-((a.location!=='all')*2+(a.quality!=='all')));
  const row=cands[0];
  const L=MARKET.locations[loc]||MARKET.locations['Custom'];
  const lm=row.location==='all'?(cat==='door'?L.price:L.cost):1;
  const qm=row.quality==='all'?(MARKET.quality[q]||MARKET.quality.standard).m:1;
  const low=row.low*lm*qm,high=row.high*lm*qm;
  return{low,high,mid:(low+high)/2,row};
};

/* Several locations: a campaign can target more than one area.
   locs: array of location names (a single name also works). */
const asList=l=>(Array.isArray(l)?l:[l]).filter(Boolean);
MARKET.blend=function(locs){
  const L=asList(locs).map(n=>MARKET.locations[n]||MARKET.locations['Custom']);
  if(!L.length)return Object.assign({},MARKET.locations['Bengaluru']);
  const avg=k=>L.reduce((a,x)=>a+x[k],0)/L.length;
  return{price:avg('price'),cost:avg('cost'),cpm:avg('cpm')};
};
MARKET.lookupMulti=function(cat,key,locs,quality){
  const rs=asList(locs).map(l=>MARKET.lookup(cat,key,l,quality)).filter(Boolean);
  if(!rs.length)return MARKET.lookup(cat,key,'Bengaluru',quality);
  const avg=k=>rs.reduce((a,r)=>a+r[k],0)/rs.length;
  return{low:avg('low'),high:avg('high'),mid:avg('mid'),row:rs[0].row,n:rs.length};
};
/* "Bengaluru, Mysuru and Chennai" (Custom shows the name typed in) */
MARKET.locLabel=function(locs,customName){
  const n=asList(locs).map(l=>l==='Custom'?(String(customName||'').trim()||'your custom area'):l);
  if(!n.length)return 'no location';
  return n.length===1?n[0]:n.slice(0,-1).join(', ')+' and '+n[n.length-1];
};

if(typeof window!=='undefined')window.MABC_MARKET=MARKET;
if(typeof globalThis!=='undefined')globalThis.MABC_MARKET=MARKET;
})();
