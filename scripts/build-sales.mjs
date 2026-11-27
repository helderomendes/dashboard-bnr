#!/usr/bin/env node
/**
 * Cruza os leads da Meta com as oportunidades do Dommus e gera data/sales.json (o que a aba Vendas lê).
 *
 * O que vai para a página publicada: datas, anúncio, etapa, valor, empreendimento e o cliente
 * MASCARADO ("João S.", "(31) ••••-7777"). Nome completo, e-mail e telefone nunca saem do job.
 *
 * De onde vem o Dommus (o primeiro que existir):
 *   DOMMUS_API_URL     endpoint JSON que lista as oportunidades (se o Dommus liberar uma API)
 *     DOMMUS_API_TOKEN, DOMMUS_AUTH_HEADER (padrão Authorization), DOMMUS_AUTH_PREFIX (padrão "Bearer ")
 *   DOMMUS_EXPORT_URL  link privado do export (CSV, XLSX ou JSON). Aceita link do Google Drive/Planilhas.
 *   DOMMUS_FILE        caminho local do export (para rodar no computador)
 *
 * Outras variáveis:
 *   DOMMUS_FIELD_MAP   JSON opcional com o DE/PARA, ex.: {"stage":"Etapa Atual","value":"Valor VGV"}
 *   SALES_KEY          opcional: frase secreta que permite importar o export do Dommus direto no navegador
 *                      (publica só HMACs dos contatos, inúteis sem a frase)
 *   LEADS (build/leads.json) · INSIGHTS (build/insights.json) · OUT (build/sales.json)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = { TextDecoder, console };
vm.runInNewContext(await readFile(join(here, '../assets/sales-core.js'), 'utf8'), ctx);
const S = ctx.BNRSales;

const LEADS = process.env.LEADS || 'build/leads.json';
const INSIGHTS = process.env.INSIGHTS || 'build/insights.json';
const OUT = process.env.OUT || 'build/sales.json';
const SALES_KEY = process.env.SALES_KEY || '';

const readJson = async (p) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) { return null; } };

/** Links de compartilhamento do Google viram link de download direto. */
function directUrl(u) {
  let m = u.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (m) return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;
  m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([^/&?]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return u;
}

async function fromApi() {
  const header = process.env.DOMMUS_AUTH_HEADER || 'Authorization';
  const prefix = process.env.DOMMUS_AUTH_PREFIX ?? 'Bearer ';
  const headers = { Accept: 'application/json' };
  if (process.env.DOMMUS_API_TOKEN) headers[header] = prefix + process.env.DOMMUS_API_TOKEN;
  const out = []; let next = process.env.DOMMUS_API_URL; let page = 1;
  for (let guard = 0; next && guard < 500; guard++) {
    const r = await fetch(next, { headers });
    if (!r.ok) throw new Error(`Dommus respondeu HTTP ${r.status}`);
    const j = await r.json();
    const items = S.jsonToObjects(j);
    out.push(...items);
    const link = j.next_page_url || j.next || (j.links && j.links.next) || (j.paging && j.paging.next) || (j.meta && j.meta.next);
    if (typeof link === 'string') next = new URL(link, next).toString();
    else if (items.length && (j.last_page || j.total_pages || (j.meta && j.meta.last_page)) > page) { const u = new URL(next); u.searchParams.set('page', String(++page)); next = u.toString(); }
    else next = null;
  }
  return out;
}
async function fromExport() {
  if (process.env.DOMMUS_FILE) return S.readFile(await readFile(process.env.DOMMUS_FILE), process.env.DOMMUS_FILE, inflateRawSync);
  const r = await fetch(directUrl(process.env.DOMMUS_EXPORT_URL), { redirect: 'follow' });
  if (!r.ok) throw new Error(`Link do export respondeu HTTP ${r.status}`);
  return S.readFile(new Uint8Array(await r.arrayBuffer()), 'export', inflateRawSync);
}

async function main() {
  const leadsFile = await readJson(LEADS);
  const insights = await readJson(INSIGHTS);
  const meta = { ads: (insights && insights.ads) || {}, campaigns: (insights && insights.campaigns) || {} };
  const raw = (leadsFile && leadsFile.leads) || [];
  // leads orgânicos não têm anúncio: ficam fora do cruzamento por anúncio
  const metaLeads = raw.filter((l) => l.ad).map((l) => ({
    d: String(l.t).slice(0, 10), ad: l.ad,
    e: S.normEmail(l.email), p: S.normPhone(l.phone), n: S.normName(l.name),
  }));

  const out = {
    version: 1, source: 'live', generatedAt: new Date().toISOString(), stages: S.STAGES,
    metaForms: { connected: !!(leadsFile && leadsFile.status && leadsFile.status.connected), leads: metaLeads.length, error: leadsFile && leadsFile.status ? leadsFile.status.error : 'Leads do formulário não sincronizados' },
    dommus: { connected: false, source: null, records: 0, error: null, fields: null },
    leads: { cols: ['d', 'ad', 'st', 'via'], rows: metaLeads.map((l) => [l.d, l.ad, S.NOT_FOUND, 'form']) },
    sales: [], coverage: null,
  };

  const source = process.env.DOMMUS_API_URL ? 'api' : (process.env.DOMMUS_EXPORT_URL || process.env.DOMMUS_FILE) ? 'export' : null;
  if (!source) out.dommus.error = 'Dommus ainda não configurado (DOMMUS_EXPORT_URL ou DOMMUS_API_URL)';
  else {
    try {
      const objs = source === 'api' ? await fromApi() : await fromExport();
      let overrides = {};
      try { overrides = JSON.parse(process.env.DOMMUS_FIELD_MAP || '{}'); } catch (e) { console.warn('! DOMMUS_FIELD_MAP não é um JSON válido: usando o DE/PARA automático'); }
      const { records, map } = S.toRecords(objs, overrides);
      await S.withKeys(records, async (x) => x);
      const res = S.match(metaLeads, records, meta);
      Object.assign(out, { leads: res.leads, sales: res.sales, coverage: res.coverage });
      out.dommus = { connected: true, source, records: records.length, error: null, fields: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, String(v)])) };
      console.log(`• Dommus (${source}): ${records.length} oportunidades · colunas reconhecidas: ${Object.keys(map).join(', ')}`);
      if (!map.stage && !map.saleDate) console.warn('! Não achei a coluna de etapa nem a de data da venda: defina DOMMUS_FIELD_MAP');
    } catch (e) {
      out.dommus = { connected: false, source, records: 0, error: e.message, fields: null };
      console.warn(`! Dommus não lido: ${e.message}`);
    }
  }

  // Importação no navegador: HMAC dos contatos, inútil sem a SALES_KEY
  if (SALES_KEY.length >= 12 && metaLeads.length) {
    const h = (x) => (x ? createHmac('sha256', SALES_KEY).update(x).digest('hex').slice(0, 20) : null);
    out.keys = { check: h('bnr-check'), rows: metaLeads.map((l) => [l.d, l.ad, h(l.e), h(l.p), h(l.n)]) };
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  const c = out.coverage;
  console.log(`✔ ${OUT}: ${out.sales.length} vendas · ${out.leads.rows.length} leads no funil${c ? ` · ${c.found}/${c.metaLeads} leads do formulário achados no Dommus` : ''}`);
}

main().catch((e) => { console.error('! ' + e.message); process.exit(0); });
