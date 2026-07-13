// POST /admin/logout —— 退出管理后台（清除 Cookie）
import { clearCookie, json } from '../_lib/auth';

export async function onRequestPost() {
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearCookie('pj_admin'));
  return res;
}
