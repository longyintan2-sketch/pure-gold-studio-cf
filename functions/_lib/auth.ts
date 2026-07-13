// functions/_lib/auth.ts —— 共享工具：cookie / 会话 / 密码 / 响应
// 注意：以 _ 开头的目录/文件不会被当作路由，仅作为模块被 import。
export const PEPPER = 'pure-gold-studio-v1';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天（秒）
export const RULES = Object.freeze({ COST_PER_SONG: 10, GIFT_ON_CREATE: 100, DAILY_ADMIN_LIMIT: 500 });
export const SUPER_ADMIN = '1766479115@qq.com';

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setCookie(name: string, value: string, maxAge: number): string {
  // 不设置 Secure，使本地 wrangler pages dev(http) 也能写入；部署到 https 同样可用
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashPassword(pw: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PEPPER + pw));
  return hex(d);
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function signSession(obj: any, secret: string): Promise<string> {
  const payload = btoa(JSON.stringify(obj));
  return payload + '.' + (await hmac(payload, secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<any | null> {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if ((await hmac(payload, secret)) !== sig) return null;
  try {
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// 读取用户密钥会话（HttpOnly Cookie）
export function getUserKey(request: Request): string | null {
  return parseCookies(request.headers.get('cookie'))['pj_user'] || null;
}

// 读取管理员会话（校验签名 + 过期）
export async function getAdmin(
  request: Request,
  secret: string,
): Promise<{ email: string; role: string } | null> {
  const p = await verifySession(parseCookies(request.headers.get('cookie'))['pj_admin'], secret);
  if (!p || (p.exp && p.exp < Date.now())) return null;
  return { email: p.email, role: p.role };
}

export function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
export function err(msg: string, status = 400): Response {
  return json({ ok: false, msg }, status);
}
