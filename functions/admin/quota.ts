// GET /admin/quota —— 普通管理员今日充值额度（服务端按自然日统计）
import { getAdmin, json, err, RULES, todayStr } from '../_lib/auth';

export async function onRequestGet({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('未登录', 401);
  if (admin.role !== 'regular') return err('仅普通管理员有充值额度', 403);

  const d = await env.DB.prepare(
    'SELECT total FROM admin_daily_recharge WHERE admin_email=? AND date=?',
  )
    .bind(admin.email, todayStr())
    .first();
  const total = d?.total || 0;
  return json({ ok: true, total, left: RULES.DAILY_ADMIN_LIMIT - total });
}
