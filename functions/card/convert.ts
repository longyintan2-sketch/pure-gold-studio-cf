// POST /card/convert —— 用户：把银币兑换为星币（1:1，服务端原子校验）
import { getUserKey, json, err } from '../_lib/auth';

export async function onRequestPost({ request, env }: any) {
  const userKey = getUserKey(request);
  if (!userKey) return err('请先登录用户密钥', 401);
  const body = await request.json().catch(() => ({} as any));
  const amount = Math.floor(Number(body.amount));
  if (!amount || amount <= 0) return err('请输入有效兑换数量');

  const row = await env.DB.prepare('SELECT stars, silver, logs FROM keys WHERE key=?').bind(userKey).first();
  if (!row) return err('密钥失效');
  if (row.silver < amount) return err(`银币不足（需 ${amount}，当前 ${row.silver}）`);

  const logs = JSON.parse(row.logs || '[]');
  logs.push({ t: Date.now(), type: 'convert', text: `银币兑换 ${amount} → 星币`, delta: amount });

  await env.DB.batch([
    env.DB.prepare('UPDATE keys SET silver = silver - ?, stars = stars + ? WHERE key = ?')
      .bind(amount, amount, userKey),
    env.DB.prepare('UPDATE keys SET logs = ? WHERE key = ?').bind(JSON.stringify(logs), userKey),
  ]);

  const after = await env.DB.prepare('SELECT stars, silver FROM keys WHERE key=?').bind(userKey).first();
  return json({ ok: true, stars: after.stars, silver: after.silver });
}
