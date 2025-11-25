// /api/commission.js —— Edge-friendly（Resend REST API）
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RECIPIENT = process.env.COMMISSION_INBOX; // 你的收件邮箱
const FROM = process.env.COMMISSION_FROM || 'KONIGIN <commission@konigindominion.com>';

// 可选：自定义“敏感词”（英文逗号分隔），例如：fuck, bitch, 狗, 死, 滚
// 不设置也没关系，只会跳过检测
const ABUSE_WORDS = (process.env.ABUSIVE_WORDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const config = { runtime: 'edge' };

function sanitize(str = '') {
  return String(str).slice(0, 5000);
}
function isEmail(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// 提取访问来源信息（在 Vercel Edge 可用）
function getClientMeta(req) {
  const h = req.headers;
  const xff = h.get('x-forwarded-for') || '';
  const ipChain = xff.split(',').map(s => s.trim()).filter(Boolean);
  const ip = ipChain[0] || h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown';

  return {
    ip,
    ip_chain: ipChain.join(' , '),
    ua: h.get('user-agent') || '',
    referer: h.get('referer') || '',
    country: h.get('x-vercel-ip-country') || '',
    region: h.get('x-vercel-ip-country-region') || '',
    city: h.get('x-vercel-ip-city') || '',
  };
}

async function sendEmail({ from, to, subject, html, text, reply_to }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(reply_to ? { reply_to } : {}),
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
  return resp.json();
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    const form = await req.formData();

    // 蜜罐：正常用户不会填写
    if (form.get('website')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const name     = sanitize(form.get('name'));
    const contact  = sanitize(form.get('contact'));
    const type     = sanitize(form.get('type'));
    const budget   = sanitize(form.get('budget'));
    const message  = sanitize(form.get('message'));
    const agree    = form.get('agree');

    if (!name || !contact || !message || !agree) {
      return new Response(JSON.stringify({ error: '请填写必填字段：称呼 / 联系方式 / 需求描述 / 同意条款' }), { status: 400 });
    }
    if (!RESEND_API_KEY || !RECIPIENT) {
      return new Response(JSON.stringify({ error: '服务端未配置收件邮箱或 Resend API Key。' }), { status: 500 });
    }

    // 简单“疑似滥用”检测（命中任意词，只做标注，不拦截）
    let abuseHit = '';
    if (ABUSE_WORDS.length) {
      const lower = message.toLowerCase();
      for (const w of ABUSE_WORDS) {
        if (w && lower.includes(w.toLowerCase())) { abuseHit = w; break; }
      }
    }

    const meta = getClientMeta(req);
    const ts = new Date();

    const subjectPrefix = abuseHit ? '【⚠疑似滥用】' : '【Commission】';
    const subject = `${subjectPrefix}${name} - ${type || '未选择类型'}`;

    const textLines = [
      `称呼: ${name}`,
      `联系方式: ${contact}`,
      `类型: ${type || '-'}`,
      `预算: ${budget || '-'}`,
      `——`,
      message,
      `——`,
      `时间: ${ts.toLocaleString('zh-CN', { hour12: false })}`,
      `IP: ${meta.ip}`,
      `IP-Chain: ${meta.ip_chain || '-'}`,
      `UA: ${meta.ua}`,
      `Geo: ${meta.country || '-'} ${meta.region || ''} ${meta.city || ''}`.trim(),
      `Referer: ${meta.referer || '-'}`,
      ...(abuseHit ? [`疑似敏感词: ${abuseHit}`] : []),
    ];

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system">
        <h2>${abuseHit ? '⚠ 疑似滥用' : '新委托表单'}</h2>
        <p><b>称呼：</b>${escapeHtml(name)}</p>
        <p><b>联系方式：</b>${escapeHtml(contact)}</p>
        <p><b>类型：</b>${escapeHtml(type || '-')}</p>
        <p><b>预算：</b>${escapeHtml(budget || '-')}</p>
        <hr />
        <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>
        <hr />
        <small>
          提交时间：${ts.toLocaleString('zh-CN', { hour12: false })}<br/>
          IP：${escapeHtml(meta.ip)}<br/>
          IP-Chain：${escapeHtml(meta.ip_chain || '-')}<br/>
          UA：${escapeHtml(meta.ua)}<br/>
          Geo：${escapeHtml([meta.country, meta.region, meta.city].filter(Boolean).join(' / ') || '-')}<br/>
          Referer：${escapeHtml(meta.referer || '-')}<br/>
          ${abuseHit ? `疑似敏感词：${escapeHtml(abuseHit)}` : ''}
        </small>
      </div>
    `;

    const replyTo = isEmail(contact) ? contact : undefined;

    await sendEmail({
      from: FROM,
      to: RECIPIENT,
      subject,
      html,
      text: textLines.join('\n'),
      reply_to: replyTo,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: '委托表单发送失败，请稍后再试。' }), { status: 500 });
  }
}
