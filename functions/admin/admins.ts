// GET  /admin/admins   —— 超级管理员：列出全部管理员
// POST /admin/admins   —— 超级管理员：新建普通管理员账号
import { getAdmin, hashPassword, json, err, SUPER_ADMIN } from '../_lib/auth';

export async function onRequestGet({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);
  if (admin.role !== 'super') return err('仅超级管理员可管理管理员', 403);

  const rows = await env.DB.prepare(
    'SELECT email, role, created_by, created_at FROM admins ORDER BY created_at ASC',
  ).all();
  return json({ ok: true, list: rows.results || [] });
}

export async function onRequestPost({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);
  if (admin.role !== 'super') return err('仅超级管理员可创建管理员', 403);

  const { email, password } = await request.json().catch(() => ({} as any));
  const e = (email || '').trim().toLowerCase();
  if (!e || !password) return err('请输入管理员邮箱和密码');
  if (password.length < 6) return err('密码至少 6 位');
  if (e === SUPER_ADMIN) return err('该邮箱为超级管理员保留账号');

  const ex = await env.DB.prepare('SELECT email FROM admins WHERE email=?').bind(e).first();
  if (ex) return err('该管理员已存在');

  const h = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO admins (email, role, pass_hash, created_by, created_at) VALUES (?,?,?,?,?)',
  )
    .bind(e, 'regular', h, admin.email, Date.now())
    .run();
  return json({ ok: true });
}
