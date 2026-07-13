// POST /card/charge —— 生成歌曲扣费：每首扣 10 星币（服务端原子校验余额）
import { getUserKey, json, err, RULES } from '../_lib/auth';

export async function onRequestPost({ request, env }: any) {
  const userKey = getUserKey(request);
  if (!userKey) return err('请先登录用户密钥', 401);
  const body = await request.json().catch(() => ({} as any));
  const cost = Math.floor(Number(body.cost || RULES.COST_PER_SONG));
  if (cost <= 0) return err('扣费金额无效');

  const row = await env.DB.prepare('SELECT stars, silver, logs FROM keys WHERE key=?').bind(userKey).first();
  if (!row) return err('密钥失效');
  if (row.stars < cost) return err(`星币不足（需 ${cost}，当前 ${row.stars}）`);

  const logs = JSON.parse(row.logs || '[]');
  logs.push({ t: Date.now(), type: 'consume', text: `生成歌曲 · 扣 ${cost} 星币`, delta: -cost });

  await env.DB.batch([
    env.DB.prepare('UPDATE keys SET stars = stars - ? WHERE key = ?').bind(cost, userKey),
    env.DB.prepare('UPDATE keys SET logs = ? WHERE key = ?').bind(JSON.stringify(logs), userKey),
  ]);

  const after = await env.DB.prepare('SELECT stars, silver FROM keys WHERE key=?').bind(userKey).first();
  return json({ ok: true, balance: after.stars, silver: after.silver, cost });
}
