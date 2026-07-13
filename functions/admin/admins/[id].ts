// DELETE /admin/admins/:id —— 超级管理员：删除某普通管理员（不能删自己/超级管理员）
import { getAdmin, json, err, SUPER_ADMIN } from '../../_lib/auth';

export async function onRequestDelete({ request, env, params }: any) {
  const secret = env.SECRET || 'dev-secret-change-me';
  const admin = await getAdmin(request, secret);
  if (!admin) return err('请先登录管理后台', 401);
  if (admin.role !== 'super') return err('仅超级管理员可删除管理员', 403);

  const id = (params.id || '').toLowerCase();
  if (id === SUPER_ADMIN) return err('不能删除超级管理员');
  if (id === admin.email) return err('不能删除自己');

  await env.DB.prepare('DELETE FROM admins WHERE email=?').bind(id).run();
  return json({ ok: true });
}
