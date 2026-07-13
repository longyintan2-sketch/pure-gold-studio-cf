/* ============================================================
 * store.js —— 纯金工坊 数据层
 *
 * 两种运行模式（按域名自动切换，无需手动配置）：
 *   - Cloudflare 模式：部署到 *.pages.dev 时自动启用。
 *     全部密钥/余额/管理员/流水存于 Cloudflare D1（云端 SQLite），
 *     多台电脑实时同步；每日 500 星币限额、权限分级由服务端 Functions 强制。
 *   - 本地回退模式：非 .pages.dev（含 localhost / github.io）时使用 localStorage，
 *     便于无后端时直接体验（数据仅存本机本浏览器）。
 *
 * 【业务结算规则】
 *   生成 1 首歌 = 扣 10 星币；新建用户密钥 = 赠 100 星币
 * 【管理员规则】
 *   超级管理员 1766479115@qq.com：可建管理员 / 管控全部用户密钥 / 全权限
 *   普通管理员：不可建管理员；仅可为用户密钥充值星币；每日上限 500 星币
 * ============================================================ */

export const RULES = Object.freeze({
  COST_PER_SONG: 10,
  GIFT_ON_CREATE: 100,
  DAILY_ADMIN_LIMIT: 500, // 普通管理员每日充值上限
});

export const SUPER_ADMIN = '1766479115@qq.com';

// 部署到 Cloudflare Pages（*.pages.dev）即启用云端实时同步；其余环境用本地回退
export const USE_CF = typeof location !== 'undefined' && location.hostname.endsWith('.pages.dev');
export const isCloud = USE_CF;

const todayStr = () => new Date().toISOString().slice(0, 10);
function genKey() {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const s = () => Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  return `PJ-${s()}-${s()}-${s()}`;
}

/* ========================================================
 * 本地回退实现（localStorage）
 * ====================================================== */
const LS = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  },
};
class LocalStore {
  constructor() {
    this.admins = LS.get('pj_admins', null) || {};
    if (!this.admins[SUPER_ADMIN]) {
      this.admins[SUPER_ADMIN] = {
        email: SUPER_ADMIN,
        password: 'admin888',
        role: 'super',
        createdBy: null,
        createdAt: Date.now(),
      };
      LS.set('pj_admins', this.admins);
    }
    this.keys = LS.get('pj_keys', {});
    this.daily = LS.get('pj_daily', {});
  }
  // --- 用户密钥 ---
  async userLogin(k) {
    k = (k || '').trim().toUpperCase();
    const key = this.keys[k];
    if (!key) return { ok: false, msg: '用户密钥无效或不存在' };
    LS.set('pj_user_session', k);
    return { ok: true, balance: key.stars };
  }
  userSession() {
    return LS.get('pj_user_session', null); // 返回密钥字符串
  }
  userLogout() {
    LS.set('pj_user_session', null);
  }
  async userGetBalance(k) {
    return this.keys[(k || '').trim().toUpperCase()]?.stars ?? 0;
  }
  async userCharge(k, cost) {
    k = (k || '').trim().toUpperCase();
    const key = this.keys[k];
    if (!key) return { ok: false, msg: '密钥失效' };
    if (key.stars < cost) return { ok: false, msg: `星币不足（需 ${cost}，当前 ${key.stars}）` };
    key.stars -= cost;
    key.logs.push({ t: Date.now(), type: 'consume', text: `生成歌曲 · 扣 ${cost} 星币`, delta: -cost });
    LS.set('pj_keys', this.keys);
    return { ok: true, balance: key.stars, cost };
  }
  // --- 管理员 ---
  async adminLogin(email, password) {
    email = (email || '').trim().toLowerCase();
    const a = this.admins[email];
    if (!a || a.password !== password) return { ok: false, msg: '管理员账号或密码错误' };
    LS.set('pj_admin_session', email);
    return { ok: true, role: a.role };
  }
  adminSession() {
    const e = LS.get('pj_admin_session');
    const a = e && this.admins[e];
    return a ? { email: a.email, role: a.role } : null;
  }
  adminLogout() {
    LS.set('pj_admin_session', null);
  }
  rehydrate() {
    return Promise.resolve();
  }
  async createAdmin(email, password) {
    const cur = this.adminSession();
    if (!cur || cur.role !== 'super') return { ok: false, msg: '仅超级管理员可创建管理员' };
    email = (email || '').trim().toLowerCase();
    if (this.admins[email]) return { ok: false, msg: '该管理员已存在' };
    this.admins[email] = { email, password, role: 'regular', createdBy: cur.email, createdAt: Date.now() };
    LS.set('pj_admins', this.admins);
    return { ok: true };
  }
  async createUserKey(note) {
    const cur = this.adminSession();
    if (!cur || cur.role !== 'super') return { ok: false, msg: '仅超级管理员可创建用户密钥' };
    let k;
    do {
      k = genKey();
    } while (this.keys[k]);
    this.keys[k] = {
      key: k,
      stars: RULES.GIFT_ON_CREATE,
      note: note || '',
      createdBy: cur.email,
      createdAt: Date.now(),
      logs: [
        {
          t: Date.now(),
          type: 'create',
          text: `新建用户密钥 · 赠 ${RULES.GIFT_ON_CREATE} 星币`,
          delta: RULES.GIFT_ON_CREATE,
        },
      ],
    };
    LS.set('pj_keys', this.keys);
    return { ok: true, key: k, stars: RULES.GIFT_ON_CREATE };
  }
  async listKeys() {
    return Object.values(this.keys).sort((a, b) => b.createdAt - a.createdAt);
  }
  async deleteKey(k) {
    const cur = this.adminSession();
    if (!cur || cur.role !== 'super') return { ok: false, msg: '仅超级管理员可删除' };
    delete this.keys[k];
    LS.set('pj_keys', this.keys);
    return { ok: true };
  }
  async recharge(keyStr, amount) {
    const cur = this.adminSession();
    if (!cur) return { ok: false, msg: '请先登录管理后台' };
    amount = Math.floor(Number(amount));
    if (!amount || amount <= 0) return { ok: false, msg: '请输入有效星币数' };
    const key = this.keys[(keyStr || '').trim().toUpperCase()];
    if (!key) return { ok: false, msg: '用户密钥不存在' };
    if (cur.role === 'regular') {
      const dk = cur.email + '@' + todayStr();
      const used = this.daily[dk] || 0;
      if (used + amount > RULES.DAILY_ADMIN_LIMIT) {
        return { ok: false, msg: `今日充值已达上限（剩余 ${RULES.DAILY_ADMIN_LIMIT - used} 星币）` };
      }
      this.daily[dk] = used + amount;
    }
    key.stars = (key.stars || 0) + amount;
    key.logs.push({ t: Date.now(), type: 'recharge', text: `充值 ${amount} 星币`, delta: amount });
    LS.set('pj_keys', this.keys);
    LS.set('pj_daily', this.daily);
    return {
      ok: true,
      stars: key.stars,
      left: cur.role === 'regular' ? RULES.DAILY_ADMIN_LIMIT - (this.daily[cur.email + '@' + todayStr()] || 0) : null,
    };
  }
  async userInfo(k) {
    const key = this.keys[(k || '').trim().toUpperCase()];
    return { stars: key?.stars ?? 0 };
  }
  async userLogs(k) {
    return (this.keys[(k || '').trim().toUpperCase()]?.logs || []).slice().reverse();
  }
  async dailyUsage() {
    return null;
  }
  async regularDaily() {
    const cur = this.adminSession();
    if (!cur) return null;
    const used = this.daily[cur.email + '@' + todayStr()] || 0;
    return { total: used, left: RULES.DAILY_ADMIN_LIMIT - used };
  }
  async logs(k) {
    return (this.keys[(k || '').trim().toUpperCase()]?.logs || []).slice().reverse();
  }
}

/* ========================================================
 * Cloudflare 模式（D1 + Pages Functions）
 *   会话用 HttpOnly Cookie，前端只发 fetch，不带 token。
 *   权限与每日 500 限额由服务端强制，前端无法绕过。
 * ====================================================== */
const cf = (path, opts = {}) =>
  fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then((r) => r.json());

class CloudflareStore {
  constructor() {
    this.userKey = null;
    this.admin = null;
  }
  async rehydrate() {
    try {
      const r = await cf('/card');
      if (r.ok) this.userKey = r.key;
    } catch {}
    try {
      const a = await cf('/admin/me');
      if (a.ok) this.admin = { email: a.email, role: a.role };
    } catch {}
  }
  userSession() {
    return this.userKey;
  }
  adminSession() {
    return this.admin;
  }
  async userLogin(k) {
    k = (k || '').trim().toUpperCase();
    const r = await cf('/card', { method: 'POST', body: JSON.stringify({ key: k }) });
    if (r.ok) this.userKey = k;
    return r.ok ? { ok: true, balance: r.balance, key: k } : { ok: false, msg: r.msg };
  }
  userLogout() {
    this.userKey = null;
    return cf('/card/logout', { method: 'POST' }).catch(() => {});
  }
  async userGetBalance(k) {
    const r = await cf('/card');
    return r.ok ? r.stars : 0;
  }
  async userCharge(k, cost) {
    const r = await cf('/card/charge', { method: 'POST', body: JSON.stringify({ cost }) });
    return r.ok ? { ok: true, balance: r.balance, cost: r.cost } : { ok: false, msg: r.msg };
  }
  async userInfo() {
    const r = await cf('/card');
    return r.ok ? { stars: r.stars ?? 0 } : { stars: 0 };
  }
  async userLogs(k) {
    const r = await cf('/card');
    return r.ok ? r.logs || [] : [];
  }
  async adminLogin(email, password) {
    const r = await cf('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (r.ok) this.admin = { email: email.trim().toLowerCase(), role: r.role };
    return r.ok ? { ok: true, role: r.role } : { ok: false, msg: r.msg };
  }
  adminLogout() {
    this.admin = null;
    return cf('/admin/logout', { method: 'POST' }).catch(() => {});
  }
  async createAdmin(email, password) {
    const r = await cf('/admin/admins', { method: 'POST', body: JSON.stringify({ email, password }) });
    return r.ok ? { ok: true } : { ok: false, msg: r.msg };
  }
  async createUserKey(note) {
    const r = await cf('/admin/cards', { method: 'POST', body: JSON.stringify({ note }) });
    return r.ok ? { ok: true, key: r.key, stars: r.stars } : { ok: false, msg: r.msg };
  }
  async listKeys() {
    const r = await cf('/admin/cards');
    return r.ok ? r.list : [];
  }
  async deleteKey(k) {
    const r = await cf('/admin/cards/' + encodeURIComponent(k), { method: 'DELETE' });
    return r.ok ? { ok: true } : { ok: false, msg: r.msg };
  }
  async recharge(keyStr, amount) {
    const r = await cf('/admin/recharge', { method: 'POST', body: JSON.stringify({ key: keyStr, amount }) });
    return r.ok ? { ok: true, stars: r.stars, left: r.left ?? null } : { ok: false, msg: r.msg };
  }
  async regularDaily() {
    const r = await cf('/admin/quota');
    return r.ok ? { total: r.total, left: r.left } : null;
  }
  async dailyUsage() {
    return null;
  }
  async logs(k) {
    const r = await cf('/admin/cards/' + encodeURIComponent(k));
    return r.ok ? r.logs : [];
  }
}

export const Store = USE_CF ? new CloudflareStore() : new LocalStore();
export default Store;
