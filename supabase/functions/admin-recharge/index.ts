// 纯金工坊 · Edge Function：管理员为用户密钥充值星币
// 普通管理员每日上限 500 星币，由服务端强制（admin_daily_recharge 累计）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DAILY_LIMIT = 500;
const cors = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

  const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: u } = await supabase.auth.getUser(auth);
  if (!u.user) return cors({ ok: false, msg: '未登录' }, 401);
  const { data: adm } = await supabase.from('admins').select('role').eq('email', u.user.email).single();
  if (!adm) return cors({ ok: false, msg: '非管理员' }, 403);

  const { key, stars } = await req.json();
  const n = Math.floor(Number(stars));
  if (!n || n <= 0) return cors({ ok: false, msg: '请输入有效星币数' }, 400);

  let left: number | null = null;
  if (adm.role === 'regular') {
    const date = new Date().toISOString().slice(0, 10);
    const { data: d } = await supabase.from('admin_daily_recharge').select('total').eq('admin_email', u.user.email).eq('date', date).single();
    const used = d?.total || 0;
    if (used + n > DAILY_LIMIT) return cors({ ok: false, msg: `今日充值已达上限（剩余 ${DAILY_LIMIT - used} 星币）` }, 400);
    await supabase.from('admin_daily_recharge').upsert({ admin_email: u.user.email, date, total: used + n }, { onConflict: 'admin_email,date' });
  }

  const { data: k, error } = await supabase.from('keys').select('stars, logs').eq('key', key).single();
  if (error || !k) return cors({ ok: false, msg: '用户密钥不存在' }, 404);
  const logs = [...(k.logs || []), { t: Date.now(), type: 'recharge', text: `充值 ${n} 星币`, delta: n }];
  const { data: up } = await supabase.from('keys').update({ stars: k.stars + n, logs }).eq('key', key).select('stars').single();
  if (!up) return cors({ ok: false, msg: '充值失败' }, 500);

  if (adm.role === 'regular') {
    const date = new Date().toISOString().slice(0, 10);
    const { data: d2 } = await supabase.from('admin_daily_recharge').select('total').eq('admin_email', u.user.email).eq('date', date).single();
    left = DAILY_LIMIT - (d2?.total || 0);
  }
  return cors({ ok: true, balance: up.stars, left });
});
