/* Benchmark references for the "Suggested assumptions" panel (Advanced mode).
   Intentionally empty: no benchmark numbers are built in, because none have been verified.
   Add references only from a real source, and always record where they came from.

   Shape:
     data: {
       <industry key>: {
         <metric>: {value, sourceType, source, date}
       }
     }
   Industry keys are the `key` values in js/industries.js (and 'door').
   Metrics: ctr (%), cpc (₹), cpm (₹), cpl (₹, CPP for ecommerce), conv (% lead or click to customer),
            cac (₹), ticket (₹ AOV or ticket size), close (% last funnel stage).
   sourceType: one of the keys in `sources`.

   Example (do not uncomment without a real source):
     realestate: { cpl: {value: 450, sourceType: 'agency', source: 'GBS client campaigns, Bengaluru, 12 accounts', date: '2026-09'} }

   Each viewer can also save their own current numbers as a 'user' reference from the panel; that is stored
   in their browser only. */
(function(){
'use strict';
globalThis.MABC_BENCH={
  sources:{
    verified:'Verified industry source',
    agency:'Agency historical data',
    meta:'Meta campaign data',
    user:'Your own historical data',
    saved:'Saved by you in this browser'
  },
  data:{}
};
})();
