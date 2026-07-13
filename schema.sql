-- 纯金工坊 · Cloudflare D1 schema
-- 执行：wrangler d1 execute pure-gold-db --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS keys (
  key         TEXT PRIMARY KEY,
  stars       INTEGER NOT NULL DEFAULT 0,  -- 星币（消费用）
  silver      INTEGER NOT NULL DEFAULT 0,  -- 银币（充值单位）
  note        TEXT DEFAULT '',
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  logs        TEXT DEFAULT '[]'          -- JSON 数组：流水明细
);

CREATE TABLE IF NOT EXISTS admins (
  email      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,              -- 'super' | 'regular'
  pass_hash  TEXT NOT NULL,             -- SHA-256(PEPPER + password)
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_daily_recharge (
  admin_email TEXT NOT NULL,
  date        TEXT NOT NULL,            -- YYYY-MM-DD
  total       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (admin_email, date)
);

CREATE INDEX IF NOT EXISTS idx_keys_created ON keys(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admins_created ON admins(created_at ASC);
