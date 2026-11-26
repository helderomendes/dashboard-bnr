/* Importador do CSV exportado do Gerenciador de Anúncios (pt-BR ou inglês).
   Como exportar: Gerenciador > aba Anúncios > Detalhamento > Por tempo > Dia >
   Relatórios > Exportar dados da tabela (.csv).
   Colunas úteis: Nome da campanha, Nome do conjunto de anúncios, Nome do anúncio,
   Dia, Valor usado, Impressões, Cliques no link, Leads, Conversas por mensagem iniciadas. */
(function () {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0];
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : (firstLine.includes('\t') ? '\t' : ',');
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; if (row.some((c) => c !== '')) rows.push(row); row = [];
      } else cur += ch;
    }
    row.push(cur); if (row.some((c) => c !== '')) rows.push(row);
    return rows;
  }

  // pt=true: "1.234,56" (ponto = milhar). pt=false: "1,234.56" (vírgula = milhar).
  function num(v, pt) {
    if (v == null) return 0;
    let s = String(v).replace(/[^\d,.\-]/g, '');
    if (!s) return 0;
    s = pt ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function date(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  const FIELDS = {
    campaign: [['nome da campanha'], ['campaign name']],
    adset: [['nome do conjunto de anuncios'], ['ad set name']],
    ad: [['nome do anuncio'], ['ad name']],
    day: [['dia'], ['day'], ['inicio dos relatorios'], ['reporting starts'], ['data']],
    spend: [['valor usado'], ['amount spent'], ['valor gasto']],
    imp: [['impressoes'], ['impressions']],
    clk: [['cliques (todos)'], ['clicks (all)']],
    lclk: [['cliques no link'], ['link clicks']],
    leads: [['leads'], ['leads (formulario)'], ['leads no site'], ['website leads'], ['on-facebook leads']],
    msgs: [['conversas por mensagem iniciadas'], ['messaging conversations started']],
    results: [['resultados'], ['results']],
    resultType: [['indicador de resultado'], ['tipo de resultado'], ['result indicator'], ['result type']],
    adStatus: [['veiculacao do anuncio'], ['ad delivery'], ['status de veiculacao']],
    campaignId: [['identificacao da campanha'], ['id da campanha'], ['campaign id']],
    adsetId: [['identificacao do conjunto de anuncios'], ['id do conjunto de anuncios'], ['ad set id']],
    adId: [['identificacao do anuncio'], ['id do anuncio'], ['ad id']],
  };

  function mapHeader(header) {
    const h = header.map(norm);
    const idx = {};
    for (const [key, aliases] of Object.entries(FIELDS)) {
      for (const [a] of aliases) {
        let i = h.indexOf(a);
        if (i < 0) i = h.findIndex((x) => x.startsWith(a + ' (') || x.startsWith(a + ' -'));
        if (i >= 0) { idx[key] = i; break; }
      }
    }
    return idx;
  }

  function toData(text, fileName) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('O arquivo está vazio.');
    const idx = mapHeader(rows[0]);
    if (idx.ad == null && idx.campaign == null) throw new Error('Não encontrei as colunas "Nome da campanha" / "Nome do anúncio". Exporte a tabela no nível de Anúncios.');
    if (idx.spend == null) throw new Error('Não encontrei a coluna "Valor usado". Inclua essa coluna antes de exportar.');
    const pt = /valor usado|valor gasto|impressoes|nome d/.test(rows[0].map(norm).join('|'));
    const n = (v) => num(v, pt);
    const currency = ((rows[0][idx.spend] || '').match(/\(([A-Z]{3})\)/) || [])[1] || 'BRL';
    const today = new Date().toISOString().slice(0, 10);
    const data = {
      version: 1, source: 'csv', generatedAt: new Date().toISOString(), fileName,
      account: { id: '', name: 'BNR Construtora 01 (CSV)', currency },
      campaigns: {}, adsets: {}, ads: {},
      daily: { cols: ['d', 'ad', 'spend', 'imp', 'clk', 'lclk', 'leads', 'msgs'], rows: [] },
      breakdowns: {},
    };
    const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    let noDate = false;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (k) => (idx[k] != null ? row[idx[k]] : '');
      const cName = get('campaign') || '(sem campanha)';
      const sName = get('adset') || '(sem conjunto)';
      const aName = get('ad') || sName;
      if (/^total/i.test(norm(cName)) && !get('ad')) continue;
      const cId = get('campaignId') || 'c-' + slug(cName);
      const sId = get('adsetId') || 's-' + slug(cName + '|' + sName);
      const aId = get('adId') || 'a-' + slug(cName + '|' + sName + '|' + aName);
      const st = norm(get('adStatus'));
      const status = !st ? 'UNKNOWN' : /ativ|active/.test(st) && !/inativ|inactive/.test(st) ? 'ACTIVE' : 'PAUSED';
      data.campaigns[cId] = data.campaigns[cId] || { name: cName, status: 'UNKNOWN' };
      data.adsets[sId] = data.adsets[sId] || { name: sName, status: 'UNKNOWN', campaignId: cId };
      data.ads[aId] = data.ads[aId] || { name: aName, status, adsetId: sId, campaignId: cId };
      if (status === 'ACTIVE') { data.adsets[sId].status = 'ACTIVE'; data.campaigns[cId].status = 'ACTIVE'; }
      let d = date(get('day'));
      if (!d) { d = today; noDate = true; }
      let leads = n(get('leads'));
      let msgs = n(get('msgs'));
      if (idx.leads == null && idx.results != null) {
        const t = norm(get('resultType'));
        const res = n(get('results'));
        if (/mensag|messag|conversa/.test(t)) msgs = msgs || res; else leads = res;
      }
      data.daily.rows.push([d, aId, n(get('spend')), n(get('imp')), n(get('clk')) || n(get('lclk')), n(get('lclk')), leads, msgs]);
    }
    for (const c of Object.values(data.campaigns)) if (c.status === 'UNKNOWN') c.status = 'PAUSED';
    for (const s of Object.values(data.adsets)) if (s.status === 'UNKNOWN') s.status = 'PAUSED';
    for (const a of Object.values(data.ads)) if (a.status === 'UNKNOWN') a.status = 'PAUSED';
    data.warning = noDate ? 'O CSV não tem a coluna "Dia" — todos os números foram atribuídos a hoje. Para ver a evolução diária, exporte com Detalhamento > Por tempo > Dia.' : null;
    return data;
  }

  window.BNRCsv = { toData, parseCSV, num };
})();
