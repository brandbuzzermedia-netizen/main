# Metrics and planner logic

## Calculator formulas (same as the web tool)

Top of funnel
- Impressions = spend ÷ CPM × 1,000. Reach = impressions ÷ frequency. Clicks = impressions × CTR. CPC = spend ÷ clicks.
- Lead businesses: leads = clicks × landing page conversion (or spend ÷ CPL in manual mode), then each funnel stage is a % of the one before.
- Order businesses: purchases come from clicks (or spend ÷ cost per purchase in manual mode).

Money
- Gross profit = revenue minus the variable costs of those sales (COGS, shipping, commissions, delivery cost and so on).
- Net profit = gross profit minus ad spend minus other campaign costs.
- Total investment = variable costs + ad spend + campaign costs.

Ratios
- **ROAS** = revenue ÷ ad spend. How much revenue each ₹1 of ads brings in.
- **Profit ROAS** = net profit ÷ ad spend. How much profit each ₹1 of ads brings in. This is the number that pays the bills.
- **ROI** = net profit ÷ total investment × 100.
- **Breakeven ROAS** = 1 ÷ gross margin. Below this, every sale loses money once ads are paid. It differs by business because margins differ.
- **Breakeven CPL / CPP**: the most you can pay per lead or purchase and still break even.
- **CAC** = all in cost (ads + campaign costs) per customer. **Breakeven CAC** = gross profit per customer.
- **LTV** = lifetime value (repeat purchases, renewals). For recurring businesses (SaaS, agencies, accounting, fitness), ROAS counts only the months named in the result, and LTV is shown separately. LTV ÷ CAC above 3 is healthy.

Ranges and scenarios
- Conservative case: acquisition cost +15%, conversion −10%, value −5%.
- Aggressive case: acquisition cost −10%, conversion +10%, value +5%.
- Likely ranges are the span between those two cases.
- Scaling: each doubling of budget raises CPM (and CPL) by `drop`%. Doubling spend rarely doubles profit.

## Planner logic

Platform eligibility (rules, not AI)
- TikTok is excluded in India. JioHotstar is India only. Amazon is excluded unless the product is listed (`amazonListed: "yes"`) and the market has a marketplace.
- Pinterest, and JioHotstar inventory, show "verify" where availability is uncertain. Tell the person to confirm in the ads manager.
- Each platform gets a fit score from industry type (B2B vs consumer, visual category), objective and budget. LinkedIn scores high for B2B and dealer goals, Pinterest for visual categories, Google for search intent. Small budgets concentrate on fewer platforms.

Budget split
- Shares are weighted by fit score, with 10% held back for testing.
- There is also a split by funnel stage (awareness, consideration, conversion, retargeting) that follows the objective.
- A manual split (`ov.alloc`, platform id to weight) overrides it.

Forecast
- Per platform starting costs (CPM, CTR, conversion rates) are placeholders for India, not benchmarks.
- Economics (order value, margin) come from the matching industry calculator.
- **ACOS** = Amazon ad spend ÷ Amazon ad revenue. **TACOS** = Amazon ad spend ÷ total Amazon revenue, including organic. TACOS falling over time means ads are building organic sales.

Wording
- Present everything as projections, not guaranteed results.
- Don't present placeholder costs as market data.
