/* Knowledge base for the Marketing Planner (js/planner.js).
   Everything here is planning guidance built from rules, not measured data. Starting cost assumptions are
   placeholders for India and must be replaced with real numbers (see js/benchmarks.js).
   Platform availability changes: the planner says "verify" wherever it is not certain. */
(function(){
'use strict';
const D={};

/* ---------- markets ---------- */
/* amazon: an Amazon marketplace exists; tiktok: TikTok Ads can be considered; jio: JioHotstar (India only);
   pinterest: 'yes' where self serve ads are established, 'verify' elsewhere; lang: suggested ad languages */
D.COUNTRIES={
  india:{label:'India',amazon:1,tiktok:0,jio:1,pinterest:'verify',lang:['English','Hindi','regional language of each state']},
  usa:{label:'USA',amazon:1,tiktok:1,jio:0,pinterest:'yes',lang:['English','Spanish where relevant']},
  uk:{label:'UK',amazon:1,tiktok:1,jio:0,pinterest:'yes',lang:['English']},
  canada:{label:'Canada',amazon:1,tiktok:1,jio:0,pinterest:'yes',lang:['English','French (Quebec)']},
  australia:{label:'Australia',amazon:1,tiktok:1,jio:0,pinterest:'yes',lang:['English']},
  uae:{label:'UAE',amazon:1,tiktok:1,jio:0,pinterest:'verify',lang:['English','Arabic']},
  saudi:{label:'Saudi Arabia',amazon:1,tiktok:1,jio:0,pinterest:'verify',lang:['Arabic','English']},
  singapore:{label:'Singapore',amazon:1,tiktok:1,jio:0,pinterest:'verify',lang:['English']},
  europe:{label:'Europe',amazon:1,tiktok:1,jio:0,pinterest:'yes',lang:['English','the local language of each country']},
  sea:{label:'Southeast Asia',amazon:'verify',tiktok:1,jio:0,pinterest:'verify',lang:['English','the local language of each country']},
  other:{label:'Other',amazon:'verify',tiktok:'verify',jio:0,pinterest:'verify',lang:['the local language']}
};
D.CITY_LANG={Bengaluru:'Kannada',Mysuru:'Kannada',Chennai:'Tamil',Coimbatore:'Tamil',Hyderabad:'Telugu',Mumbai:'Marathi',Pune:'Marathi',Kolkata:'Bengali',Ahmedabad:'Gujarati',Surat:'Gujarati',Kochi:'Malayalam',Thiruvananthapuram:'Malayalam',Delhi:'Hindi',Jaipur:'Hindi',Lucknow:'Hindi',Chandigarh:'Punjabi'};

/* ---------- business models ---------- */
D.BMODELS=[['b2b','B2B'],['b2c','B2C'],['d2c','D2C'],['ecom','Ecommerce'],['local','Local business'],['manufacturer','Manufacturer'],['distributor','Distributor'],['wholesaler','Wholesaler'],['retailer','Retailer'],['service','Service provider'],['saas','SaaS'],['marketplace','Marketplace'],['pro','Professional service'],['hybrid','Hybrid']];
/* funnel type used by the diagram, landing page and forecasting */
D.FUNNEL_OF={b2b:'b2b',manufacturer:'b2b',distributor:'b2b',wholesaler:'b2b',ecom:'ecom',d2c:'ecom',marketplace:'ecom',saas:'saas',local:'service',service:'service',pro:'service',retailer:'service',hybrid:'master',b2c:null};

/* ---------- objectives ---------- */
/* k: lead | order | reach | traffic | app | visit */
D.OBJECTIVES=[['leads','Leads','lead'],['sales','Sales','order'],['traffic','Website traffic','traffic'],['awareness','Brand awareness','reach'],['discovery','Product discovery','reach'],['app','App installs','app'],['whatsapp','WhatsApp leads','lead'],['calls','Calls','lead'],['bookings','Bookings','lead'],['demo','Demo requests','lead'],['dealer','Dealer acquisition','lead'],['distributor','Distributor acquisition','lead'],['amazon','Amazon sales','order'],['store','Store visits','visit'],['consultation','Consultation','lead'],['enquiries','Enquiries','lead']];

/* ---------- archetypes: audience, age and message defaults ---------- */
D.ARCH={
  b2b:{age:[[30,50],[25,30],[50,60]],ageWhy:'Buying decisions sit with owners, heads of department and senior managers.',gender:'All genders. Target by role and company, not gender.',occ:'Owners, procurement, operations and department heads',income:'Target by company size and industry rather than personal income',behav:'Researches suppliers online, compares quotes and asks for references before buying',intent:'High when searching, low on social feeds',angle:'Reliability, specifications, delivery timelines and total cost of ownership',lp:'b2b',funnel:'b2b',nurture:1,repeat:1,consumer:0},
  dealer:{age:[[30,55],[25,30],[55,65]],ageWhy:'Dealers and distributors are usually established business owners.',gender:'All genders. Target by business type.',occ:'Dealers, distributors, retailers, contractors',income:'Target by business type and trade association membership',behav:'Looks for new product lines with good margins, reliable supply and marketing support',intent:'Medium: they respond to margin and exclusivity',angle:'Margins, territory, supply reliability and marketing support',lp:'b2b',funnel:'dealer',nurture:1,repeat:1,consumer:0},
  ecom:{age:[[18,34],[35,44],[45,60]],ageWhy:'Online shoppers for this category skew younger, with a strong 35 to 44 segment to test.',gender:'All genders unless the product is gender specific; let the data narrow it.',occ:'Students, young professionals, homemakers',income:'Middle to upper middle income, urban and tier 2 cities',behav:'Shops on mobile, follows creators, responds to offers and reviews',intent:'Low to medium: impulse and comparison shopping',angle:'Look, price, reviews and fast delivery',lp:'ecom',funnel:'ecom',repeat:1,consumer:1},
  local:{age:[[28,55],[22,28],[55,65]],ageWhy:'Homeowners and working adults who pay for local services.',gender:'All genders.',occ:'Homeowners, tenants, working professionals',income:'Middle income and above within the service area',behav:'Searches nearby, checks ratings, messages on WhatsApp before booking',intent:'High when searching, medium on social',angle:'Speed, trust, local reviews and clear pricing',lp:'local',funnel:'service',consumer:1},
  highticket:{age:[[30,50],[25,30],[50,65]],ageWhy:'People with the budget and life stage for a large purchase (new home, upgrade, event).',gender:'All genders. Decisions are often made as a couple or family.',occ:'Salaried professionals, business owners, NRIs',income:'Upper middle and affluent households',behav:'Researches for weeks, compares options, visits before deciding',intent:'Medium: long consideration',angle:'Quality, proof of past work, transparency and a low risk first step',lp:'highticket',funnel:'service',nurture:1,consumer:1},
  realestate:{age:[[30,50],[25,30],[50,65]],ageWhy:'First and second home buyers, with an investor segment above 50.',gender:'All genders. Couples usually decide together.',occ:'Salaried professionals, business owners, NRIs',income:'Upper middle and affluent',behav:'Compares projects, checks location and builder track record, visits sites',intent:'Medium to high near launch or possession',angle:'Location, price, possession date and builder trust',lp:'realestate',funnel:'service',nurture:1,consumer:1},
  health:{age:[[25,55],[18,25],[55,70]],ageWhy:'Adults who manage their own and their family’s care.',gender:'All genders.',occ:'Working adults and parents',income:'Middle income and above',behav:'Searches symptoms and treatments, reads reviews, prefers nearby clinics',intent:'High when searching for a treatment',angle:'Expertise, safety, results and easy booking',lp:'health',funnel:'service',repeat:1,consumer:1},
  edu:{age:[[18,25],[35,50],[25,35]],ageWhy:'Students who study and the parents who pay, plus working professionals who upskill.',gender:'All genders.',occ:'Students, parents, working professionals',income:'Middle income and above',behav:'Compares institutes, watches demo classes, asks about placements and results',intent:'Seasonal: peaks before admissions and exams',angle:'Outcomes, faculty, results and flexible schedules',lp:'lead',funnel:'service',consumer:1},
  saas:{age:[[25,45],[45,55],[22,25]],ageWhy:'Managers and team leads who evaluate software, plus founders.',gender:'All genders. Target by role.',occ:'Founders, managers, team leads, IT and operations',income:'Target by company size',behav:'Reads reviews and comparisons, starts trials, involves the team',intent:'High when searching for a solution',angle:'Time saved, ROI, integrations and ease of setup',lp:'saas',funnel:'saas',repeat:1,consumer:0},
  pro:{age:[[30,55],[25,30],[55,65]],ageWhy:'Business owners and individuals who need expert help.',gender:'All genders.',occ:'Business owners, professionals, families',income:'Middle income and above',behav:'Asks for referrals, checks credentials, prefers a first consultation',intent:'High when a need arises',angle:'Credentials, clarity on fees and a fast first consultation',lp:'highticket',funnel:'service',nurture:1,consumer:1},
  hosp:{age:[[25,45],[45,60],[21,25]],ageWhy:'Couples, families and working professionals who travel for leisure.',gender:'All genders.',occ:'Working professionals, families',income:'Middle income and above',behav:'Plans around holidays and long weekends, compares prices and reviews',intent:'Seasonal: peaks before holidays',angle:'Experience, value, reviews and flexible cancellation',lp:'local',funnel:'service',consumer:1},
  food:{age:[[18,40],[40,55],[16,18]],ageWhy:'Frequent orderers skew young and urban.',gender:'All genders.',occ:'Students, young professionals, families',income:'All income groups within delivery range',behav:'Orders on impulse around meal times, follows offers',intent:'High at meal times',angle:'Taste, speed, offers and hygiene',lp:'local',funnel:'ecom',repeat:1,consumer:1},
  fitness:{age:[[20,35],[35,45],[45,55]],ageWhy:'Most new members join between 20 and 35; 35 to 45 is a strong second segment.',gender:'All genders; test separate creatives by goal.',occ:'Students, working professionals',income:'Middle income and above near the gym',behav:'Starts in January and before events, responds to trials and transformations',intent:'Medium: needs motivation',angle:'Results, community, trainers and a free trial',lp:'local',funnel:'service',repeat:1,consumer:1}
};

/* ---------- industries (planner list) ---------- */
/* [label, calculator key, archetype, default business model, product noun, primary buyer, secondary buyer, interests, pains, visual category] */
const IND=[
  ['Service business','service','local','service','our service','Local customers who need the service now','People planning ahead','Home improvement|Local businesses|Family','Unreliable providers|Hidden charges|Slow response',0],
  ['B2B','b2b','b2b','b2b','our product','Business owners and procurement heads','Department managers who influence the purchase','Business|Entrepreneurship|Industry news','Unreliable suppliers|Slow delivery|Poor after sales support',0],
  ['B2C','b2c','ecom','b2c','our product','Everyday consumers in your category','Gift buyers','Shopping|Lifestyle|Deals','High prices|Poor quality|Slow delivery',0],
  ['Ecommerce','b2c','ecom','ecom','our products','Online shoppers in your category','Gift buyers and repeat customers','Online shopping|Deals|Your product category','Fake products|Returns hassle|Slow delivery',1],
  ['D2C','d2c','ecom','d2c','our brand','Online shoppers who prefer brands','Loyal repeat buyers','Online shopping|Brands|Your product category','Generic products|Inconsistent quality',1],
  ['Door manufacturer','door','dealer','manufacturer','doors','Door dealers, builders and contractors','Architects and interior designers','Construction|Interior design|Home improvement|Real estate','Inconsistent quality|Late delivery|Poor finish',1],
  ['Door retailer','door','highticket','retailer','doors','Homeowners building or renovating','Architects and contractors choosing products','Home improvement|Interior design|Real estate','Poor finish|Warping|Late installation',1],
  ['Timber importer','timber','b2b','distributor','imported timber','Timber traders, furniture makers and contractors','Architects and builders','Construction|Furniture|Woodworking','Inconsistent grade|Moisture|Supply delays',0],
  ['Timber retailer','timber','highticket','retailer','timber','Carpenters, furniture makers and homeowners','Interior contractors','Woodworking|Furniture|Home improvement','Wrong grade|Wastage|Price uncertainty',0],
  ['Furniture','furniture','highticket','retailer','furniture','Homeowners furnishing a new or renovated home','Offices and cafes','Home decor|Interior design|Furniture','Poor quality|Late delivery|Size mismatch',1],
  ['Interior design','interior','highticket','service','interior design','Homeowners with a new or renovated home','Offices and retail spaces','Interior design|Home decor|Real estate','Budget overruns|Delays|Poor execution',1],
  ['Real estate','realestate','realestate','b2c','homes','Home buyers planning a first or bigger home','Investors and NRIs','Real estate|Home loans|Investment','Delayed possession|Hidden costs|Builder trust',0],
  ['Healthcare','clinic','health','local','treatment','Patients looking for a trusted specialist','Family members who book on their behalf','Health and wellness|Fitness|Family','Long waits|Unclear costs|Trust',0],
  ['Dental','dental','health','local','dental care','Adults who need treatment or a better smile','Parents booking for children','Health|Beauty|Family','Pain|Cost|Fear of treatment',0],
  ['Education','education','edu','service','courses','Students choosing a course','Parents who pay and decide','Education|Careers|Exams','Uncertain outcomes|Fees|Time',0],
  ['Coaching','education','edu','service','coaching','Students and professionals who want results','Parents','Education|Self improvement|Careers','No results|Generic teaching',0],
  ['SaaS','saas','saas','saas','our software','Managers who own the problem the software solves','Founders and finance approvers','Technology|Productivity|Business software','Manual work|Tool sprawl|Hidden costs',0],
  ['Technology','saas','saas','b2b','our technology','IT and operations leaders','Founders and CXOs','Technology|Cloud|Business','Downtime|Integration effort|Cost',0],
  ['Manufacturing','manufacturing','b2b','manufacturer','our products','Procurement heads and plant managers','Design and engineering teams','Manufacturing|Engineering|Industry news','Quality rejects|Delivery delays|MOQ',0],
  ['Industrial machinery','machinery','b2b','manufacturer','machines','Plant owners and production heads','Maintenance and engineering managers','Manufacturing|Engineering|Automation','Downtime|Service support|Payback',0],
  ['Building materials','buildmat','dealer','distributor','building materials','Dealers, contractors and builders','Homeowners and architects','Construction|Real estate|Home improvement','Inconsistent supply|Quality|Credit terms',1],
  ['Architecture','architecture','pro','pro','architecture services','Homeowners and developers planning a build','Commercial property owners','Architecture|Interior design|Real estate','Budget overruns|Approvals|Design mismatch',1],
  ['Automotive','automotive','highticket','retailer','vehicles','Car buyers comparing models','Owners due for service or upgrade','Cars|Automotive|Travel','Price|Resale value|Service trust',0],
  ['Finance','finance','pro','service','financial products','Salaried people planning loans or investments','Self employed and small business owners','Personal finance|Investment|Business','Rejections|Hidden charges|Paperwork',0],
  ['Insurance','finance','pro','service','insurance','Families and earners who need cover','Business owners','Personal finance|Health|Family','Claim rejections|Complex policies',0],
  ['Travel','travel','hosp','service','holiday packages','Couples and families planning a holiday','Corporate travel planners','Travel|Holidays|Adventure','Hidden costs|Poor hotels|Planning effort',1],
  ['Hospitality','travel','hosp','local','stays','Travellers looking for a stay','Corporate and event bookings','Travel|Weekend getaways|Food','Poor reviews|Hidden fees',1],
  ['Restaurant','food','food','local','food','Nearby diners and delivery customers','Party and group orders','Food|Dining|Delivery','Late delivery|Hygiene|Price',1],
  ['Fitness','fitness','fitness','local','memberships','People starting their fitness journey','Returning members','Fitness|Health|Sports','Lack of results|Crowded gyms|Motivation',0],
  ['Beauty','beauty','ecom','d2c','beauty products','Skincare and beauty shoppers','Gift buyers','Beauty|Skincare|Fashion','Skin reactions|Fake products',1],
  ['Cosmetics','beauty','ecom','d2c','cosmetics','Makeup and skincare shoppers','Gift buyers','Beauty|Makeup|Fashion','Fake products|Shade mismatch',1],
  ['Fashion','fashion','ecom','ecom','clothing','Style conscious online shoppers','Gift buyers','Fashion|Shopping|Lifestyle','Fit issues|Returns|Quality',1],
  ['Jewellery','jewellery','highticket','retailer','jewellery','Buyers for weddings, festivals and gifts','Self purchase and investment buyers','Jewellery|Weddings|Fashion','Purity|Making charges|Trust',1],
  ['Home decor','homedecor','ecom','ecom','home decor','Homeowners styling their space','Gift buyers','Home decor|Interior design|Lifestyle','Quality|Colour mismatch|Delivery damage',1],
  ['Legal','legal','pro','pro','legal services','Individuals and businesses facing a legal matter','Businesses needing ongoing counsel','Business|Law|Real estate','Unclear fees|Slow process|Trust',0],
  ['Accounting','accounting','pro','pro','accounting services','Small business owners and startups','Salaried individuals filing taxes','Business|Finance|Entrepreneurship','Compliance stress|Penalties|Time',0],
  ['Consulting','consulting','pro','pro','consulting','Founders and leadership teams','Department heads with a specific problem','Business|Leadership|Strategy','Stalled growth|Execution gaps',0],
  ['Marketing agency','agency','pro','service','marketing services','Business owners who need growth','Marketing managers','Marketing|Business|Entrepreneurship','Wasted ad spend|No leads|Poor reporting',0],
  ['Photography','photography','highticket','service','photography','Couples and families with an upcoming event','Brands needing commercial shoots','Weddings|Photography|Events','Missed moments|Late delivery',1],
  ['Wedding','wedding','highticket','service','wedding services','Couples planning a wedding','Parents who fund and decide','Weddings|Fashion|Travel','Budget overruns|Stress|Vendor reliability',1],
  ['Events','wedding','highticket','service','event management','Companies and families planning events','Agencies needing partners','Events|Business|Entertainment','Poor execution|Budget overruns',1],
  ['Other','custom','local','hybrid','our offer','Your primary customer','Your secondary customer','Your category','Your customer’s main problem',0]
];
D.INDUSTRIES=IND.map((r,i)=>({id:'i'+i,label:r[0],calc:r[1],arch:r[2],model:r[3],noun:r[4],buyer:r[5],buyer2:r[6],interests:r[7].split('|'),pains:r[8].split('|'),visual:!!r[9]}));

/* ---------- platforms ---------- */
D.PLATFORMS={
  meta:{name:'Meta Ads',short:'Meta',funnel:{def:'Awareness → Consideration → Conversion → Retargeting',b2b:'Awareness → Lead form → Qualification → Retargeting',ecom:'Awareness → Product interest → Purchase → Retargeting'},
    formats:['Reels','Static image','Carousel','UGC video','Testimonial','Product demo','Founder video','Before and after','Problem and solution','Offer'],
    audiences:['Location and radius','Age and gender','Detailed interests','Behaviours where available','Custom audiences (website, customer list)','Lookalike audiences','Video viewers','Instagram and Facebook engagers'],
    tags:['Meta Pixel','Conversions API (CAPI)'],cpm:180,ctr:1,convLead:8,convOrder:2,quality:1,freq:2.5},
  google:{name:'Google Ads',short:'Google',funnel:{def:'Intent → Search → Landing page → Conversion',ecom:'Intent → Search or Shopping → Product page → Purchase',b2b:'Intent → Search → Landing page → Lead → Sales call'},
    formats:['Responsive search ads','Performance Max assets','Shopping product feed','YouTube video','Demand Gen images and video','Display banners'],
    audiences:['Search intent keywords','In market audiences','Affinity audiences','Remarketing lists','Customer Match','Website visitors','YouTube viewers'],
    tags:['Google Tag Manager (GTM)','Google Analytics 4 (GA4)','Google Ads conversion tracking','Enhanced conversions'],cpm:1200,ctr:4,convLead:6,convOrder:2.5,quality:1.25,freq:1.5},
  linkedin:{name:'LinkedIn Ads',short:'LinkedIn',funnel:{def:'Awareness → Content → Lead → Meeting → Sale',b2b:'Awareness → Engagement → Lead → Demo → Meeting → Proposal → Sale'},
    formats:['Case study','Thought leadership post','Whitepaper or guide','Webinar invite','Product demo video','Testimonial','Industry report','Document ads'],
    audiences:['Job titles','Job functions','Seniority','Company industry','Company size','Company location','Matched company lists (ABM)','Website retargeting'],
    tags:['LinkedIn Insight Tag','LinkedIn Conversions API'],cpm:700,ctr:0.6,convLead:5,convOrder:0.5,quality:1.3,freq:3},
  jiohotstar:{name:'JioHotstar Ads',short:'JioHotstar',funnel:{def:'Reach → Video → Awareness → Search and retargeting'},
    formats:['Video ads (in stream)','Display','Sponsorship and special inventory where available'],
    audiences:['Location','Age','Gender','Language','Content and contextual segments where available'],
    tags:['Brand lift or reach reporting from the platform','Search uplift tracked in Google Ads and GA4'],cpm:250,ctr:0.3,convLead:1,convOrder:0.3,quality:0.6,freq:3},
  tiktok:{name:'TikTok Ads',short:'TikTok',funnel:{def:'Discovery → Engagement → Product → Purchase',b2b:'Discovery → Engagement → Lead'},
    formats:['UGC video','Creator content (Spark Ads)','Product demo','Native vertical video','Trend based creative','Testimonial','Before and after'],
    audiences:['Location','Age','Gender','Interests','Behaviours','Devices','Custom audiences','Website visitors','Lookalike audiences'],
    tags:['TikTok Pixel','TikTok Events API'],cpm:150,ctr:0.9,convLead:4,convOrder:1.2,quality:0.8,freq:2},
  pinterest:{name:'Pinterest Ads',short:'Pinterest',funnel:{def:'Discovery → Inspiration → Product → Purchase',service:'Discovery → Inspiration → Idea board → Enquiry'},
    formats:['Product pins','Video pins','Carousel','Collections','Shopping catalog ads where available'],
    audiences:['Keywords','Interests','Categories','Demographics','Website visitors','Customer lists','Audience expansion where available'],
    tags:['Pinterest Tag','Pinterest Conversions API'],cpm:200,ctr:0.6,convLead:3,convOrder:1.5,quality:0.9,freq:2},
  amazon:{name:'Amazon Ads',short:'Amazon',funnel:{def:'Search → Product view → Cart → Purchase'},
    formats:['Sponsored Products','Sponsored Brands (headline and video)','Sponsored Display','Amazon DSP where applicable','A+ content and Brand Store'],
    audiences:['Keyword targeting (exact, phrase, broad)','Product and category targeting','Automatic targeting','Views remarketing (Sponsored Display)','In market audiences (DSP where applicable)'],
    tags:['Amazon Attribution (for off Amazon traffic)','Amazon Brand Analytics and Seller Central reports'],cpm:800,ctr:0.4,convLead:0,convOrder:10,quality:1,freq:1.5}
};
D.PLATFORM_ORDER=['meta','google','linkedin','jiohotstar','tiktok','pinterest','amazon'];

/* ---------- modules ---------- */
D.MODULES=[
  ['platforms','Platform recommendation','Which ad platforms to use and why','gear'],
  ['audience','Target audience','Personas, interests, job titles and retargeting','phone'],
  ['demo','Age and demographics','Age groups, gender, location and language','home'],
  ['budget','Budget allocation','Split across platforms and funnel stages','rupee'],
  ['funnel','Funnel diagram','Your performance marketing funnel, visually','box'],
  ['phases','Phase wise strategy','Discovery to retention, phase by phase','ruler'],
  ['creative','Creative strategy','Formats, hooks, messages and CTAs','camera'],
  ['landing','Landing page strategy','Page structure, CRO score and fixes','lamp'],
  ['campaigns','Campaign structure','Campaigns, ad sets and objectives per platform','briefcase'],
  ['forecast','Forecasting','Impressions to revenue, ROAS and ROI','calc'],
  ['profit','Profitability','Gross and net profit, CAC and breakeven','scale'],
  ['plan90','90 day plan','Week by week: test, optimise, scale','book'],
  ['tracking','Tracking and analytics','Pixels, tags and conversion events','code'],
  ['custom','Custom module','Describe what you need, get a strategy','bulb']
];

/* ---------- funnels by business type ---------- */
/* each stage: [label, forecast key or ''] */
D.FUNNELS={
  b2b:[['Awareness','impr'],['Website visit','clicks'],['Lead','leads'],['Qualified lead','qual'],['Meeting','meet'],['Proposal',''],['Negotiation',''],['Customer','cust'],['First order','revenue'],['Repeat order',''],['LTV','']],
  dealer:[['Awareness','impr'],['Lead','leads'],['Qualified dealer','qual'],['Meeting','meet'],['Sample or catalogue',''],['First order','cust'],['Repeat orders',''],['Dealer LTV','']],
  ecom:[['Impression','impr'],['Click','clicks'],['Product view',''],['Add to cart',''],['Checkout',''],['Purchase','cust'],['Repeat purchase',''],['Customer LTV','']],
  service:[['Impression','impr'],['Click','clicks'],['Landing page',''],['Lead','leads'],['Qualified lead','qual'],['Call or consultation','meet'],['Proposal',''],['Customer','cust'],['Revenue','revenue']],
  saas:[['Impression','impr'],['Click','clicks'],['Website visitor',''],['Signup','leads'],['Trial','qual'],['Paid customer','cust'],['Expansion',''],['LTV','']],
  master:[['Awareness','impr'],['Reach','reach'],['Engagement',''],['Website visit','clicks'],['Lead or product view','leads'],['Qualified lead or add to cart','qual'],['Meeting or checkout','meet'],['Sale or purchase','cust'],['Revenue','revenue'],['Profit','net']]
};
D.STAGE_NOTE={Awareness:'People first see the brand',Reach:'Unique people reached',Impression:'Ad shown',Click:'Someone clicks through','Website visit':'Lands on your site','Landing page':'Reads the offer',Lead:'Shares contact details','Qualified lead':'Fits budget, need and location','Qualified dealer':'Right business type and territory',Meeting:'Call, visit or demo held','Call or consultation':'First conversation','Sample or catalogue':'Evaluates your product',Proposal:'Receives a quote',Negotiation:'Terms discussed',Customer:'Pays you','First order':'First revenue','Repeat order':'Buys again','Repeat orders':'Orders again','Repeat purchase':'Buys again','Product view':'Views a product','Add to cart':'Shows purchase intent',Checkout:'Starts paying',Purchase:'Completes the order','Customer LTV':'Lifetime value','Dealer LTV':'Lifetime value of the dealer',LTV:'Lifetime value','Website visitor':'Visits the site',Signup:'Creates an account',Trial:'Tries the product','Paid customer':'Starts paying',Expansion:'Upgrades or adds seats',Engagement:'Likes, comments, views','Lead or product view':'Shows interest','Qualified lead or add to cart':'Shows real intent','Meeting or checkout':'Close to buying','Sale or purchase':'Pays you',Revenue:'Money in',Profit:'Money kept'};

/* ---------- creative hooks (templates: {p} product, {b} buyer, {loc} location) ---------- */
D.HOOKS={
  b2b:['Still losing orders to late deliveries? See how we ship {p} on schedule.','What 3 buyers asked before switching to our {p}.','The real cost of cheap {p}: a 60 second breakdown.','Case study: how a client cut rejects with our {p}.'],
  dealer:['Add {p} to your range: better margins, reliable supply.','Why dealers in {loc} are switching to our {p}.','Territory open: become our {p} partner.','See our factory: how we make {p} that dealers trust.'],
  ecom:['The {p} everyone in {loc} is asking about.','We tested it for 30 days. Here is what happened.','3 reasons our {p} sell out every month.','Before and after: the difference our {p} make.'],
  local:['Need {p} in {loc} today? We are 30 minutes away.','Rated by your neighbours: see why.','No hidden charges on {p}. Here is our price list.','What to check before you book {p}.'],
  highticket:['Planning {p}? Avoid these 5 costly mistakes.','See a finished project in {loc}, start to finish.','Why our clients never go over budget.','Book a free consultation: walk away with a clear plan.'],
  realestate:['Homes in {loc} from a builder with on time possession.','See the site and the sample flat this weekend.','What your EMI looks like for a 2 BHK here.','Why investors are choosing {loc} right now.'],
  health:['Worried about your symptoms? Talk to a specialist in {loc}.','What treatment really involves, explained by our doctor.','Real patient stories from {loc}.','Book a consultation today, no long waits.'],
  edu:['The course that got our students placed.','Free demo class this week: see how we teach.','What topper students do differently.','Fees, schedule and outcomes, explained in 60 seconds.'],
  saas:['Stop doing this by hand: see {p} in 60 seconds.','How a team like yours saved 10 hours a week.','{p} vs spreadsheets: an honest comparison.','Start a free trial, set up in minutes.'],
  pro:['Confused about your options? Get clear advice in one call.','3 mistakes people make before hiring an expert.','Client story: how we solved it in 2 weeks.','Transparent fees. Book your first consultation.'],
  hosp:['Your next weekend getaway, sorted.','See the view before you book.','Guests keep coming back for this.','Book direct and get the best rate.'],
  food:['Hungry? Hot {p} in 30 minutes.','The dish {loc} keeps reordering.','Behind the kitchen: how we cook {p}.','Tonight only: first order offer.'],
  fitness:['Your first week at our gym is on us.','Real members, real transformations.','A workout plan that fits your day.','Meet the trainers who get results.']
};

/* ---------- landing page types ---------- */
D.LP={
  b2b:{label:'B2B lead generation page',sections:['Hero','Problem','Solution','Benefits','Product or service','Proof','Process','Offer','FAQ','Final CTA'],cta:'Request a quote',offer:'Free sample, site assessment or technical consultation',proof:'Client logos, case studies with numbers, certifications'},
  lead:{label:'Lead generation page',sections:['Hero','Problem','Solution','Benefits','Proof','Process','Offer','FAQ','Final CTA'],cta:'Book a free call',offer:'Free consultation or demo class',proof:'Results, testimonials and ratings'},
  ecom:{label:'Product page (ecommerce)',sections:['Hero','Benefits','Product or service','Proof','Offer','FAQ','Final CTA'],cta:'Add to cart',offer:'First order discount, free shipping or bundle',proof:'Star ratings, reviews with photos, UGC'},
  saas:{label:'SaaS trial or demo page',sections:['Hero','Problem','Solution','Benefits','Product or service','Proof','Process','Offer','FAQ','Final CTA'],cta:'Start free trial',offer:'Free trial or live demo',proof:'Customer logos, G2 or review ratings, case studies'},
  health:{label:'Appointment booking page (healthcare)',sections:['Hero','Problem','Solution','Proof','Process','Offer','FAQ','Final CTA'],cta:'Book an appointment',offer:'Consultation slot this week',proof:'Doctor credentials, patient reviews, registrations'},
  realestate:{label:'Project page (real estate)',sections:['Hero','Product or service','Benefits','Proof','Process','Offer','FAQ','Final CTA'],cta:'Book a site visit',offer:'Site visit with pickup, launch pricing',proof:'RERA details, builder track record, possession history'},
  highticket:{label:'Consultation page (high ticket)',sections:['Hero','Problem','Solution','Benefits','Proof','Process','Offer','FAQ','Final CTA'],cta:'Book a free consultation',offer:'Free consultation with a written plan',proof:'Portfolio, before and after, client videos'},
  local:{label:'Local business page',sections:['Hero','Benefits','Product or service','Proof','Process','Offer','FAQ','Final CTA'],cta:'Call or WhatsApp now',offer:'Same day slot or first visit offer',proof:'Google rating, local reviews, years in business'},
  amazon:{label:'Amazon listing and Brand Store',sections:['Hero','Benefits','Product or service','Proof','Offer','FAQ'],cta:'Add to cart on Amazon',offer:'Coupon, Lightning Deal or bundle',proof:'Ratings and reviews, A+ comparison chart'}
};
D.FAQ={
  b2b:['What is the minimum order quantity?','What are the delivery timelines?','Do you offer samples?','What certifications do you hold?','What are the payment terms?'],
  dealer:['What margins do dealers earn?','Is my territory available?','What marketing support do you give?','What is the minimum first order?','How fast is replenishment?'],
  ecom:['How long does delivery take?','What is the return policy?','Is cash on delivery available?','How do I choose the right size or variant?','Is it original?'],
  local:['Which areas do you cover?','How soon can you come?','What are your charges?','Do you give a warranty?','How do I pay?'],
  highticket:['What does it cost?','How long does it take?','Can I see past work?','What is included?','How do payments work?'],
  realestate:['What is the possession date?','Is the project RERA registered?','Which banks give loans here?','What are the total charges?','Can I visit the sample flat?'],
  health:['Do I need an appointment?','What does the consultation cost?','Is the treatment painful?','How many sessions will I need?','Do you accept insurance?'],
  edu:['What are the fees and EMI options?','What is the batch schedule?','Do you help with placements?','Is there a demo class?','Online or offline?'],
  saas:['Is there a free trial?','How long does setup take?','Which tools does it integrate with?','Is my data secure?','Can I cancel anytime?'],
  pro:['What are your fees?','How long will it take?','What documents do I need?','Is the first consultation free?','Do you work remotely?'],
  hosp:['What is the cancellation policy?','Is breakfast included?','How far is it from the airport or station?','Is parking available?','Can I check in early?'],
  food:['What areas do you deliver to?','How long does delivery take?','Do you have vegetarian options?','Is there a minimum order?','How do I pay?'],
  fitness:['Is there a free trial?','What are the timings?','Are trainers included?','Can I pause my membership?','Is parking available?']
};

/* ---------- custom module themes (keyword → strategy block) ---------- */
D.THEMES=[
  {k:['dealer','distributor','channel','partner','franchise'],name:'Dealer and channel acquisition',objective:'Recruit and activate trade partners',audience:'Existing dealers in adjacent categories, distributors, contractors and retailers',platforms:['linkedin','meta','google'],funnel:'Awareness → Enquiry → Qualification call → Factory or showroom visit → Sample order → First order → Repeat orders',creative:['Margin and earnings story','Factory tour video','Dealer testimonial','Territory availability announcement'],offer:'Introductory margin, sample kit and marketing support',kpi:['Cost per dealer enquiry','Qualified dealer rate','Dealers onboarded','First order value','90 day repeat order rate']},
  {k:['launch','new product','introduce'],name:'Product launch',objective:'Build awareness and first sales for a new offer',audience:'Category buyers plus existing customers and engagers',platforms:['meta','google','jiohotstar','tiktok'],funnel:'Teaser → Reveal → Early access → Launch offer → Reviews → Scale',creative:['Teaser countdown','Founder reveal video','Unboxing or demo','Early buyer reviews'],offer:'Launch price or early access bonus',kpi:['Reach','Waitlist signups','Launch week sales','Cost per purchase']},
  {k:['festive','diwali','season','sale','christmas','eid','wedding season'],name:'Seasonal campaign',objective:'Capture peak season demand',audience:'Past buyers, engagers and in market shoppers',platforms:['meta','google','amazon'],funnel:'Warm up → Offer reveal → Peak days → Last chance → Post season retention',creative:['Countdown','Gift guide carousel','Offer statics','Last chance reels'],offer:'Time bound discount or bundle',kpi:['Cost per purchase','Revenue per day','ROAS','Repeat purchase after season']},
  {k:['hiring','recruit','job','talent'],name:'Recruitment campaign',objective:'Attract qualified applicants',audience:'Candidates by role, experience and location',platforms:['linkedin','meta','google'],funnel:'Employer brand → Job ad → Application → Screening → Interview → Hire',creative:['Team day in the life','Employee testimonial','Role and salary highlights'],offer:'Clear salary range and growth path',kpi:['Cost per application','Qualified applicant rate','Cost per hire']},
  {k:['app','install','download'],name:'App growth',objective:'Drive installs and activation',audience:'Mobile users matching your core persona',platforms:['google','meta','tiktok'],funnel:'Install → Signup → Activation → First purchase → Retention',creative:['App walkthrough','Feature in 15 seconds','User reviews'],offer:'Signup bonus or first order credit',kpi:['Cost per install','Activation rate','Cost per activated user','Day 30 retention']},
  {k:['store','footfall','walk in','showroom visit'],name:'Store footfall',objective:'Bring nearby people into the store',audience:'People within a short radius of each store',platforms:['meta','google'],funnel:'Local awareness → Directions or call → Visit → Purchase',creative:['Store tour','In store offer','Local customer testimonial'],offer:'In store only offer or event',kpi:['Store visits (where measured)','Direction requests','Calls','Cost per visit']},
  {k:['review','reputation','rating'],name:'Reputation building',objective:'Grow reviews and trust',audience:'Recent customers and engagers',platforms:['meta','google'],funnel:'Purchase → Review request → Review → Social proof in ads',creative:['Customer story','Review highlight statics'],offer:'Thank you gift for honest reviews (follow platform rules)',kpi:['Reviews per month','Average rating','Conversion rate lift']},
  {k:['webinar','event','workshop','masterclass'],name:'Webinar or event funnel',objective:'Fill seats and convert attendees',audience:'Your ideal customer profile plus warm audiences',platforms:['linkedin','meta','google'],funnel:'Invite → Registration → Reminder → Attendance → Offer → Sales call',creative:['Speaker video','What you will learn carousel','Reminder statics'],offer:'Free seat, bonus resource for attendees',kpi:['Cost per registration','Show up rate','Attendee to lead rate']},
  {k:['retention','loyalty','repeat','upsell','cross sell','winback','win back'],name:'Retention and loyalty',objective:'Grow repeat purchases and lifetime value',audience:'Existing customers, lapsed buyers',platforms:['meta','google'],funnel:'Customer → Reminder → Repeat purchase → Upsell → Referral',creative:['Replenishment reminder','New arrivals for customers','Referral offer'],offer:'Loyalty points, bundle or referral reward',kpi:['Repeat purchase rate','LTV','Referral rate']},
  {k:['export','international','overseas','global'],name:'International expansion',objective:'Win buyers in a new market',audience:'Importers, distributors and buyers in the target country',platforms:['linkedin','google','meta'],funnel:'Market awareness → Enquiry → Sample → Trial order → Contract',creative:['Capability video','Certifications and compliance','Case study from an existing export market'],offer:'Sample shipment or trial order terms',kpi:['Cost per qualified enquiry','Sample to order rate','First order value']}
];

globalThis.MABC_PLANNER_DATA=D;
})();
