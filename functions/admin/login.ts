// POST /admin/login —— 管理员登录（邮箱+密码），成功写入签名会话 Cookie
import {
  hashPassword,
  signSession,
  setCookie,
  json,
  err,
  SESSION_MAX_AGE,
} from '../_lib/auth';

export async function onRequestPost({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const { email, password } = await request.json().catch(() => ({} as any));
  const e = (email || '').trim().toLowerCase();
  if (!e || !password) return err('请输入账号和密码');

  const row = await env.DB.prepare('SELECT email, role, pass_hash FROM admins WHERE email=?')
    .bind(e)
    .first();
  if (!row) return err('管理员账号或密码错误');

  const h = await hashPassword(password);
  if (h !== row.pass_hash) return err('管理员账号或密码错误');

  const token = await signSession(
    { email: row.email, role: row.role, exp: Date.now() + SESSION_MAX_AGE * 1000 },
    secret,
  );
  const res = json({ ok: true, role: row.role });
  res.headers.append('Set-Cookie', setCookie('pj_admin', token, SESSION_MAX_AGE));
  return res;
}
