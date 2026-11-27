#!/usr/bin/env node
/**
 * Leads do formulário instantâneo da Meta, um por um (nome, e-mail, telefone e o anúncio de origem).
 *
 * Diferente do insights (números somados), aqui vem cada pessoa. O arquivo de saída tem dados
 * pessoais: ele só existe dentro do job e no cache cifrado, e nunca é publicado.
 *
 * Variáveis de ambiente:
 *   META_ACCESS_TOKEN  token do usuário do sistema com leads_retrieval, pages_show_list,
 *                      pages_read_engagement e ads_read, com a Página atribuída a ele
 *   (no workflow, META_LEADS_TOKEN tem prioridade: um token só para os leads)
 *   META_PAGE_IDS      opcional: IDs das Páginas separados por vírgula (senão usa as Páginas do token)
 *   META_API_VERSION   padrão v23.0
 *   PREV_LEADS         JSON da execução anterior (cache): a Meta só devolve leads de até 90 dias
 *   OUT                padrão build/leads.json
 *
 * Nunca derruba a sincronização: sem permissão, grava o motivo e sai com código 0.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const TOKEN = process.env.META_ACCESS_TOKEN;
const VERSION = process.env.META_API_VERSION || 'v23.0';
const PAGE_IDS = (process.env.META_PAGE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const PREV = process.env.PREV_LEADS || '';
const OUT = process.env.OUT || 'build/leads.json';
const BASE = `https://graph.facebook.com/${VERSION}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, token, attempt = 0) {
  let res, body;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    body = await res.json();
  } catch (e) {
    if (attempt < 4) { await sleep(2000 * 2 ** attempt); return request(url, token, attempt + 1); }
    throw e;
  }
  if (body.error) {
    const { code, message, is_transient: transient } = body.error;
    if ((transient || [1, 2, 4, 17, 32, 613].includes(code) || res.status >= 500) && attempt < 6) {
      await sleep(Math.min(120000, 5000 * 2 ** attempt));
      return request(url, token, attempt + 1);
    }
    const err = new Error(`Meta API erro ${code}: ${message}`); err.code = code; throw err;
  }
  return body;
}
function url(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  return u.toString();
}
async function all(path, params, token) {
  const out = []; let next = url(path, { limit: 500, ...params });
  while (next) { const b = await request(next, token); out.push(...(b.data || [])); next = b.paging && b.paging.next; }
  return out;
}

/** field_data da Meta → nome, e-mail e telefone, aceitando perguntas personalizadas em português. */
function contact(fields) {
  const out = { name: '', email: '', phone: '' }; let first = '', last = '';
  for (const f of fields || []) {
    const k = String(f.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const v = String((f.values || [])[0] || '').trim();
    if (!v) continue;
    if (/e-?mail/.test(k)) out.email ||= v;
    else if (/phone|telefone|celular|whats|fone/.test(k)) out.phone ||= v;
    else if (k === 'first_name' || k === 'primeiro_nome') first = v;
    else if (k === 'last_name' || k === 'sobrenome') last = v;
    else if (/full_name|nome|^name$/.test(k)) out.name ||= v;
  }
  if (!out.name && (first || last)) out.name = `${first} ${last}`.trim();
  return out;
}

async function loadPrev() {
  if (!PREV) return [];
  try { const p = JSON.parse(await readFile(PREV, 'utf8')); return Array.isArray(p.leads) ? p.leads : []; }
  catch (e) { return []; }
}

async function main() {
  const prev = await loadPrev();
  const byId = new Map(prev.map((l) => [l.id, l]));
  const status = { connected: false, pages: 0, forms: 0, fetched: 0, error: null };
  const save = async () => {
    await mkdir(dirname(OUT), { recursive: true });
    const leads = [...byId.values()].sort((a, b) => (a.t < b.t ? -1 : 1));
    await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status, leads }));
    console.log(`✔ ${OUT}: ${leads.length} leads (${status.fetched} baixados agora, ${prev.length} do cache) · ${status.forms} formulários`);
  };
  if (!TOKEN) { status.error = 'Sem META_ACCESS_TOKEN'; return save(); }

  try {
    // Páginas: as informadas ou as atribuídas ao usuário do sistema. Cada uma tem um token próprio.
    // Uma Página sem acesso é ignorada (com aviso) em vez de travar as outras
    let firstErr = null;
    const pages = PAGE_IDS.length
      ? (await Promise.all(PAGE_IDS.map((id) => request(url(id, { fields: 'id,name,access_token' }), TOKEN)
        .catch((e) => { firstErr = firstErr || e; console.warn(`  ! Página ${id} ignorada: ${e.message}`); return null; })))).filter(Boolean)
      : await all('me/accounts', { fields: 'id,name,access_token' }, TOKEN);
    if (!pages.length && firstErr) throw firstErr;
    status.pages = pages.length;
    if (!pages.length) throw Object.assign(new Error('Nenhuma Página acessível com este token'), { code: 'NO_PAGE' });
    // Só pede o que ainda não está no cache (com 2 dias de folga)
    const newest = prev.reduce((m, l) => (l.t > m ? l.t : m), '');
    const since = newest ? Math.floor(Date.parse(newest) / 1000) - 2 * 86400 : 0;
    for (const pg of pages) {
      const ptoken = pg.access_token || TOKEN;
      const forms = await all(`${pg.id}/leadgen_forms`, { fields: 'id,name,status' }, ptoken);
      status.forms += forms.length;
      for (const f of forms) {
        process.stdout.write(`  · ${pg.name || pg.id} › ${f.name}\n`);
        const params = { fields: 'id,created_time,ad_id,adset_id,campaign_id,form_id,field_data,is_organic,platform' };
        if (since) params.filtering = [{ field: 'time_created', operator: 'GREATER_THAN', value: since }];
        try {
          for (const l of await all(`${f.id}/leads`, params, ptoken)) {
            const c = contact(l.field_data);
            byId.set(l.id, { id: l.id, t: l.created_time, ad: l.ad_id || null, as: l.adset_id || null, c: l.campaign_id || null, f: l.form_id || f.id, fn: f.name, org: !!l.is_organic, pl: l.platform || null, ...c });
            status.fetched++;
          }
        } catch (e) { console.warn(`  ! formulário ${f.id} ignorado: ${e.message}`); }
      }
    }
    status.connected = true;
  } catch (e) {
    const hint = e.code === 200 || e.code === 10 || e.code === 190 || e.code === 'NO_PAGE'
      ? '. O token precisa de leads_retrieval, pages_show_list e pages_read_engagement, com acesso à Página (veja o README).'
      : '';
    status.error = (hint ? String(e.message).replace(/[.\s]+$/, '') : e.message) + hint;
    console.warn(`! Leads do formulário não baixados: ${status.error}`);
  }
  await save();
}

main().catch((e) => { console.error('! ' + e.message); process.exit(0); });
