import type { Db } from "@/lib/db";

export interface WorkloadRow {
  user_id: string;
  full_name: string;
  clients: number;
  pending: number;
  approved_today: number;
  opportunities_today: number;
  publishing: number;
  failed: number;
}

/** Per account manager: assigned clients and the queues on those clients (RLS-filtered for the viewer). */
export function accountManagerWorkload(db: Db): Promise<WorkloadRow[]> {
  return db.query<WorkloadRow>(
    `select u.id as user_id, u.full_name,
            count(distinct am.client_id)::int as clients,
            (select count(*)::int from comments c join account_managers a on a.client_id = c.client_id where a.user_id = u.id and c.status = 'pending_approval') as pending,
            (select count(*)::int from comments c join account_managers a on a.client_id = c.client_id where a.user_id = u.id and c.approved_at >= date_trunc('day', now())) as approved_today,
            (select count(*)::int from engagement_opportunities o join account_managers a on a.client_id = o.client_id where a.user_id = u.id and o.discovered_at >= date_trunc('day', now())) as opportunities_today,
            (select count(*)::int from publishing_jobs j join account_managers a on a.client_id = j.client_id where a.user_id = u.id and j.status in ('queued','publishing','manual_required')) as publishing,
            (select count(*)::int from publishing_jobs j join account_managers a on a.client_id = j.client_id where a.user_id = u.id and j.status = 'failed') as failed
     from users u left join account_managers am on am.user_id = u.id
     where u.platform_role = 'account_manager' and u.status = 'active'
     group by u.id order by u.full_name`,
  );
}
