#!/usr/bin/env node
// 初始化 / 重置超级管理员密码
// 用法：node scripts/bootstrap.mjs [密码]     （默认 admin888）
// 前置：npx wrangler login 已完成（否则会提示手动执行 SQL）
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PEPPER = 'pure-gold-studio-v1';
const SUPER = '1766479115@qq.com';
const pwd = process.argv[2] || 'admin888';
const hash = createHash('sha256').update(PEPPER + pwd).digest('hex');
const now = Date.now();
const sql = `INSERT OR REPLACE INTO admins (email, role, pass_hash, created_by, created_at) VALUES ('${SUPER}', 'super', '${hash}', 'system', ${now});`;

const f = join(mkdtempSync(join(tmpdir(), 'pg-')), 'seed.sql');
writeFileSync(f, sql);
console.log(`超级管理员：${SUPER}  /  密码：${pwd}`);
try {
  execSync(`npx wrangler d1 execute pure-gold-db --remote --file="${f}"`, { stdio: 'inherit' });
  console.log('✅ 超级管理员已写入。请在「管理登录」页用该邮箱 + 密码登录。');
} catch (e) {
  console.error('⚠️ 自动写入失败，请先运行：npx wrangler login');
  console.error('或手动在 D1 控制台 / wrangler 执行以下 SQL：\n' + sql);
}
