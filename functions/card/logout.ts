// POST /card/logout —— 退出用户密钥登录（清除 Cookie）
import { clearCookie, json } from '../_lib/auth';

export async function onRequestPost() {
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearCookie('pj_user'));
  return res;
}
