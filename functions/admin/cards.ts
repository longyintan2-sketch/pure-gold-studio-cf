// GET  /admin/cards   —— 超级管理员：列出全部用户密钥
// POST /admin/cards   —— 超级管理员：新建用户密钥（自动赠 100 星币）
import { getAdmin, json, err, RULES } from '../_lib/auth';

function genKey() {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const s = () => Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  return `PJ-${s()}-${s()}-${s()}`;
}

export async function onRequestGet({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);
  if (admin.role !== 'super') return err('仅超级管理员可查看全部密钥', 403);

  const rows = await env.DB.prepare(
    'SELECT key, stars, note, created_by, created_at, logs FROM keys ORDER BY created_at DESC',
  ).all();
  const list = (rows.results || []).map((r: any) => ({
    key: r.key,
    stars: r.stars,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    logs: JSON.parse(r.logs || '[]').slice().reverse(),
  }));
  return json({ ok: true, list });
}

export async function onRequestPost({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);
  if (admin.role !== 'super') return err('仅超级管理员可创建用户密钥', 403);

  const { note } = await request.json().catch(() => ({} as any));
  let k = '';
  for (;;) {
    k = genKey();
    const ex = await env.DB.prepare('SELECT key FROM keys WHERE key=?').bind(k).first();
    if (!ex) break;
  }
  const logs = [
    {
      t: Date.now(),
      type: 'create',
      text: `新建用户密钥 · 赠 ${RULES.GIFT_ON_CREATE} 星币`,
      delta: RULES.GIFT_ON_CREATE,
    },
  ];
  await env.DB.prepare(
    'INSERT INTO keys (key, stars, note, created_by, created_at, logs) VALUES (?,?,?,?,?,?)',
  )
    .bind(k, RULES.GIFT_ON_CREATE, note || '', admin.email, Date.now(), JSON.stringify(logs))
    .run();
  return json({ ok: true, key: k, stars: RULES.GIFT_ON_CREATE });
}
