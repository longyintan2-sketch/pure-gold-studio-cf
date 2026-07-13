-- 纯金工坊 · Supabase 云端结构
-- 在 https://app.supabase.com 项目 SQL Editor 完整执行。

-- 1) 用户密钥表（消费凭证，余额以星币计）
create table if not exists public.keys (
  key text primary key,
  stars int not null default 100,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  logs jsonb not null default '[]'::jsonb
);

-- 2) 管理员表
create table if not exists public.admins (
  email text primary key,
  role text not null check (role in ('super','regular')),
  created_by text,
  created_at timestamptz not null default now()
);

-- 3) 普通管理员每日充值额度
create table if not exists public.admin_daily_recharge (
  admin_email text not null,
  date date not null,
  total int not null default 0,
  primary key (admin_email, date)
);

-- ===== 行级安全 =====
alter table public.keys enable row level security;
alter table public.admins enable row level security;
alter table public.admin_daily_recharge enable row level security;

-- 管理员判定函数（基于登录邮箱）
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.admins where email = auth.email);
$$;
create or replace function public.is_super()
returns boolean language sql stable as $$
  select exists (select 1 from public.admins where email = auth.email and role = 'super');
$$;

-- keys: 仅管理员可读写（用户本身不登录 Supabase，扣费走 Edge Function）
create policy "admins_all_keys" on public.keys for all using (public.is_admin()) with check (public.is_admin());
-- admins: 所有管理员可读；仅超级可写
create policy "admins_read" on public.admins for select using (public.is_admin());
create policy "super_write_admins" on public.admins for all using (public.is_super()) with check (public.is_super());
-- 每日额度：管理员可读写自己的行；超级可读全部
create policy "daily_self" on public.admin_daily_recharge for all using (admin_email = auth.email) with check (admin_email = auth.email);
create policy "daily_super_read" on public.admin_daily_recharge for select using (public.is_super());

-- 新管理员被创建时（create-admin 函数），由服务端插入，无需客户端权限。
-- 超级管理员邮箱需手动在 admins 表插入一行（role='super'），例如：
-- insert into public.admins (email, role) values ('1766479115@qq.com','super');
