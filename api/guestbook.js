// /api/guestbook.js —— 留言板（Vercel Edge + Upstash Redis REST API）
//
// 需要的环境变量（在 Vercel 接入 Upstash Redis 后会自动生成其中一组）：
//   KV_REST_API_URL / KV_REST_API_TOKEN            （Vercel Storage → Upstash 默认名）
//   或 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   GUESTBOOK_ADMIN_PASSWORD   管理后台密码（必填，自己设一个长一点的）
// 可选：
//   GUESTBOOK_AUTO_APPROVE=true   新留言不经审核直接公开（命中敏感词的仍需审核）
//   ABUSIVE_WORDS                 敏感词，英文逗号分隔（与委托表单共用）
//   RESEND_API_KEY + COMMISSION_INBOX   配置后有新留言会发邮件提醒你
//
// 接口：
//   GET  /api/guestbook                    公开：已通过的留言
//   POST /api/guestbook                    公开：提交留言 { name, message, website(蜜罐) }
//   GET  /api/guestbook?status=pending     管理：带请求头 x-admin-password
//   POST /api/guestbook  { action, id, reply }   管理：approve / hide / delete / reply

export const config = { runtime: 'edge' };

const MAX_NAME = 24;
const MAX_MESSAGE = 1000;
const MAX_REPLY = 1000;
const PAGE_SIZE = 50;
const RATE_LIMIT = 3;          // 每个 IP ……
const RATE_WINDOW_SEC = 600;   // …… 每 10 分钟最多 3 条

const KEY_MSG = id => `gb:msg:${id}`;
const KEY_APPROVED = 'gb:approved';
const KEY_PENDING = 'gb:pending';
const KEY_RATE = ip => `gb:rl:${ip}`;

function env(name) {
  return (typeof process !== 'undefined' && process.env && process.env[name]) || '';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------- Upstash Redis（REST） ----------
async function redis(commands) {
  const url = env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) throw new Error('Redis not configured');
  const resp = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!resp.ok) throw new Error(`Redis ${resp.status}: ${await resp.text().catch(() => '')}`);
  const out = await resp.json();
  return out.map(r => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

async function loadMessages(ids) {
  if (!ids.length) return [];
  const [raw] = await redis([['MGET', ...ids.map(KEY_MSG)]]);
  return raw.filter(Boolean).map(s => JSON.parse(s));
}

// ---------- 工具 ----------
function clean(str, max) {
  return String(str ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

function clientIp(req) {
  const h = req.headers;
  const xff = (h.get('x-forwarded-for') || '').split(',')[0].trim();
  return xff || h.get('x-real-ip') || 'unknown';
}

function abuseHit(text) {
  const words = env('ABUSIVE_WORDS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const lower = text.toLowerCase();
  return words.find(w => lower.includes(w)) || '';
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAdmin(req) {
  return safeEqual(req.headers.get('x-admin-password') || '', env('GUESTBOOK_ADMIN_PASSWORD'));
}

// 公开接口只返回这些字段（不暴露 IP 等）
function publicView(m) {
  return { id: m.id, name: m.name, message: m.message, createdAt: m.createdAt, reply: m.reply || '', replyAt: m.replyAt || 0 };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function notifyOwner(m) {
  const key = env('RESEND_API_KEY');
  const to = env('COMMISSION_INBOX');
  if (!key || !to) return;
  const from = env('COMMISSION_FROM') || 'KONIGIN <commission@konigindominion.com>';
  const status = m.status === 'approved' ? '已公开' : '待审核';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${m.flag ? '【⚠疑似滥用】' : '【留言板】'}${m.name}（${status}）`,
      html: `<p><b>${escapeHtml(m.name)}</b>（${status}）</p>
             <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(m.message)}</pre>
             <small>IP：${escapeHtml(m.ip)}${m.flag ? `<br>疑似敏感词：${escapeHtml(m.flag)}` : ''}</small>`,
    }),
  }).catch(() => {});
}

// ---------- 处理 ----------
async function handleList(req) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'approved';
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  if (status !== 'approved' && !isAdmin(req)) return json({ error: '密码错误' }, 401);
  const key = status === 'pending' ? KEY_PENDING : KEY_APPROVED;

  const [ids, total] = await redis([
    ['ZREVRANGE', key, offset, offset + PAGE_SIZE - 1],
    ['ZCARD', key],
  ]);
  const list = await loadMessages(ids);
  const admin = isAdmin(req);
  return json({
    items: admin ? list : list.map(publicView),
    total,
    nextOffset: offset + ids.length < total ? offset + ids.length : null,
  });
}

async function handleSubmit(req, body) {
  // 蜜罐：机器人才会填写
  if (body.website) return json({ ok: true, status: 'pending' });

  const name = clean(body.name, MAX_NAME) || '匿名访客';
  const message = clean(body.message, MAX_MESSAGE);
  if (message.length < 2) return json({ error: '留言内容太短啦' }, 400);

  const ip = clientIp(req);
  const [count] = await redis([['INCR', KEY_RATE(ip)], ['EXPIRE', KEY_RATE(ip), RATE_WINDOW_SEC, 'NX']]);
  if (count > RATE_LIMIT) return json({ error: '留言太频繁了，请稍后再试' }, 429);

  const flag = abuseHit(`${name} ${message}`);
  const autoApprove = env('GUESTBOOK_AUTO_APPROVE') === 'true' && !flag;
  const now = Date.now();
  const m = {
    id: crypto.randomUUID(),
    name,
    message,
    createdAt: now,
    status: autoApprove ? 'approved' : 'pending',
    reply: '',
    replyAt: 0,
    ip,
    ua: (req.headers.get('user-agent') || '').slice(0, 300),
    country: req.headers.get('x-vercel-ip-country') || '',
    flag,
  };

  await redis([
    ['SET', KEY_MSG(m.id), JSON.stringify(m)],
    ['ZADD', autoApprove ? KEY_APPROVED : KEY_PENDING, now, m.id],
  ]);
  await notifyOwner(m);

  return json({ ok: true, status: m.status, item: autoApprove ? publicView(m) : null });
}

async function handleAdmin(body) {
  const { action, id } = body;
  if (!id || typeof id !== 'string') return json({ error: '缺少 id' }, 400);
  const [raw] = await redis([['GET', KEY_MSG(id)]]);
  if (!raw) return json({ error: '留言不存在' }, 404);
  const m = JSON.parse(raw);

  if (action === 'delete') {
    await redis([['DEL', KEY_MSG(id)], ['ZREM', KEY_APPROVED, id], ['ZREM', KEY_PENDING, id]]);
    return json({ ok: true });
  }
  if (action === 'approve' || action === 'hide') {
    m.status = action === 'approve' ? 'approved' : 'pending';
    const [to, from] = action === 'approve' ? [KEY_APPROVED, KEY_PENDING] : [KEY_PENDING, KEY_APPROVED];
    await redis([['SET', KEY_MSG(id), JSON.stringify(m)], ['ZREM', from, id], ['ZADD', to, m.createdAt, id]]);
    return json({ ok: true, item: m });
  }
  if (action === 'reply') {
    m.reply = clean(body.reply, MAX_REPLY);
    m.replyAt = m.reply ? Date.now() : 0;
    await redis([['SET', KEY_MSG(id), JSON.stringify(m)]]);
    return json({ ok: true, item: m });
  }
  return json({ error: '未知操作' }, 400);
}

export default async function handler(req) {
  try {
    if (req.method === 'GET') return await handleList(req);
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: '请求格式错误' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: '请求格式错误' }, 400);

    if (body.action) {
      if (!isAdmin(req)) return json({ error: '密码错误' }, 401);
      return await handleAdmin(body);
    }
    return await handleSubmit(req, body);
  } catch (err) {
    console.error(err);
    const msg = /not configured/.test(err.message) ? '留言板还没有连接数据库' : '服务器开小差了，请稍后再试';
    return json({ error: msg }, 500);
  }
}
