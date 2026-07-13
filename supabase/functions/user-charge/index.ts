// 纯金工坊 · Edge Function：用户生成歌曲扣费（扣自己密钥）
// 仅用 service_role 操作，安全：只能扣指定密钥自身余额，无法影响他人。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  const { key, cost } = await req.json();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: k, error } = await supabase.from('keys').select('stars, logs').eq('key', key).single();
  if (error || !k) return cors({ ok: false, msg: '用户密钥不存在' }, 404);
  if (k.stars < cost) return cors({ ok: false, msg: `星币不足（需 ${cost}，当前 ${k.stars}）` }, 400);

  const logs = [...(k.logs || []), { t: Date.now(), type: 'consume', text: `生成歌曲 · 扣 ${cost} 星币`, delta: -cost }];
  const { data: up, error: e2 } = await supabase.from('keys').update({ stars: k.stars - cost, logs }).eq('key', key).select('stars').single();
  if (e2) return cors({ ok: false, msg: e2.message }, 500);
  return cors({ ok: true, balance: up.stars, cost });
});
