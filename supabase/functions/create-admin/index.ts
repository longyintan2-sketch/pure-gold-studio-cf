// 纯金工坊 · Edge Function：超级管理员创建普通管理员
// 仅超级管理员可调用；使用 service_role 创建 Auth 用户并写入 admins 表。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  if (!adm || adm.role !== 'super') return cors({ ok: false, msg: '仅超级管理员可创建管理员' }, 403);

  const { email, password } = await req.json();
  if (!email || !password) return cors({ ok: false, msg: '邮箱与密码必填' }, 400);

  const { data: nu, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return cors({ ok: false, msg: error.message }, 400);
  const { error: e2 } = await supabase.from('admins').insert({ email, role: 'regular', created_by: u.user.email });
  if (e2) return cors({ ok: false, msg: e2.message }, 400);
  return cors({ ok: true });
});
