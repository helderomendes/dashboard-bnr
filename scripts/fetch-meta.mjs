#!/usr/bin/env node
/**
 * Sincroniza a conta de anúncios Meta → data/insights.json (formato lido pelo dashboard).
 *
 * Usa apenas a Marketing API oficial (gratuita). Sem dependências: Node 18+.
 *
 * Variáveis de ambiente:
 *   META_ACCESS_TOKEN   (obrigatória) token de Usuário do Sistema com permissão ads_read
 *   META_AD_ACCOUNT_ID  (obrigatória) ID da conta, com ou sem "act_" (ex.: act_1234567890)
 *   DAYS                dias de histórico (padrão 180)
 *   META_API_VERSION    versão da Graph API (padrão v23.0)
 *   LEAD_ACTION_TYPES   lista separada por vírgula para sobrescrever o que conta como lead
 *   MSG_ACTION_TYPES    idem para conversas (padrão: conversas por mensagem iniciadas)
 *   OUT                 caminho de saída (padrão data/insights.json)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const TOKEN = process.env.META_ACCESS_TOKEN;
const RAW_ACCOUNT = (process.env.META_AD_ACCOUNT_ID || '').trim();
const ACCOUNT = RAW_ACCOUNT.startsWith('act_') ? RAW_ACCOUNT : `act_${RAW_ACCOUNT}`;
const VERSION = process.env.META_API_VERSION || 'v23.0';
const DAYS = Math.max(1, parseInt(process.env.DAYS || '180', 10));
const OUT = process.env.OUT || 'data/insights.json';
const BASE = `https://graph.facebook.com/${VERSION}`;

const LEAD_TYPES = (process.env.LEAD_ACTION_TYPES || '').split(',').map((s) => s.trim()).filter(Boolean);
const MSG_TYPES = (process.env.MSG_ACTION_TYPES || 'onsite_conversion.messaging_conversation_started_7d').split(',').map((s) => s.trim()).filter(Boolean);

if (!TOKEN || !RAW_ACCOUNT) {
  console.error('✖ Defina META_ACCESS_TOKEN e META_AD_ACCOUNT_ID (veja o README).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

async function request(url, attempt = 0) {
  let res, body;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    body = await res.json();
  } catch (e) {
    if (attempt < 5) { await sleep(2000 * 2 ** attempt); return request(url, attempt + 1); }
    throw e;
  }
  if (body.error) {
    const { code, message, is_transient: transient } = body.error;
    if ((transient || TRANSIENT.has(code) || res.status >= 500) && attempt < 6) {
      const wait = Math.min(60000, 3000 * 2 ** attempt);
      console.warn(`  ↻ limite/erro temporário da Meta (${code}): aguardando ${wait / 1000}s…`);
      await sleep(wait);
      return request(url, attempt + 1);
    }
    if (code === 190) throw new Error('Token inválido ou expirado (erro 190). Gere um novo token de Usuário do Sistema.');
    if (code === 200 || code === 10) throw new Error(`Sem permissão na conta ${ACCOUNT} (erro ${code}). O usuário do sistema precisa de acesso à conta e da permissão ads_read.`);
    throw new Error(`Meta API erro ${code}: ${message}`);
  }
  return body;
}

function buildUrl(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  return u.toString();
}

/** Busca todas as páginas de um edge. */
async function all(path, params) {
  const out = [];
  let url = buildUrl(path, { limit: 500, ...params });
  while (url) {
    const body = await request(url);
    out.push(...(body.data || []));
    url = body.paging && body.paging.next ? body.paging.next : null;
  }
  return out;
}

const iso = (d) => d.toISOString().slice(0, 10);
function windows(since, until, size = 30) {
  const out = []; let s = new Date(since + 'T00:00:00Z'); const end = new Date(until + 'T00:00:00Z');
  while (s <= end) {
    const e = new Date(s); e.setUTCDate(e.getUTCDate() + size - 1);
    out.push([iso(s), iso(e > end ? end : e)]);
    s = new Date(e); s.setUTCDate(s.getUTCDate() + 1);
  }
  return out;
}

const actionMap = (arr) => Object.fromEntries((arr || []).map((a) => [a.action_type, Number(a.value) || 0]));
function leadsOf(m) {
  if (LEAD_TYPES.length) return LEAD_TYPES.reduce((s, t) => s + (m[t] || 0), 0);
  // "lead" já é o agregado (formulário instantâneo + pixel). Se não vier, soma as partes.
  if (m.lead != null) return m.lead;
  return (m['onsite_conversion.lead_grouped'] || 0) + (m['offsite_conversion.fb_pixel_lead'] || 0);
}
const msgsOf = (m) => MSG_TYPES.reduce((s, t) => s + (m[t] || 0), 0);
const round2 = (n) => Math.round(n * 100) / 100;

async function insights(level, since, until, extra = {}) {
  const fields = level === 'ad'
    ? 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions'
    : 'campaign_id,spend,impressions,clicks,inline_link_clicks,actions';
  const rows = [];
  for (const [s, u] of windows(since, until)) {
    process.stdout.write(`  · ${level}${extra.breakdowns ? ' [' + extra.breakdowns + ']' : ''} ${s} → ${u}\n`);
    rows.push(...await all(`${ACCOUNT}/insights`, {
      level, fields, time_increment: '1', time_range: { since: s, until: u },
      use_unified_attribution_setting: 'true', action_report_time: 'conversion', ...extra,
    }));
  }
  return rows;
}

async function main() {
  const t0 = Date.now();
  const until = iso(new Date());
  const sinceD = new Date(); sinceD.setUTCDate(sinceD.getUTCDate() - DAYS + 1);
  const since = iso(sinceD);
  console.log(`▶ Sincronizando ${ACCOUNT} de ${since} a ${until} (API ${VERSION})`);

  const account = await request(buildUrl(ACCOUNT, { fields: 'name,currency,timezone_name,account_status' }));

  const STATUSES = ['ACTIVE', 'PAUSED', 'DELETED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ARCHIVED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'];
  const filtering = [{ field: 'effective_status', operator: 'IN', value: STATUSES }];
  console.log('• Estrutura (campanhas, conjuntos, anúncios)');
  const [campaigns, adsets, ads] = await Promise.all([
    all(`${ACCOUNT}/campaigns`, { fields: 'id,name,effective_status,objective', filtering }),
    all(`${ACCOUNT}/adsets`, { fields: 'id,name,effective_status,campaign_id,optimization_goal', filtering }),
    all(`${ACCOUNT}/ads`, { fields: 'id,name,effective_status,adset_id,campaign_id,created_time,creative{thumbnail_url,image_url,title,body,object_type,effective_object_story_id,instagram_permalink_url}', filtering, thumbnail_width: 640, thumbnail_height: 640 }),
  ]);

  const data = {
    version: 1, source: 'live', generatedAt: new Date().toISOString(),
    account: { id: ACCOUNT, name: account.name, currency: account.currency, timezone: account.timezone_name },
    range: { since, until },
    campaigns: {}, adsets: {}, ads: {},
    daily: { cols: ['d', 'ad', 'spend', 'imp', 'clk', 'lclk', 'leads', 'msgs'], rows: [] },
    breakdowns: {},
  };
  for (const c of campaigns) data.campaigns[c.id] = { name: c.name, status: c.effective_status, objective: c.objective };
  for (const s of adsets) data.adsets[s.id] = { name: s.name, status: s.effective_status, campaignId: s.campaign_id, optimization: s.optimization_goal };
  for (const a of ads) {
    const cr = a.creative || {};
    const fmt = { VIDEO: 'VÍDEO', PHOTO: 'IMAGEM', SHARE: 'LINK', STATUS: 'TEXTO', MULTI_SHARE: 'CARROSSEL' }[cr.object_type] || cr.object_type;
    data.ads[a.id] = {
      name: a.name, status: a.effective_status, adsetId: a.adset_id, campaignId: a.campaign_id, created: a.created_time,
      thumb: cr.thumbnail_url || cr.image_url || null, image: cr.image_url || null, title: cr.title || null, body: cr.body || null,
      format: fmt || null,
      link: cr.instagram_permalink_url || (cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null),
    };
  }

  console.log('• Insights diários por anúncio');
  for (const r of await insights('ad', since, until)) {
    const m = actionMap(r.actions);
    // anúncios excluídos podem não vir na listagem — usa nomes do próprio insight
    if (!data.campaigns[r.campaign_id]) data.campaigns[r.campaign_id] = { name: r.campaign_name, status: 'DELETED' };
    if (!data.adsets[r.adset_id]) data.adsets[r.adset_id] = { name: r.adset_name, status: 'DELETED', campaignId: r.campaign_id };
    if (!data.ads[r.ad_id]) data.ads[r.ad_id] = { name: r.ad_name, status: 'DELETED', adsetId: r.adset_id, campaignId: r.campaign_id };
    data.daily.rows.push([r.date_start, r.ad_id, round2(+r.spend || 0), +r.impressions || 0, +r.clicks || 0, +r.inline_link_clicks || 0, leadsOf(m), msgsOf(m)]);
  }

  const BD = { placement: 'publisher_platform,platform_position', age_gender: 'age,gender', region: 'region' };
  for (const [name, breakdowns] of Object.entries(BD)) {
    console.log(`• Quebra: ${name}`);
    try {
      const rows = await insights('campaign', since, until, { breakdowns });
      const keys = breakdowns.split(',');
      data.breakdowns[name] = {
        cols: ['d', 'c', 'k', 'spend', 'imp', 'lclk', 'leads', 'msgs'],
        rows: rows.map((r) => { const m = actionMap(r.actions); return [r.date_start, r.campaign_id, keys.map((k) => r[k]).join('|'), round2(+r.spend || 0), +r.impressions || 0, +r.inline_link_clicks || 0, leadsOf(m), msgsOf(m)]; }),
      };
    } catch (e) {
      console.warn(`  ! quebra ${name} ignorada: ${e.message}`);
    }
  }

  // remove estrutura sem nenhuma veiculação no período (deixa o JSON enxuto)
  const used = new Set(data.daily.rows.map((r) => r[1]));
  for (const id of Object.keys(data.ads)) if (!used.has(id) && data.ads[id].status !== 'ACTIVE') delete data.ads[id];

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data));
  const spend = data.daily.rows.reduce((s, r) => s + r[2], 0);
  const leads = data.daily.rows.reduce((s, r) => s + r[6], 0);
  console.log(`✔ ${OUT}: ${data.daily.rows.length} linhas · ${Object.keys(data.ads).length} anúncios · investimento ${spend.toFixed(2)} ${account.currency} · ${leads} leads · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error('✖ ' + e.message); process.exit(1); });
