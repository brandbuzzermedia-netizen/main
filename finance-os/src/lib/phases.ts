/**
 * Features held back for a later phase. They stay in the code and the database (nothing is deleted);
 * only the screens and links are hidden. Turn one on in Vercel and redeploy.
 *
 *   NEXT_PUBLIC_PHASE2_RECEIVABLES=true  -> clients, invoices, payments and payment links (phase 2)
 */
export const receivablesOn = () => process.env.NEXT_PUBLIC_PHASE2_RECEIVABLES === "true";
