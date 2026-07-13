// GET /admin/me —— 返回当前登录管理员信息（用于前端恢复会话）
import { getAdmin, json, err } from '../_lib/auth';

export async function onRequestGet({ request, env }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('未登录', 401);
  return json({ ok: true, email: admin.email, role: admin.role });
}
