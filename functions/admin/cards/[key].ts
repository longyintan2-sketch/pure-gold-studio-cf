// GET    /admin/cards/:key  —— 查看单个密钥信息 + 流水（管理员均可）
// DELETE /admin/cards/:key  —— 超级管理员：删除密钥
import { getAdmin, json, err } from '../../_lib/auth';

export async function onRequestGet({ request, env, params }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);

  const k = (params.key || '').toUpperCase();
  const row = await env.DB.prepare('SELECT key, stars, silver, note, created_by, created_at, logs FROM keys WHERE key=?')
    .bind(k)
    .first();
  if (!row) return err('用户密钥不存在');
  return json({
    ok: true,
    key: row.key,
    stars: row.stars,
    silver: row.silver,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    logs: JSON.parse(row.logs || '[]').slice().reverse(),
  });
}

export async function onRequestDelete({ request, env, params }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);
  if (admin.role !== 'super') return err('仅超级管理员可删除', 403);

  const k = (params.key || '').toUpperCase();
  await env.DB.prepare('DELETE FROM keys WHERE key=?').bind(k).run();
  return json({ ok: true });
}
