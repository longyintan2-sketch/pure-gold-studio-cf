// GET  /card        —— 读取当前登录密钥信息（用于刷新/恢复会话）
// POST /card        —— 用户密钥登录，成功后写入 HttpOnly Cookie
import {
  getUserKey,
  setCookie,
  json,
  err,
  SESSION_MAX_AGE,
  RULES,
} from '../_lib/auth';

export async function onRequestGet({ request, env }: any) {
  const key = getUserKey(request);
  if (!key) return err('未登录');
  const row = await env.DB.prepare('SELECT key, stars, silver, note, logs FROM keys WHERE key=?')
    .bind(key)
    .first();
  if (!row) return err('密钥失效，请重新登录');
  const logs = JSON.parse(row.logs || '[]');
  return json({ ok: true, key: row.key, stars: row.stars, silver: row.silver, note: row.note, logs: logs.slice().reverse() });
}

export async function onRequestPost({ request, env }: any) {
  const { key } = await request.json().catch(() => ({} as any));
  const k = (key || '').trim().toUpperCase();
  if (!k) return err('请输入用户密钥');
  const row = await env.DB.prepare('SELECT stars FROM keys WHERE key=?').bind(k).first();
  if (!row) return err('用户密钥无效或不存在');
  const res = json({ ok: true, balance: row.stars, key: k });
  res.headers.append('Set-Cookie', setCookie('pj_user', k, SESSION_MAX_AGE));
  return res;
}
