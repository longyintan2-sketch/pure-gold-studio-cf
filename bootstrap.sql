-- 初始化超级管理员：1766479115@qq.com / 密码 admin888
-- 执行：npx wrangler d1 execute pure-gold-db --file=./bootstrap.sql --remote
-- 哈希与 functions/_lib/auth.ts 的 PEPPER 保持一致；改密码请用 scripts/bootstrap.mjs。
INSERT OR IGNORE INTO admins (email, role, pass_hash, created_by, created_at)
VALUES (
  '1766479115@qq.com',
  'super',
  '6a6e24e01e3a861cefbeed0b5552ad24ee7e0e22225ec141846c859835877bd7',
  'system',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);
