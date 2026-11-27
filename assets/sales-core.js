/* BNR · Vendas — núcleo compartilhado entre o navegador e a sincronização (Node).
 *
 * Lê o export do Dommus (CSV, XLSX ou JSON), faz o DE/PARA dos campos, normaliza
 * e-mail/telefone/nome e liga cada oportunidade do Dommus ao anúncio da Meta que
 * gerou o lead. Sem dependências e sem DOM: no Node é carregado com vm.
 *
 * Ordem de confiança da ligação:
 *   utm      utm_content = ID do anúncio gravado no Dommus (exato)
 *   email    mesmo e-mail do lead do formulário
 *   telefone mesmo DDD + 8 últimos dígitos (resolve o 9º dígito e o +55)
 *   nome     mesmo primeiro + último nome e datas a até 10 dias (baixa confiança)
 *   anuncio  campanha/mídia do Dommus com o mesmo nome de um anúncio
 *   campanha campanha/mídia do Dommus com o mesmo nome de uma campanha (só campanha)
 */
(function (root) {
  'use strict';

  const STAGES = ['No Dommus', 'Em atendimento', 'Visita', 'Proposta', 'Venda'];
  const LOST = 9; // desistência, descartado, não perturbe…
  const NOT_FOUND = -1;
  const VIA = {
    utm: { label: 'UTM do anúncio', conf: 'alta' },
    email: { label: 'E-mail', conf: 'alta' },
    telefone: { label: 'Telefone', conf: 'alta' },
    nome: { label: 'Nome e data', conf: 'baixa' },
    anuncio: { label: 'Nome do anúncio no Dommus', conf: 'média' },
    campanha: { label: 'Campanha no Dommus', conf: 'média' },
  };

  // ------------------------------------------------------------ normalização
  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const keyOf = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const text = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

  function normEmail(v) {
    const e = String(v == null ? '' : v).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  }
  /** Telefone → DDD + 8 últimos dígitos. "+55 (31) 9 8888-7777" e "3188887777" viram "3188887777". */
  function normPhone(v, ddd) {
    let d = String(v == null ? '' : v).replace(/\D/g, '');
    const dd = String(ddd == null ? '' : ddd).replace(/\D/g, '');
    if (dd && d.length >= 8 && d.length <= 9) d = dd + d;
    d = d.replace(/^0+/, '');
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 12 || d.length === 13) d = d.replace(/^0/, ''); // operadora 0xx
    if (d.length !== 10 && d.length !== 11) return null;
    return d.slice(0, 2) + d.slice(-8);
  }
  /** Primeiro + último nome, sem acento. Precisa de ao menos dois nomes. */
  function normName(v) {
    const t = text(v).split(' ').filter((w) => w.length > 1 && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w));
    return t.length >= 2 ? t[0] + ' ' + t[t.length - 1] : null;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  /** Datas em vários formatos → 'AAAA-MM-DD' (ou null). Aceita o número de série do Excel. */
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v);
      if (n > 20000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 864e5)); return d.toISOString().slice(0, 10); }
      if (n > 1e11) return new Date(n).toISOString().slice(0, 10);
      if (n > 1e9) return new Date(n * 1000).toISOString().slice(0, 10);
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    return null;
  }
  /** "R$ 450.000,00" → 450000 */
  function parseMoney(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/[^\d,.-]/g, '');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // ------------------------------------------------------------ leitura de arquivos
  function parseCSV(str) {
    str = String(str).replace(/^﻿/, '');
    const first = str.slice(0, str.indexOf('\n') > 0 ? str.indexOf('\n') : str.length);
    const count = (ch) => first.split(ch).length - 1;
    const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) { if (c === '"') { if (str[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && str[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  }

  const xmlText = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
  /** Lê a primeira planilha de um .xlsx. `inflate(bytes)` descompacta deflate cru (Node: zlib; navegador: DecompressionStream). */
  async function parseXLSX(bytes, inflate) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('O arquivo .xlsx parece corrompido');
    const dec = new TextDecoder();
    const files = {};
    let p = dv.getUint32(e + 16, true);
    for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    const read = async (name) => {
      const f = files[name]; if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(start, start + f.size);
      return dec.decode(f.method === 0 ? raw : await inflate(raw));
    };
    const shared = [];
    const ss = await read('xl/sharedStrings.xml');
    if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(''));
    let sheet = 'xl/worksheets/sheet1.xml';
    const wb = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels');
    const rid = wb && (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    const target = rid && rels && (rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1];
    if (target) sheet = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = await read(sheet);
    if (!xml) throw new Error('Não encontrei a planilha dentro do .xlsx');
    const col = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const rows = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], body = cm[2] || '';
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (t === 's') val = shared[+v] || '';
        else if (t === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlText(x[1])).join('');
        else if (v != null) val = t === 'str' || t === 'd' ? xmlText(v) : Number(v);
        row[ref ? col(ref) : row.length] = val;
      }
      for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = '';
      if (row.some((x) => String(x).trim() !== '')) rows.push(row);
    }
    return rows;
  }

  // ------------------------------------------------------------ DE/PARA dos campos
  const FIELDS = {
    id: ['id', 'id_oportunidade', 'oportunidade', 'opv', 'id_opv', 'codigo', 'codigo_opv', 'id_lead', 'numero_opv', 'n_opv', 'numero'],
    name: ['nome', 'nome_lead', 'nome_do_lead', 'nome_cliente', 'nome_do_cliente', 'cliente', 'lead', 'name', 'proponente', 'nome_completo', 'nome_proponente'],
    email: ['email', 'e_mail', 'email_lead', 'email_do_lead', 'email_cliente', 'email_do_cliente', 'e_mail_do_lead'],
    ddd: ['ddd', 'ddd_telefone', 'ddd_celular'],
    phone: ['telefone', 'celular', 'telefone_1', 'telefone1', 'telefone_principal', 'fone', 'whatsapp', 'telefone_lead', 'telefone_do_lead', 'telefone_celular', 'telefone_cliente', 'phone', 'contato'],
    created: ['data_cadastro', 'data_de_cadastro', 'data_criacao', 'data_de_criacao', 'criado_em', 'created_at', 'data_entrada', 'data_de_entrada', 'data_lead', 'data_do_lead', 'data_oportunidade', 'data_da_oportunidade', 'cadastro', 'data_inclusao', 'data'],
    updated: ['data_atualizacao', 'ultima_atualizacao', 'updated_at', 'data_ultima_movimentacao', 'ultima_movimentacao', 'data_movimentacao', 'data_alteracao', 'data_ultima_alteracao'],
    stage: ['etapa', 'status', 'status_oportunidade', 'status_da_oportunidade', 'status_opv', 'etapa_funil', 'etapa_do_funil', 'etapa_atual', 'situacao', 'fase', 'status_atual'],
    stageType: ['tipo_atendimento', 'tipo_de_atendimento', 'tipo_etapa', 'tipo_da_etapa', 'tipo_status'],
    saleDate: ['data_venda', 'data_da_venda', 'data_venda_ganha', 'data_contrato', 'data_do_contrato', 'data_assinatura', 'data_da_assinatura', 'vendido_em', 'data_fechamento'],
    value: ['valor_venda', 'valor_da_venda', 'valor_contrato', 'valor_do_contrato', 'vgv', 'valor_negociado', 'valor_total', 'valor_unidade', 'valor'],
    product: ['empreendimento', 'produto', 'projeto', 'empreendimento_interesse', 'empreendimento_de_interesse'],
    origin: ['origem', 'origem_lead', 'origem_do_lead', 'canal', 'fonte'],
    media: ['midia', 'midia_origem', 'midia_do_lead'],
    campaign: ['campanha', 'campanha_origem', 'campanha_do_lead', 'utm_campaign'],
    utmSource: ['utm_source'],
    utmContent: ['utm_content', 'anuncio', 'ad_id', 'id_anuncio', 'nome_anuncio', 'nome_do_anuncio'],
    tags: ['tags', 'tag'],
  };
  const FIELD_LABEL = { id: 'ID', name: 'Nome', email: 'E-mail', ddd: 'DDD', phone: 'Telefone', created: 'Data de cadastro', updated: 'Última movimentação', stage: 'Etapa/status', stageType: 'Tipo da etapa', saleDate: 'Data da venda', value: 'Valor', product: 'Empreendimento', origin: 'Origem', media: 'Mídia', campaign: 'Campanha', utmSource: 'utm_source', utmContent: 'utm_content / anúncio', tags: 'Tags' };

  function flatten(o, pre, out) {
    out = out || {};
    for (const [k, v] of Object.entries(o || {})) {
      const key = pre ? pre + '_' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : x)).join(', ') : v;
    }
    return out;
  }
  /** Linhas de tabela (com cabeçalho em algum lugar das primeiras linhas) → objetos. */
  function tableToObjects(rows) {
    const known = new Set([].concat(...Object.values(FIELDS)));
    let best = 0, score = -1;
    rows.slice(0, 15).forEach((r, i) => { const s = r.filter((c) => known.has(keyOf(c))).length; if (s > score) { score = s; best = i; } });
    const head = rows[best].map((h) => String(h).trim());
    return rows.slice(best + 1).map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] == null ? '' : r[i]; }); return o; });
  }
  /** Descobre qual coluna é cada campo. `overrides` = { campo: 'Nome da coluna' }. */
  function mapColumns(headers, overrides) {
    const byKey = new Map(headers.map((h) => [keyOf(h), h]));
    const used = new Set(); const map = {};
    for (const [f, h] of Object.entries(overrides || {})) if (h && headers.includes(h)) { map[f] = h; used.add(h); }
    for (const [f, aliases] of Object.entries(FIELDS)) {
      if (map[f]) continue;
      for (const a of aliases) { const h = byKey.get(a); if (h && !used.has(h)) { map[f] = h; used.add(h); break; } }
    }
    // segunda passada: coluna que contém o nome do campo (ex.: "E-mail do cliente principal")
    const loose = { email: /e_?mail/, phone: /telefone|celular|whats/, name: /^nome/, product: /empreendimento/, saleDate: /data.*(venda|contrato|assinatura)/, value: /^valor/, stage: /etapa|status/, created: /data.*(cadastro|criacao|entrada)/ };
    for (const [f, re] of Object.entries(loose)) {
      if (map[f]) continue;
      const h = headers.find((x) => !used.has(x) && re.test(keyOf(x)));
      if (h) { map[f] = h; used.add(h); }
    }
    return map;
  }

  /** Etapa do Dommus → índice do funil (0 a 4) ou LOST. */
  function stageOf(raw, type) {
    const s = keyOf((type || '') + ' ' + (raw || ''));
    if (/venda_ganha|vendid|ganha|contrat|assinad|escritura|faturad|repasse|comprou|concluid/.test(s)) return 4;
    if (/desist|perdid|descart|nao_perturbe|invalid|sem_interesse|cancelad|duplicad/.test(s)) return LOST;
    if (/propost|negocia|credito|documenta|simulac|reserva|venda/.test(s)) return 3;
    if (/visita/.test(s)) return 2;
    if (/atendiment|contato|qualific|andamento|retorno|agendad|follow|tentativa/.test(s)) return 1;
    return 0;
  }

  /** Objetos crus do Dommus → registros padronizados. */
  function toRecords(objs, overrides) {
    const flat = objs.map((o) => flatten(o));
    const headers = [...new Set([].concat(...flat.slice(0, 200).map((o) => Object.keys(o))))];
    const map = mapColumns(headers, overrides);
    const g = (o, f) => (map[f] ? o[map[f]] : undefined);
    const s = (v) => (v == null ? '' : String(v).trim());
    const recs = flat.map((o, i) => {
      const stageRaw = s(g(o, 'stage')), type = s(g(o, 'stageType'));
      const r = {
        id: s(g(o, 'id')) || String(i + 1),
        name: s(g(o, 'name')), email: s(g(o, 'email')), phone: s(g(o, 'phone')), ddd: s(g(o, 'ddd')),
        created: parseDate(g(o, 'created')), updated: parseDate(g(o, 'updated')), saleDate: parseDate(g(o, 'saleDate')),
        stageRaw: stageRaw || type, stage: stageOf(stageRaw, type),
        value: parseMoney(g(o, 'value')), product: s(g(o, 'product')),
        origin: s(g(o, 'origin')), media: s(g(o, 'media')), campaign: s(g(o, 'campaign')),
        utmSource: s(g(o, 'utmSource')), utmContent: s(g(o, 'utmContent')), tags: s(g(o, 'tags')),
      };
      r.phoneKey = normPhone(r.phone, r.ddd);
      return r;
    }).filter((r) => r.name || r.email || r.phone);
    return { records: recs, map, headers };
  }

  /** Lê qualquer arquivo suportado (bytes) → objetos. */
  async function readFile(bytes, name, inflate) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return tableToObjects(await parseXLSX(u8, inflate));
    const str = new TextDecoder().decode(u8).replace(/^﻿/, '');
    const t = str.trim();
    if (t.startsWith('[') || t.startsWith('{')) return jsonToObjects(JSON.parse(t));
    if (/^<|<table/i.test(t)) throw new Error('Esse arquivo é uma página HTML. Exporte em CSV ou Excel (.xlsx).');
    return tableToObjects(parseCSV(str));
  }
  /** JSON de API ou export: acha a lista de registros dentro dele. */
  function jsonToObjects(j) {
    if (Array.isArray(j)) return j;
    for (const k of ['data', 'items', 'results', 'registros', 'oportunidades', 'leads', 'rows']) {
      if (Array.isArray(j[k])) return j[k];
      if (j[k] && typeof j[k] === 'object') { const x = jsonToObjects(j[k]); if (x.length) return x; }
    }
    const arr = Object.values(j).find(Array.isArray);
    return arr || [];
  }

  // ------------------------------------------------------------ máscaras (o que aparece na página aberta)
  function maskName(n) {
    const t = String(n || '').trim().split(/\s+/).filter(Boolean);
    if (!t.length) return 'Cliente';
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    const last = t.length > 1 ? t[t.length - 1] : '';
    return cap(t[0]) + (last ? ' ' + last.charAt(0).toUpperCase() + '.' : '');
  }
  function maskPhone(p, ddd) {
    const k = normPhone(p, ddd);
    if (!k) return '';
    return `(${k.slice(0, 2)}) ••••-${k.slice(-4)}`;
  }

  // ------------------------------------------------------------ cruzamento
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const rankOf = (st) => (st === LOST ? -0.5 : st);
  function push(m, k, v) { if (!k) return; const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

  /**
   * leads:   [{ d, ad, e, p, n }] leads do formulário da Meta (e/p/n = chaves de e-mail, telefone e nome)
   * records: saída de toRecords(), com .ke .kp .kn já calculados pela mesma função de chave
   * meta:    { ads: {id: {name, campaignId}}, campaigns: {id: {name}} } do insights.json
   */
  function match(leads, records, meta) {
    const ads = (meta && meta.ads) || {}, camps = (meta && meta.campaigns) || {};
    const byE = new Map(), byP = new Map(), byN = new Map();
    leads.forEach((l, i) => { push(byE, l.e, i); push(byP, l.p, i); push(byN, l.n, i); });
    const adByName = new Map(), campByName = new Map();
    for (const [id, a] of Object.entries(ads)) { const k = text(a.name); if (k && !adByName.has(k)) adByName.set(k, id); }
    for (const [id, c] of Object.entries(camps)) { const k = text(c.name); if (k && !campByName.has(k)) campByName.set(k, id); }

    const leadSt = leads.map(() => NOT_FOUND);
    const extra = []; const sales = [];
    const cov = { records: records.length, linked: 0, campaignOnly: 0, none: 0, via: {}, since: null };
    for (const r of records) {
      if (r.created && (!cov.since || r.created < cov.since)) cov.since = r.created;
      const idx = new Set(); let via = null;
      if (r.ke && byE.has(r.ke)) { byE.get(r.ke).forEach((i) => idx.add(i)); via = 'email'; }
      if (r.kp && byP.has(r.kp)) { byP.get(r.kp).forEach((i) => idx.add(i)); via = via || 'telefone'; }
      if (!idx.size && r.kn && byN.has(r.kn)) {
        for (const i of byN.get(r.kn)) if (!r.created || Math.abs(daysBetween(leads[i].d, r.created)) <= 10) idx.add(i);
        if (idx.size) via = 'nome';
      }
      const touches = [...idx].map((i) => [leads[i].d, leads[i].ad, via]);
      for (const i of idx) if (rankOf(r.stage) > rankOf(leadSt[i])) leadSt[i] = r.stage;

      // UTM gravada no Dommus (lead de landing page): é a ligação mais exata
      const when = r.created || r.saleDate || r.updated;
      let camp = null;
      const uc = String(r.utmContent || '').trim();
      if (uc && ads[uc]) {
        if (!touches.some((t) => t[1] === uc)) touches.push([when, uc, 'utm']);
        if (!idx.size) { via = 'utm'; if (when) extra.push([when, uc, r.stage, 'utm']); }
      }
      if (!touches.length) {
        // sem contato em comum: tenta pelo nome do anúncio/campanha que o Dommus guardou
        for (const v of [uc, r.campaign, r.media, r.origin]) {
          const k = text(v); if (!k) continue;
          if (adByName.has(k)) { touches.push([when, adByName.get(k), 'anuncio']); via = 'anuncio'; break; }
          if (camps[String(v).trim()]) { camp = String(v).trim(); via = 'campanha'; break; }
          if (campByName.has(k)) { camp = campByName.get(k); via = 'campanha'; break; }
        }
        if (touches.length && when) extra.push([when, touches[0][1], r.stage, 'anuncio']);
      }
      if (touches.length) cov.linked++; else if (camp) cov.campaignOnly++; else cov.none++;
      if (via) cov.via[via] = (cov.via[via] || 0) + 1;

      const isSale = r.stage === 4 || (r.saleDate && r.stage !== LOST);
      if (isSale) {
        touches.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        sales.push({
          d: r.saleDate || r.updated || r.created, v: r.value, pr: r.product,
          nm: maskName(r.name), ph: maskPhone(r.phone, r.ddd), cr: r.created,
          o: [r.origin, r.media, r.campaign].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ').slice(0, 80),
          st: r.stageRaw, t: touches, via, camp: camp || (touches.length ? null : undefined),
        });
      }
    }
    const rows = leads.map((l, i) => [l.d, l.ad, leadSt[i], 'form']).concat(extra);
    const inRange = leads.filter((l) => !cov.since || l.d >= cov.since);
    cov.metaLeads = inRange.length;
    cov.found = leads.filter((l, i) => (!cov.since || l.d >= cov.since) && leadSt[i] !== NOT_FOUND).length;
    sales.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    return { leads: { cols: ['d', 'ad', 'st', 'via'], rows }, sales, coverage: cov };
  }

  /** Chaves de contato de um registro do Dommus, com a função de hash escolhida (identidade no servidor, HMAC no navegador). */
  async function withKeys(records, hash) {
    for (const r of records) {
      const e = normEmail(r.email), p = r.phoneKey, n = normName(r.name);
      r.ke = e ? await hash(e) : null; r.kp = p ? await hash(p) : null; r.kn = n ? await hash(n) : null;
    }
    return records;
  }

  root.BNRSales = { STAGES, LOST, NOT_FOUND, VIA, FIELDS, FIELD_LABEL, norm, keyOf, normEmail, normPhone, normName, parseDate, parseMoney, parseCSV, parseXLSX, readFile, jsonToObjects, toRecords, mapColumns, stageOf, maskName, maskPhone, match, withKeys };
})(typeof window !== 'undefined' ? window : globalThis);
