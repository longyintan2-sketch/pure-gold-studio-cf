// POST /admin/recharge —— 为某用户密钥充值星币
// 普通管理员：每日充值上限 500 星币，由服务端按自然日强制；超级管理员无限制
import { getAdmin, json, err, RULES, todayStr } from '../_lib/auth';

export async function onRequestPost({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);

  const { key, stars } = await request.json().catch(() => ({} as any));
  const amount = Math.floor(Number(stars));
  if (!amount || amount <= 0) return err('请输入有效星币数');

  const target = (key || '').trim().toUpperCase();
  const row = await env.DB.prepare('SELECT stars, logs FROM keys WHERE key=?').bind(target).first();
  if (!row) return err('用户密钥不存在');

  // 普通管理员：每日 500 上限（服务端强制）
  if (admin.role === 'regular') {
    const date = todayStr();
    const used =
      (await env.DB.prepare('SELECT total FROM admin_daily_recharge WHERE admin_email=? AND date=?')
        .bind(admin.email, date)
        .first())?.total || 0;
    if (used + amount > RULES.DAILY_ADMIN_LIMIT) {
      return err(`今日充值已达上限（剩余 ${RULES.DAILY_ADMIN_LIMIT - used} 星币）`);
    }
    await env.DB.prepare(
      'INSERT INTO admin_daily_recharge (admin_email, date, total) VALUES (?,?,?) ON CONFLICT(admin_email,date) DO UPDATE SET total = total + ?',
    )
      .bind(admin.email, date, amount, amount)
      .run();
  }

  const logs = JSON.parse(row.logs || '[]');
  logs.push({ t: Date.now(), type: 'recharge', text: `充值 ${amount} 星币`, delta: amount });

  await env.DB.batch([
    env.DB.prepare('UPDATE keys SET stars = stars + ? WHERE key = ?').bind(amount, target),
    env.DB.prepare('UPDATE keys SET logs = ? WHERE key = ?').bind(JSON.stringify(logs), target),
  ]);

  const newRow = await env.DB.prepare('SELECT stars FROM keys WHERE key=?').bind(target).first();

  let left: number | null = null;
  if (admin.role === 'regular') {
    const date = todayStr();
    const used =
      (await env.DB.prepare('SELECT total FROM admin_daily_recharge WHERE admin_email=? AND date=?')
        .bind(admin.email, date)
        .first())?.total || 0;
    left = RULES.DAILY_ADMIN_LIMIT - used;
  }
  return json({ ok: true, balance: newRow.stars, left });
}
