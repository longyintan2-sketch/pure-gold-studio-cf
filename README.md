# 纯金工坊（Pure Gold Studio）

独立人声柔化 / 歌曲生成软件。集成**密钥登录**、**星币积分扣费**、**管理后台（管理登录）**，
前端部署在 Cloudflare Pages，后端用 **Cloudflare D1（云端 SQLite）+ Pages Functions**，
实现**多台电脑实时同步 + 管理员远程管控全部密钥**。

## 功能与规则

- 用户凭**密钥**登录；每成功生成 1 首歌曲 **扣 10 星币**；新建用户密钥 **默认赠 100 星币**。
- **管理登录**入口在用户登录页底部。
- 超级管理员 `1766479115@qq.com`：可新建普通管理员、管控全部用户密钥、查看流水、充值。
- 普通管理员：仅可为用户密钥充值星币；**每日充值上限 500 星币（服务端强制）**。
- 用户登录界面**不展示任何结算规则文字**。
- 全部页面（登录 / 管理登录 / 主界面）均启用动态星空 + 流星 + 点击打铁花特效。

## 架构

```
vocal-star/
├─ renderer/                 # 前端静态资源（部署到 Cloudflare Pages）
│  ├─ index.html
│  ├─ css/app.css
│  └─ js/  (store / app / engine / starfield)
├─ functions/                # Cloudflare Pages Functions（服务端 API）
│  ├─ _lib/auth.ts           # cookie / 会话签名 / 密码哈希 / 权限校验
│  ├─ card/                  # 用户密钥：登录 / 扣费 / 退出
│  └─ admin/                 # 管理后台：登录 / 配额 / 密钥 / 充值 / 管理员
├─ schema.sql                # D1 建表
├─ bootstrap.sql             # 初始化超级管理员（默认密码 admin888）
├─ scripts/bootstrap.mjs     # 动态重置超级管理员密码
├─ wrangler.toml            # Pages + D1 绑定配置
└─ package.json
```

数据层 `renderer/js/store.js` 按域名**自动切换**：部署到 `*.pages.dev` 走 Cloudflare（D1 云端），
本地或 github.io 走 `localStorage` 回退（仅供体验，数据不跨设备）。

## 本地预览（无需后端）

直接用静态服务器打开 `renderer/` 即可（localStorage 模式，本机可点）：

```bash
cd vocal-star/renderer
python3 -m http.server 4177      # 或任意静态服务器
# 浏览器打开 http://localhost:4177
```

> 本地模式下超级管理员默认 `1766479115@qq.com` / `admin888`（仅本地回退用，生产请改）。

## 部署到 Cloudflare Pages（真实云端同步）

### 1. 安装并登录 wrangler

```bash
npm i -g wrangler        # 或 npx wrangler
npx wrangler login       # 浏览器授权
```

### 2. 创建 D1 数据库，拿到 database_id

```bash
npx wrangler d1 create pure-gold-db
```

把输出的 `database_id` 填进 `wrangler.toml` 的 `database_id` 字段（替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`）。

### 3. 建表 + 设会话密钥 + 初始化超级管理员

```bash
# 建表
npx wrangler d1 execute pure-gold-db --file=./schema.sql --remote

# 设置会话签名密钥（任意随机串，用于签名管理员 Cookie）
npx wrangler pages secret put SECRET --project-name pure-gold-studio
# 输入如：openssl rand -hex 32

# 初始化超级管理员（默认 1766479115@qq.com / admin888）
npx wrangler d1 execute pure-gold-db --file=./bootstrap.sql --remote
# 或自定义密码：node scripts/bootstrap.mjs 你的密码
```

### 4. 部署

```bash
npx wrangler pages deploy renderer --project-name pure-gold-studio
```

部署完成后，`https://<你的项目>.pages.dev` 即启用**云端实时同步**：数据存于 D1，
不同电脑登录同一账号/密钥数据一致；管理员登录后可远程管控全部用户密钥。

> 修改密码后请同步更新 `functions/_lib/auth.ts` 的 `PEPPER` 并重新 `node scripts/bootstrap.mjs 新密码`，
> 否则旧密码哈希不匹配。

## 接口一览（Pages Functions，同源）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/card` | 用户密钥登录 | 公开 |
| GET  | `/card` | 当前密钥信息 | 用户 |
| POST | `/card/charge` | 生成扣费（-10） | 用户 |
| POST | `/card/logout` | 退出 | 用户 |
| POST | `/admin/login` | 管理员登录 | 公开 |
| GET  | `/admin/me` | 当前管理员 | 管理员 |
| GET  | `/admin/quota` | 今日剩余额度 | 普通管理员 |
| GET  | `/admin/cards` | 全部密钥列表 | 超级管理员 |
| POST | `/admin/cards` | 新建用户密钥（赠100） | 超级管理员 |
| GET/DELETE | `/admin/cards/:key` | 密钥详情/流水、删除 | 管理员/超级 |
| POST | `/admin/recharge` | 充值星币（每日500限） | 管理员 |
| GET/POST | `/admin/admins` | 管理员列表/新建 | 超级管理员 |
| DELETE | `/admin/admins/:id` | 删除管理员 | 超级管理员 |

所有权限判断与每日 500 星币限额均在**服务端**强制执行，前端无法绕过。
