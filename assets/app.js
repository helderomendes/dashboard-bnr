/* BNR · Dashboard Meta Ads — lógica principal (sem build, sem dependências além do ECharts) */
(function () {
  'use strict';

  // ------------------------------------------------------------------ utils
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bnr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bnr.' + k, JSON.stringify(v)); } catch (e) { /* sem storage */ } },
  };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  let CUR = 'BRL';
  const nf = {
    int: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
    dec: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    pct: new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    compact: new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }),
  };
  let moneyFmt, moneyFmt0;
  function setCurrency(c) {
    CUR = c || 'BRL';
    moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: CUR, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFmt0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: CUR, maximumFractionDigits: 0 });
  }
  setCurrency('BRL');
  const F = {
    money: (v) => (v == null || !isFinite(v) ? '—' : Math.abs(v) >= 10000 ? moneyFmt0.format(v) : moneyFmt.format(v)),
    int: (v) => (v == null || !isFinite(v) ? '—' : nf.int.format(v)),
    pct: (v) => (v == null || !isFinite(v) ? '—' : nf.pct.format(v)),
    compact: (v) => (v == null || !isFinite(v) ? '—' : nf.compact.format(v)),
  };

  // datas como 'YYYY-MM-DD' (UTC, sem fuso)
  const D = {
    parse: (s) => new Date(s + 'T00:00:00Z'),
    iso: (d) => d.toISOString().slice(0, 10),
    add: (s, n) => { const d = D.parse(s); d.setUTCDate(d.getUTCDate() + n); return D.iso(d); },
    diff: (a, b) => Math.round((D.parse(b) - D.parse(a)) / 864e5),
    today: () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; },
    fmt: (s, opt) => D.parse(s).toLocaleDateString('pt-BR', Object.assign({ timeZone: 'UTC', day: '2-digit', month: 'short' }, opt || {})).replace('.', ''),
    weekStart: (s) => { const d = D.parse(s); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return D.iso(d); },
    monthStart: (s) => s.slice(0, 8) + '01',
  };

  // ------------------------------------------------------------------ state
  const PRESETS = [
    ['today', 'Hoje'], ['yesterday', 'Ontem'], ['last_7', 'Últimos 7 dias'], ['last_14', 'Últimos 14 dias'],
    ['last_30', 'Últimos 30 dias'], ['this_month', 'Este mês'], ['last_month', 'Mês passado'],
    ['last_90', 'Últimos 90 dias'], ['max', 'Todo o período'], ['custom', 'Personalizado'],
  ];
  const state = {
    data: null,
    preset: 'last_30', since: null, until: null,
    compare: store.get('compare', true),
    mode: store.get('mode', 'leads'),
    campaigns: new Set(), adsets: new Set(), status: 'all', q: '',
    trend: 'res', gran: 'day', share: 'res', bd: 'res',
    rankSort: 'cpl', rankLimit: 8,
    minRes: store.get('minRes', 3), goal: store.get('goal', null),
    tableView: 'tree', sort: { key: 'res', dir: -1 }, expanded: new Set(),
  };
  const RES_LABEL = { leads: 'Leads', msgs: 'Conversas', all: 'Resultados' };
  const resLabel = () => RES_LABEL[state.mode];
  const cplLabel = () => (state.mode === 'msgs' ? 'Custo/conversa' : state.mode === 'all' ? 'Custo/resultado' : 'CPL');

  function rangeFor(preset) {
    const t = D.today();
    const dmin = state.data ? state.data.minDate : D.add(t, -90);
    switch (preset) {
      case 'today': return [t, t];
      case 'yesterday': return [D.add(t, -1), D.add(t, -1)];
      case 'last_7': return [D.add(t, -7), D.add(t, -1)];
      case 'last_14': return [D.add(t, -14), D.add(t, -1)];
      case 'last_30': return [D.add(t, -30), D.add(t, -1)];
      case 'last_90': return [D.add(t, -90), D.add(t, -1)];
      case 'this_month': return [t.slice(0, 8) + '01', t];
      case 'last_month': { const end = D.add(t.slice(0, 8) + '01', -1); return [end.slice(0, 8) + '01', end]; }
      case 'max': return [dmin, state.data ? state.data.maxDate : t];
      default: return [state.since, state.until];
    }
  }
  function setPreset(p) {
    state.preset = p;
    if (p !== 'custom') { const [a, b] = rangeFor(p); state.since = a; state.until = b; }
  }
  const prevRange = () => { const n = D.diff(state.since, state.until) + 1; return [D.add(state.since, -n), D.add(state.since, -1)]; };

  // ------------------------------------------------------------------ data
  function prepare(data) {
    const C = {}; data.daily.cols.forEach((c, i) => (C[c] = i));
    data._c = C;
    let min = '9999', max = '0000';
    for (const r of data.daily.rows) { if (r[C.d] < min) min = r[C.d]; if (r[C.d] > max) max = r[C.d]; }
    data.minDate = min === '9999' ? D.today() : min;
    data.maxDate = max === '0000' ? D.today() : max;
    // garante objetos de hierarquia mesmo se faltarem metadados
    for (const r of data.daily.rows) {
      const id = r[C.ad];
      if (!data.ads[id]) data.ads[id] = { name: 'Anúncio ' + id, status: 'UNKNOWN', adsetId: 'na', campaignId: 'na' };
    }
    for (const [id, a] of Object.entries(data.ads)) {
      a.id = id;
      if (!data.adsets[a.adsetId]) data.adsets[a.adsetId] = { name: '(conjunto ' + a.adsetId + ')', status: 'UNKNOWN', campaignId: a.campaignId };
      if (!data.campaigns[a.campaignId]) data.campaigns[a.campaignId] = { name: '(campanha ' + a.campaignId + ')', status: 'UNKNOWN' };
      a._s = norm(a.name + ' ' + data.adsets[a.adsetId].name + ' ' + data.campaigns[a.campaignId].name);
    }
    for (const [id, s] of Object.entries(data.adsets)) s.id = id;
    for (const [id, c] of Object.entries(data.campaigns)) c.id = id;
    for (const b of Object.values(data.breakdowns || {})) { b._c = {}; b.cols.forEach((c, i) => (b._c[c] = i)); }
    return data;
  }
  const isActive = (s) => s === 'ACTIVE';

  function allowedAds() {
    const d = state.data; const q = norm(state.q).trim();
    const set = new Set();
    for (const a of Object.values(d.ads)) {
      if (state.campaigns.size && !state.campaigns.has(a.campaignId)) continue;
      if (state.adsets.size && !state.adsets.has(a.adsetId)) continue;
      if (state.status === 'active' && !isActive(a.status)) continue;
      if (state.status === 'inactive' && isActive(a.status)) continue;
      if (q && !q.split(/\s+/).every((w) => a._s.includes(w))) continue;
      set.add(a.id);
    }
    return set;
  }
  const blank = () => ({ spend: 0, imp: 0, clk: 0, lclk: 0, leads: 0, msgs: 0, days: 0 });
  function add(m, r, C) {
    m.spend += r[C.spend] || 0; m.imp += r[C.imp] || 0; m.clk += r[C.clk] || 0;
    m.lclk += r[C.lclk] || 0; m.leads += r[C.leads] || 0; m.msgs += r[C.msgs] || 0;
  }
  function derive(m) {
    const res = state.mode === 'leads' ? m.leads : state.mode === 'msgs' ? m.msgs : m.leads + m.msgs;
    m.res = res;
    m.cpl = res > 0 ? m.spend / res : null;
    m.ctr = m.imp > 0 ? m.lclk / m.imp : null;
    m.cpc = m.lclk > 0 ? m.spend / m.lclk : null;
    m.cpm = m.imp > 0 ? (m.spend / m.imp) * 1000 : null;
    m.cvr = m.lclk > 0 ? res / m.lclk : null;
    return m;
  }
  /** Agrega linhas diárias (filtradas) por uma chave. */
  function aggregate(since, until, allowed, keyFn) {
    const d = state.data, C = d._c; const out = new Map();
    for (const r of d.daily.rows) {
      const day = r[C.d];
      if (day < since || day > until || !allowed.has(r[C.ad])) continue;
      const k = keyFn ? keyFn(r, d.ads[r[C.ad]]) : 'all';
      let m = out.get(k); if (!m) out.set(k, (m = blank()));
      add(m, r, C);
    }
    for (const m of out.values()) derive(m);
    return out;
  }
  const total = (since, until, allowed) => aggregate(since, until, allowed).get('all') || derive(blank());

  /** Breakdown (nível campanha): respeita filtro de campanha e período. */
  function breakdown(name, since, until, allowed) {
    const b = state.data.breakdowns && state.data.breakdowns[name];
    if (!b || !b.rows.length) return null;
    const C = b._c; const camps = new Set();
    for (const id of allowed) camps.add(state.data.ads[id].campaignId);
    const out = new Map();
    for (const r of b.rows) {
      if (r[C.d] < since || r[C.d] > until || !camps.has(r[C.c])) continue;
      let m = out.get(r[C.k]); if (!m) out.set(r[C.k], (m = blank()));
      add(m, r, C);
    }
    for (const m of out.values()) derive(m);
    return out;
  }

  // ------------------------------------------------------------------ charts
  const charts = {};
  function chart(id) {
    const el = document.getElementById(id);
    if (!charts[id] || charts[id].isDisposed()) charts[id] = echarts.init(el, null, { renderer: 'canvas' });
    return charts[id];
  }
  window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));
  function palette() {
    return {
      c: [1, 2, 3, 4, 5, 6].map((i) => css('--chart-' + i)),
      text: css('--text'), text2: css('--text-2'), text3: css('--text-3'), grid: css('--chart-grid'),
      surface: css('--surface'), border: css('--border'), accent: css('--accent'), good: css('--good'), bad: css('--bad'),
    };
  }
  function baseOpt(p) {
    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: p.text2 },
      tooltip: {
        trigger: 'axis', backgroundColor: p.surface, borderColor: p.border, textStyle: { color: p.text, fontSize: 12 },
        extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.15);border-radius:10px;padding:10px 12px;',
      },
      grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
      animationDuration: 400,
    };
  }
  const axisCommon = (p) => ({
    axisLine: { lineStyle: { color: p.border } }, axisTick: { show: false },
    axisLabel: { color: p.text3, fontSize: 11 }, splitLine: { lineStyle: { color: p.grid } },
  });
  function emptyChart(id, msg) {
    const c = chart(id); c.clear();
    c.setOption({ title: { text: msg || 'Sem dados no período', left: 'center', top: 'middle', textStyle: { color: css('--text-3'), fontSize: 13, fontWeight: 500 } } });
  }

  // ------------------------------------------------------------------ render
  let allowed = new Set();
  let cur = null, prev = null;
  function render() {
    if (!state.data) return;
    allowed = allowedAds();
    cur = total(state.since, state.until, allowed);
    const [ps, pu] = prevRange();
    prev = state.compare ? total(ps, pu, allowed) : null;
    renderHeader(); renderChips(); renderKPIs(); renderTrend(); renderInsights();
    renderSankey(); renderShare(); renderRanking(); renderTable();
    renderBreakdowns(); renderWeekday(); renderFunnel();
    writeHash();
  }

  function renderHeader() {
    const d = state.data;
    const lbl = state.preset === 'custom' ? `${D.fmt(state.since)} – ${D.fmt(state.until, { year: 'numeric' })}` : PRESETS.find((p) => p[0] === state.preset)[1];
    $('#date-label').textContent = lbl;
    const gen = new Date(d.generatedAt);
    const ago = Math.round((Date.now() - gen) / 60000);
    const agoTxt = ago < 1 ? 'agora' : ago < 60 ? `há ${ago} min` : ago < 1440 ? `há ${Math.round(ago / 60)} h` : gen.toLocaleDateString('pt-BR');
    const src = { demo: 'Modo demonstração', csv: 'CSV importado', live: 'Atualizado ' + agoTxt }[d.source] || '';
    $('#account-line').innerHTML = `<span class="dot ${d.source !== 'live' ? 'demo' : ''}"></span>${esc(d.account.name)} · ${src} · ${D.fmt(state.since)} – ${D.fmt(state.until, { year: 'numeric' })}`;
    $$('#mode-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    $$('#status-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.status === state.status));
    $('#compare').checked = state.compare;
    let banner = '';
    if (d.source === 'demo') banner = `<div class="banner"><span>⚠️</span><span><strong>Dados de demonstração.</strong> Conecte a conta <b>BNR Construtora 01</b> seguindo o README (grátis, ~10 min) ou importe um CSV do Gerenciador de Anúncios.</span><label class="btn">Importar CSV<input type="file" accept=".csv" hidden data-csv></label></div>`;
    else if (d.warning) banner = `<div class="banner"><span>ℹ️</span><span>${esc(d.warning)}</span></div>`;
    $('#banner').innerHTML = banner;
    const inp = $('#banner [data-csv]'); if (inp) inp.addEventListener('change', onCsvInput);
    $('#foot-left').textContent = `${d.account.name}${d.account.id ? ' · ' + d.account.id : ''} · ${Object.keys(d.campaigns).length} campanhas · ${Object.keys(d.ads).length} anúncios`;
  }

  function renderChips() {
    const d = state.data; const chips = [];
    for (const id of state.campaigns) chips.push(['c', id, 'Campanha: ' + d.campaigns[id].name]);
    for (const id of state.adsets) chips.push(['s', id, 'Conjunto: ' + d.adsets[id].name]);
    if (state.q) chips.push(['q', '', 'Busca: “' + state.q + '”']);
    $('#chips').innerHTML = chips.map(([t, id, l]) => `<span class="chip" title="${esc(l)}"><span>${esc(l)}</span><button data-t="${t}" data-id="${esc(id)}" aria-label="Remover filtro">✕</button></span>`).join('') +
      (chips.length > 1 ? '<button class="linkbtn" id="clear-all">Limpar filtros</button>' : '');
    msCampaigns.refresh(); msAdsets.refresh();
  }

  // ---- KPIs
  function delta(curV, prevV, inverse) {
    if (!state.compare || prevV == null || curV == null || !isFinite(prevV)) return '<span class="muted">sem comparação</span>';
    if (prevV === 0) return curV === 0 ? '<span class="delta flat">0%</span>' : '<span class="delta flat">novo</span>';
    const ch = (curV - prevV) / prevV;
    if (Math.abs(ch) < 0.005) return '<span class="delta flat">0%</span>';
    const good = inverse ? ch < 0 : ch > 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${ch > 0 ? '▲' : '▼'} ${nf.int.format(Math.abs(ch * 100))}%</span>`;
  }
  function sparkSeries(metric) {
    const n = D.diff(state.since, state.until) + 1;
    const step = n > 45 ? 7 : 1;
    const m = aggregate(state.since, state.until, allowed, (r, a) => {
      const k = D.diff(state.since, r[state.data._c.d]); return Math.floor(k / step);
    });
    const pts = [];
    for (let i = 0; i <= Math.floor((n - 1) / step); i++) { const x = m.get(i); pts.push(x ? x[metric] : null); }
    return pts;
  }
  function spark(values, color) {
    const v = values.map((x) => (x == null ? 0 : x));
    if (v.length < 2) return '';
    const max = Math.max(...v), min = Math.min(...v); const rg = max - min || 1;
    const pts = v.map((x, i) => `${(i / (v.length - 1)) * 84},${28 - ((x - min) / rg) * 26}`).join(' ');
    return `<svg class="spark" viewBox="0 0 84 30" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  function renderKPIs() {
    const p = palette(); const c = cur, pr = prev || {};
    const items = [
      { k: 'spend', l: 'Investimento', f: F.money, hero: false, tip: 'Valor usado no período' },
      { k: 'res', l: resLabel(), f: F.int, hero: true, tip: state.mode === 'leads' ? 'Leads de formulário instantâneo + leads no site (pixel)' : state.mode === 'msgs' ? 'Conversas por mensagem iniciadas (WhatsApp, Messenger, Direct)' : 'Leads + conversas iniciadas' },
      { k: 'cpl', l: cplLabel(), f: F.money, inv: true, hero: true, tip: 'Investimento ÷ resultados' },
      { k: 'cvr', l: 'Conversão clique → lead', f: F.pct, tip: 'Resultados ÷ cliques no link' },
      { k: 'ctr', l: 'CTR (link)', f: F.pct, tip: 'Cliques no link ÷ impressões' },
      { k: 'cpc', l: 'CPC (link)', f: F.money, inv: true, tip: 'Investimento ÷ cliques no link' },
      { k: 'cpm', l: 'CPM', f: F.money, inv: true, tip: 'Custo por mil impressões' },
      { k: 'imp', l: 'Impressões', f: F.compact, tip: 'Total de impressões', sub: (x) => F.int(x.lclk) + ' cliques no link' },
    ];
    $('#kpis').innerHTML = items.map((it) => {
      const sp = ['spend', 'res', 'cpl', 'imp', 'ctr'].includes(it.k) ? spark(sparkSeries(it.k), it.k === 'cpl' ? p.c[1] : p.c[0]) : '';
      const prevTxt = state.compare && pr[it.k] != null ? `<span title="Período anterior">ant. ${it.f(pr[it.k])}</span>` : (it.sub ? `<span>${it.sub(c)}</span>` : '');
      return `<div class="card kpi ${it.hero ? 'hero' : ''}">
        <div class="kpi-label">${esc(it.l)} <span class="info-tip" title="${esc(it.tip)}">?</span></div>
        <div class="kpi-value num">${it.f(c[it.k])}</div>
        <div class="kpi-foot">${delta(c[it.k], pr[it.k], it.inv)} ${prevTxt}</div>${sp}</div>`;
    }).join('');
  }

  // ---- Trend
  function bucketKey(day) { return state.gran === 'week' ? D.weekStart(day) : state.gran === 'month' ? D.monthStart(day) : day; }
  function buckets(since, until) {
    const out = []; let d = since; const seen = new Set();
    while (d <= until) { const k = bucketKey(d); if (!seen.has(k)) { seen.add(k); out.push(k); } d = D.add(d, 1); }
    return out;
  }
  function renderTrend() {
    const p = palette();
    const keys = buckets(state.since, state.until);
    const m = aggregate(state.since, state.until, allowed, (r) => bucketKey(r[state.data._c.d]));
    const get = (k, f) => { const x = m.get(k); return x ? x[f] : 0; };
    const getN = (k, f) => { const x = m.get(k); return x && x[f] != null ? +x[f].toFixed(4) : null; };
    let prevSeries = null;
    if (state.compare) {
      const [ps, pu] = prevRange();
      const pk = buckets(ps, pu);
      const pm = aggregate(ps, pu, allowed, (r) => bucketKey(r[state.data._c.d]));
      const f = state.trend === 'res' ? 'res' : state.trend === 'spend' ? 'spend' : 'ctr';
      prevSeries = keys.map((_, i) => { const x = pm.get(pk[i]); return x && x[f] != null ? +x[f].toFixed(4) : null; });
    }
    const labels = keys.map((k) => state.gran === 'month' ? D.fmt(k, { day: undefined, month: 'short', year: '2-digit' }) : D.fmt(k));
    const o = baseOpt(p); const ax = axisCommon(p);
    o.legend = { top: 0, right: 0, textStyle: { color: p.text2, fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 };
    o.xAxis = Object.assign({ type: 'category', data: labels, boundaryGap: true }, ax, { splitLine: { show: false } });
    const yL = (fmt) => Object.assign({ type: 'value', axisLabel: { color: p.text3, fontSize: 11, formatter: fmt } }, { splitLine: ax.splitLine });
    const yR = (fmt) => ({ type: 'value', axisLabel: { color: p.text3, fontSize: 11, formatter: fmt }, splitLine: { show: false } });
    const bar = (name, data, color) => ({ name, type: 'bar', data, itemStyle: { color, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 });
    const line = (name, data, color, yi, dashed) => ({ name, type: 'line', yAxisIndex: yi || 0, data, smooth: 0.3, symbol: 'circle', symbolSize: 5, showSymbol: keys.length < 40, connectNulls: true, lineStyle: { width: 2.2, color, type: dashed ? 'dashed' : 'solid' }, itemStyle: { color } });
    const prevLine = (data, yi) => Object.assign(line('Período anterior', data, p.text3, yi, true), { lineStyle: { width: 1.5, type: 'dashed', color: p.text3 }, symbol: 'none' });
    if (state.trend === 'res') {
      $('#trend-sub').textContent = `${resLabel()} e ${cplLabel().toLowerCase()} por ${({ day: 'dia', week: 'semana', month: 'mês' })[state.gran]}`;
      o.yAxis = [yL((v) => F.compact(v)), yR((v) => F.money(v))];
      o.series = [bar(resLabel(), keys.map((k) => get(k, 'res')), p.c[0]), line(cplLabel(), keys.map((k) => getN(k, 'cpl')), p.c[1], 1)];
      if (prevSeries) o.series.push(prevLine(prevSeries, 0));
      o.tooltip.valueFormatter = undefined;
      o.tooltip.formatter = tipFmt([F.int, F.money, F.int]);
    } else if (state.trend === 'spend') {
      $('#trend-sub').textContent = 'Investimento e resultados';
      o.yAxis = [yL((v) => F.compact(v)), yR((v) => F.compact(v))];
      o.series = [Object.assign(line('Investimento', keys.map((k) => +get(k, 'spend').toFixed(2)), p.c[1]), { areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: p.c[1] + '55' }, { offset: 1, color: p.c[1] + '00' }]) } }),
        line(resLabel(), keys.map((k) => get(k, 'res')), p.c[0], 1)];
      if (prevSeries) o.series.push(prevLine(prevSeries, 0));
      o.tooltip.formatter = tipFmt([F.money, F.int, F.money]);
    } else {
      $('#trend-sub').textContent = 'CTR do link e custo por clique';
      o.yAxis = [yL((v) => nf.pct.format(v)), yR((v) => F.money(v))];
      o.series = [line('CTR', keys.map((k) => getN(k, 'ctr')), p.c[2]), line('CPC', keys.map((k) => getN(k, 'cpc')), p.c[1], 1)];
      if (prevSeries) o.series.push(prevLine(prevSeries, 0));
      o.tooltip.formatter = tipFmt([F.pct, F.money, F.pct]);
    }
    chart('trend-chart').setOption(o, true);
  }
  function tipFmt(fmts) {
    return (ps) => {
      if (!ps.length) return '';
      return `<div style="font-weight:600;margin-bottom:4px">${ps[0].axisValueLabel}</div>` + ps.map((x) =>
        `<div style="display:flex;gap:14px;justify-content:space-between"><span>${x.marker}${x.seriesName}</span><b>${(fmts[x.seriesIndex] || F.int)(x.value)}</b></div>`).join('');
    };
  }

  // ---- goal / CPL color
  function goalValue() { return state.goal || (cur && cur.cpl) || null; }
  function cplClass(v) {
    const g = goalValue(); if (v == null) return 'none'; if (!g) return 'none';
    return v <= g ? 'good' : v <= g * 1.3 ? 'warn' : 'bad';
  }
  const cplChip = (v) => `<span class="cpl-chip ${cplClass(v)}">${F.money(v)}</span>`;
  const statusPill = (s) => `<span class="status ${isActive(s) ? 'on' : 'off'}">${isActive(s) ? 'Ativo' : ({ PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado', ARCHIVED: 'Arquivado', DELETED: 'Excluído', DISAPPROVED: 'Reprovado', WITH_ISSUES: 'Com problemas', IN_PROCESS: 'Em análise', PENDING_REVIEW: 'Em análise' }[s] || 'Inativo')}</span>`;

  // ---- Insights
  function renderInsights() {
    const d = state.data; const out = [];
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    const byCamp = aggregate(state.since, state.until, allowed, (r, a) => a.campaignId);
    const avg = cur.cpl;
    const ads = [...byAd.entries()].map(([id, m]) => Object.assign({ id }, m));
    const minR = Math.max(1, state.minRes);
    const qualified = ads.filter((a) => a.res >= minR).sort((a, b) => a.cpl - b.cpl);
    const link = (id, txt) => `<a data-ad="${esc(id)}">${esc(txt)}</a>`;
    if (!cur.spend) { $('#insights').innerHTML = '<div class="empty">Sem investimento no período/filtro selecionado.</div>'; return; }
    if (qualified.length) {
      const b = qualified[0];
      const pct = avg ? Math.round((1 - b.cpl / avg) * 100) : 0;
      out.push(['good', '🏆', `Melhor anúncio: ${link(b.id, d.ads[b.id].name)}`, `${F.money(b.cpl)} por ${resLabel().toLowerCase().replace(/s$/, '')} com ${F.int(b.res)} resultados${pct > 0 ? ` — ${pct}% abaixo da média da conta` : ''}. Candidato a receber mais verba.`]);
    }
    const thresh = Math.max((avg || 0) * 1.5, 50);
    const burners = ads.filter((a) => a.res === 0 && a.spend >= thresh).sort((a, b) => b.spend - a.spend).slice(0, 3);
    for (const a of burners) out.push(['bad', '🔥', `Gastando sem resultado: ${link(a.id, d.ads[a.id].name)}`, `${F.money(a.spend)} investidos e nenhum ${resLabel().toLowerCase().replace(/s$/, '')} no período${avg ? ` (equivale a ${(a.spend / avg).toFixed(1)}× o CPL médio)` : ''}. Revise criativo/público ou pause.`]);
    if (qualified.length > 2) {
      const w = qualified[qualified.length - 1];
      if (avg && w.cpl > avg * 1.6) out.push(['warn', '📉', `CPL alto: ${link(w.id, d.ads[w.id].name)}`, `${F.money(w.cpl)} — ${(w.cpl / avg).toFixed(1)}× a média. Consumiu ${F.money(w.spend)} (${Math.round(w.spend / cur.spend * 100)}% da verba).`]);
    }
    if (state.compare) {
      const [ps, pu] = prevRange();
      const prevCamp = aggregate(ps, pu, allowed, (r, a) => a.campaignId);
      for (const [id, m] of byCamp) {
        const p0 = prevCamp.get(id);
        if (!p0 || !p0.cpl || !m.cpl || m.res < minR || p0.res < minR) continue;
        const ch = (m.cpl - p0.cpl) / p0.cpl;
        if (ch > 0.25) out.push(['warn', '⚠️', `CPL subiu ${Math.round(ch * 100)}% em ${esc(d.campaigns[id].name)}`, `De ${F.money(p0.cpl)} para ${F.money(m.cpl)} vs. período anterior.`]);
        else if (ch < -0.2) out.push(['good', '✅', `CPL caiu ${Math.round(-ch * 100)}% em ${esc(d.campaigns[id].name)}`, `De ${F.money(p0.cpl)} para ${F.money(m.cpl)} vs. período anterior.`]);
      }
    }
    if (cur.res > 5) {
      const top = ads.sort((a, b) => b.res - a.res)[0];
      const share = top.res / cur.res;
      if (share > 0.4 && ads.length > 3) out.push(['info', '🎯', 'Dependência de um criativo', `${link(top.id, d.ads[top.id].name)} gera ${Math.round(share * 100)}% dos resultados. Teste variações para não depender de um único anúncio.`]);
      const camps = [...byCamp.entries()].filter(([, m]) => m.spend > 0).sort((a, b) => b[1].res - a[1].res);
      if (camps.length > 1) {
        const [cid, cm] = camps[0];
        out.push(['info', '📍', `Principal origem: ${esc(d.campaigns[cid].name)}`, `${Math.round((cm.res / cur.res) * 100)}% dos resultados com ${Math.round((cm.spend / cur.spend) * 100)}% da verba.`]);
      }
    }
    const pl = breakdown('placement', state.since, state.until, allowed);
    if (pl) {
      const best = [...pl.entries()].filter(([, m]) => m.res >= minR).sort((a, b) => a[1].cpl - b[1].cpl)[0];
      if (best && avg) out.push(['info', '📱', `Posicionamento mais barato: ${esc(placementLabel(best[0]))}`, `${F.money(best[1].cpl)} por resultado (${F.int(best[1].res)} resultados).`]);
    }
    const wd = weekdayAgg();
    const bestW = wd.filter((x) => x.res >= minR).sort((a, b) => a.cpl - b.cpl)[0];
    if (bestW && D.diff(state.since, state.until) >= 13) out.push(['info', '📅', `Melhor dia: ${bestW.label}`, `CPL médio de ${F.money(bestW.cpl)} às ${bestW.label.toLowerCase()}s.`]);
    $('#insights').innerHTML = out.length ? out.map(([t, ico, title, text]) => `<div class="insight ${t}"><div class="ico">${ico}</div><div><b>${title}</b><p>${text}</p></div></div>`).join('') : '<div class="empty">Nada fora do normal neste período. 👌</div>';
  }

  // ---- Sankey
  function renderSankey() {
    const p = palette(); const d = state.data;
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    const ads = [...byAd.entries()].filter(([, m]) => m.res > 0).sort((a, b) => b[1].res - a[1].res);
    if (!ads.length) return emptyChart('sankey-chart', `Nenhum ${resLabel().toLowerCase().replace(/s$/, '')} no período`);
    const TOP = window.innerWidth < 760 ? 8 : 14;
    const nodes = new Map(); const links = new Map(); const label = {}; const meta = {};
    const addNode = (k, name, depth, color, m) => { if (!nodes.has(k)) { nodes.set(k, { name: k, depth, itemStyle: { color, borderWidth: 0 } }); label[k] = name; meta[k] = { spend: 0, res: 0 }; } const x = meta[k]; x.spend += m.spend; x.res += m.res || 0; };
    const addLink = (s, t, v) => { const k = s + '>' + t; links.set(k, (links.get(k) || 0) + v); };
    const campColor = {}; let ci = 0;
    ads.forEach(([id, m], i) => {
      const a = d.ads[id];
      if (!campColor[a.campaignId]) campColor[a.campaignId] = p.c[ci++ % p.c.length];
      const col = campColor[a.campaignId];
      const ck = 'c:' + a.campaignId, sk = 's:' + a.adsetId;
      const ak = i < TOP ? 'a:' + id : 'o:' + a.adsetId;
      addNode(ck, d.campaigns[a.campaignId].name, 0, col, m);
      addNode(sk, d.adsets[a.adsetId].name, 1, col, m);
      addNode(ak, i < TOP ? a.name : 'Outros anúncios', 2, col, m);
      addLink(ck, sk, m.res); addLink(sk, ak, m.res);
    });
    for (const k in meta) { meta[k].cpl = meta[k].res ? meta[k].spend / meta[k].res : null; }
    const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
    const narrow = document.getElementById('sankey-chart').clientWidth < 700;
    const o = baseOpt(p);
    o.tooltip = Object.assign(o.tooltip, {
      trigger: 'item',
      formatter: (x) => {
        if (x.dataType === 'edge') return `${esc(trunc(label[x.data.source], 40))} → ${esc(trunc(label[x.data.target], 40))}<br><b>${F.int(x.data.value)}</b> ${resLabel().toLowerCase()}`;
        const m = meta[x.name];
        return `<b>${esc(label[x.name])}</b><br>${resLabel()}: <b>${F.int(m.res)}</b> (${Math.round(m.res / cur.res * 100)}%)<br>Investimento: ${F.money(m.spend)}<br>${cplLabel()}: ${F.money(m.cpl)}`;
      },
    });
    o.series = [{
      type: 'sankey', left: 4, right: narrow ? 110 : 190, top: 8, bottom: 8, nodeGap: 10, nodeWidth: 12, draggable: false,
      emphasis: { focus: 'adjacency' }, nodeAlign: 'left', layoutIterations: 64,
      data: [...nodes.values()], links: [...links.entries()].map(([k, v]) => { const [s, t] = k.split('>'); return { source: s, target: t, value: v }; }),
      lineStyle: { color: 'gradient', opacity: 0.28, curveness: 0.5 },
      label: { color: p.text, fontSize: 11.5, formatter: (x) => trunc(label[x.name], narrow ? 18 : 30) + '  ' + F.int(meta[x.name].res) },
    }];
    chart('sankey-chart').setOption(o, true);
    chart('sankey-chart').off('click');
    chart('sankey-chart').on('click', (x) => {
      if (x.dataType !== 'node') return;
      const [t, id] = x.name.split(':');
      if (t === 'a') openAd(id);
      else if (t === 'c') { state.campaigns = new Set([id]); state.adsets.clear(); render(); }
      else if (t === 's' || t === 'o') { state.adsets = new Set([id]); render(); }
    });
  }

  // ---- Share donut / bars
  function renderShare() {
    const p = palette(); const d = state.data;
    const byCamp = aggregate(state.since, state.until, allowed, (r, a) => a.campaignId);
    const rows = [...byCamp.entries()].filter(([, m]) => m.spend > 0).sort((a, b) => b[1].spend - a[1].spend);
    if (!rows.length) return emptyChart('share-chart');
    const f = state.share;
    const o = baseOpt(p);
    o.tooltip = Object.assign(o.tooltip, { trigger: 'item', formatter: (x) => { const m = byCamp.get(x.data.id); return `<b>${esc(x.name)}</b><br>Investimento: ${F.money(m.spend)} (${Math.round(m.spend / cur.spend * 100)}%)<br>${resLabel()}: ${F.int(m.res)} (${cur.res ? Math.round(m.res / cur.res * 100) : 0}%)<br>${cplLabel()}: ${F.money(m.cpl)}`; } });
    o.legend = { type: 'scroll', orient: 'horizontal', bottom: 0, left: 0, right: 0, textStyle: { color: p.text2, fontSize: 11.5 }, icon: 'circle', itemWidth: 8, formatter: (n) => (n.length > 34 ? n.slice(0, 33) + '…' : n) };
    o.series = [{
      type: 'pie', radius: ['48%', '74%'], center: ['50%', '44%'], padAngle: 2, itemStyle: { borderRadius: 6, borderColor: p.surface, borderWidth: 2 },
      label: { show: true, position: 'center', formatter: () => `{v|${f === 'res' ? F.int(cur.res) : F.compact(cur.spend)}}\n{l|${f === 'res' ? resLabel().toLowerCase() : 'investidos'}}`, rich: { v: { fontSize: 24, fontWeight: 700, color: p.text, lineHeight: 30 }, l: { fontSize: 12, color: p.text3 } } },
      emphasis: { scale: true, scaleSize: 6 }, labelLine: { show: false },
      data: rows.map(([id, m], i) => ({ id, name: d.campaigns[id].name, value: f === 'res' ? m.res : +m.spend.toFixed(2), itemStyle: { color: p.c[i % p.c.length] } })),
    }];
    chart('share-chart').setOption(o, true);
    chart('share-chart').off('click');
    chart('share-chart').on('click', (x) => { state.campaigns = new Set([x.data.id]); state.adsets.clear(); render(); });
  }

  // ---- Ranking
  function renderRanking() {
    const d = state.data;
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    let ads = [...byAd.entries()].filter(([, m]) => m.spend > 0).map(([id, m]) => Object.assign({ id }, m));
    const minR = state.minRes;
    const s = state.rankSort;
    if (s === 'cpl') ads = ads.filter((a) => a.res >= Math.max(1, minR)).sort((a, b) => a.cpl - b.cpl);
    else if (s === 'worst') ads = ads.sort((a, b) => (b.cpl ?? b.spend * 1e6) - (a.cpl ?? a.spend * 1e6));
    else if (s === 'res') ads.sort((a, b) => b.res - a.res || a.spend - b.spend);
    else if (s === 'spend') ads.sort((a, b) => b.spend - a.spend);
    else if (s === 'ctr') ads = ads.filter((a) => a.imp >= 1000).sort((a, b) => b.ctr - a.ctr);
    $('#rank-sub').textContent = s === 'cpl' ? `Menor ${cplLabel()} entre anúncios com pelo menos ${Math.max(1, minR)} ${resLabel().toLowerCase()} · média da conta ${F.money(cur.cpl)}` : `${ads.length} anúncios com veiculação no período`;
    const list = ads.slice(0, state.rankLimit);
    $('#rank-more').classList.toggle('hidden', ads.length <= state.rankLimit);
    if (!list.length) { $('#ranking').innerHTML = `<div class="empty" style="grid-column:1/-1">Nenhum anúncio atende ao critério. Reduza o “mín. resultados” ou amplie o período.</div>`; return; }
    $('#ranking').innerHTML = list.map((a, i) => {
      const ad = d.ads[a.id];
      const img = ad.thumb || ad.image;
      return `<button class="ad-card" data-ad="${esc(a.id)}">
        <div class="ad-thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}">
          <span class="ad-rank ${i === 0 && (s === 'cpl' || s === 'res') ? 'gold' : ''}">#${i + 1}</span>
          <span class="ad-status">${statusPill(ad.status)}</span>
        </div>
        <div class="ad-info">
          <div class="ad-name" title="${esc(ad.name)}">${hl(ad.name)}</div>
          <div class="crumb" title="${esc(d.campaigns[ad.campaignId].name + ' › ' + d.adsets[ad.adsetId].name)}">${esc(d.campaigns[ad.campaignId].name)} › ${esc(d.adsets[ad.adsetId].name)}</div>
          <div class="ad-metrics">
            <div><span>${cplLabel()}</span>${cplChip(a.cpl)}</div>
            <div><span>${resLabel()}</span><strong class="num">${F.int(a.res)}</strong></div>
            <div><span>Investido</span><strong class="num" title="${F.money(a.spend)}">${a.spend >= 1000 ? moneyFmt0.format(a.spend) : F.money(a.spend)}</strong></div>
            <div><span>CTR</span><strong class="num">${F.pct(a.ctr)}</strong></div>
            <div><span>CPC</span><strong class="num">${F.money(a.cpc)}</strong></div>
            <div><span>Conv.</span><strong class="num">${F.pct(a.cvr)}</strong></div>
          </div>
        </div></button>`;
    }).join('');
  }
  function hl(text) {
    const q = norm(state.q).trim(); const t = String(text);
    if (!q) return esc(t);
    const n = norm(t); const words = q.split(/\s+/).filter(Boolean);
    const marks = new Array(t.length).fill(false);
    for (const w of words) { let i = n.indexOf(w); while (i > -1) { for (let j = i; j < i + w.length; j++) marks[j] = true; i = n.indexOf(w, i + 1); } }
    let out = '', open = false;
    for (let i = 0; i < t.length; i++) { if (marks[i] && !open) { out += '<mark>'; open = true; } if (!marks[i] && open) { out += '</mark>'; open = false; } out += esc(t[i]); }
    return out + (open ? '</mark>' : '');
  }

  // ---- Table
  const COLS = () => [
    { k: 'spend', t: 'Investimento', f: F.money },
    { k: 'res', t: resLabel(), f: F.int },
    { k: 'cpl', t: cplLabel(), f: (v) => cplChip(v), raw: true },
    { k: 'share', t: '% dos ' + resLabel().toLowerCase(), f: (v) => `<span class="share-bar"><i style="width:${Math.round((v || 0) * 60)}px"></i>${F.pct(v)}</span>`, raw: true },
    { k: 'ctr', t: 'CTR', f: F.pct },
    { k: 'cpc', t: 'CPC', f: F.money },
    { k: 'cpm', t: 'CPM', f: F.money },
    { k: 'imp', t: 'Impressões', f: F.int },
    { k: 'lclk', t: 'Cliques link', f: F.int },
    { k: 'cvr', t: 'Conv. clique→lead', f: F.pct },
  ];
  function sorter(a, b) {
    const k = state.sort.key, dir = state.sort.dir;
    if (k === 'name') return dir * a.name.localeCompare(b.name, 'pt-BR');
    const x = a.m[k], y = b.m[k];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return dir * (x - y);
  }
  function tableModel() {
    const d = state.data;
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    const tot = cur.res || 0;
    const camps = new Map(); const sets = new Map();
    for (const [id, m] of byAd) {
      if (!m.spend && !m.imp && !m.res) continue;
      m.share = tot ? m.res / tot : null;
      const a = d.ads[id];
      const sk = a.adsetId, ck = a.campaignId;
      if (!sets.has(sk)) sets.set(sk, { id: sk, name: d.adsets[sk].name, status: d.adsets[sk].status, m: blank(), children: [], lvl: 1 });
      if (!camps.has(ck)) camps.set(ck, { id: ck, name: d.campaigns[ck].name, status: d.campaigns[ck].status, m: blank(), children: new Set(), lvl: 0 });
      const s = sets.get(sk), c = camps.get(ck);
      for (const f of ['spend', 'imp', 'clk', 'lclk', 'leads', 'msgs']) { s.m[f] += m[f]; c.m[f] += m[f]; }
      s.children.push({ id, name: a.name, status: a.status, m, lvl: 2, ad: a });
      c.children.add(s);
    }
    for (const x of [...sets.values(), ...camps.values()]) { derive(x.m); x.m.share = tot ? x.m.res / tot : null; }
    for (const c of camps.values()) c.children = [...c.children];
    return { camps: [...camps.values()], sets: [...sets.values()], ads: [...sets.values()].flatMap((s) => s.children) };
  }
  function renderTable() {
    const d = state.data; const cols = COLS(); const model = tableModel();
    const v = state.tableView;
    const arrow = (k) => `<span class="arrow">${state.sort.key === k ? (state.sort.dir > 0 ? '▲' : '▼') : '↕'}</span>`;
    const nameHead = { tree: 'Campanha › Conjunto › Anúncio', campaign: 'Campanha', adset: 'Conjunto de anúncios', ad: 'Anúncio' }[v];
    let html = `<thead><tr><th data-k="name" class="${state.sort.key === 'name' ? 'sorted' : ''}">${nameHead} ${arrow('name')}</th>${cols.map((c) => `<th data-k="${c.k}" class="${state.sort.key === c.k ? 'sorted' : ''}">${esc(c.t)} ${arrow(c.k)}</th>`).join('')}</tr></thead><tbody>`;
    const cells = (m) => cols.map((c) => `<td class="num">${c.raw ? c.f(m[c.k]) : c.f(m[c.k])}</td>`).join('');
    const row = (x, opts) => {
      const o = opts || {};
      const exp = o.expandable ? `<button class="exp ${state.expanded.has(x.id) ? 'open' : ''}" data-exp="${esc(x.id)}" aria-label="Expandir"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg></button>` : (x.lvl === 2 && v === 'tree' ? '' : '');
      const thumb = x.lvl === 2 ? `<span class="mini-thumb" style="${x.ad.thumb ? `background-image:url('${esc(x.ad.thumb)}')` : ''}"></span>` : '';
      const tag = v === 'tree' ? `<span class="lvl-tag">${['Camp', 'Conj', 'Anún'][x.lvl]}</span>` : '';
      const sub = o.sub ? `<div class="crumb">${esc(o.sub)}</div>` : '';
      return `<tr class="lvl-${v === 'tree' ? x.lvl : 0} ${x.lvl === 2 ? 'ad-row' : ''}" ${x.lvl === 2 ? `data-ad="${esc(x.id)}"` : ''}>
        <td><div class="name-cell">${exp}${thumb}${tag}<div style="min-width:0"><div class="nm" title="${esc(x.name)}">${hl(x.name)}</div>${sub}</div>${statusPill(x.status)}</div></td>${cells(x.m)}</tr>`;
    };
    if (v === 'tree') {
      for (const c of model.camps.sort(sorter)) {
        html += row(c, { expandable: true });
        if (!state.expanded.has(c.id)) continue;
        for (const s of c.children.sort(sorter)) {
          html += row(s, { expandable: true });
          if (!state.expanded.has(s.id)) continue;
          for (const a of s.children.sort(sorter)) html += row(a);
        }
      }
    } else if (v === 'campaign') model.camps.sort(sorter).forEach((c) => (html += row(c)));
    else if (v === 'adset') model.sets.sort(sorter).forEach((s) => (html += row(s, { sub: d.campaigns[d.adsets[s.id].campaignId].name })));
    else model.ads.sort(sorter).forEach((a) => (html += row(a, { sub: d.campaigns[a.ad.campaignId].name + ' › ' + d.adsets[a.ad.adsetId].name })));
    const t = Object.assign({}, cur, { share: cur.res ? 1 : null });
    html += `<tr class="total"><td>Total (${model.ads.length} anúncios)</td>${cells(t)}</tr></tbody>`;
    if (!model.ads.length) html = `<tbody><tr><td class="empty" colspan="${cols.length + 1}">Nenhum dado para os filtros atuais.</td></tr></tbody>`;
    $('#table').innerHTML = html;
    $$('#table-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    $('#expand-all').classList.toggle('hidden', v !== 'tree');
    $('#expand-all').textContent = state.expanded.size ? 'Recolher tudo' : 'Expandir tudo';
  }

  // ---- Breakdowns
  const PL_PLAT = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads', whatsapp: 'WhatsApp' };
  const PL_POS = { feed: 'Feed', instagram_stories: 'Stories', facebook_stories: 'Stories', story: 'Stories', instagram_reels: 'Reels', facebook_reels: 'Reels', facebook_reels_overlay: 'Reels (overlay)', marketplace: 'Marketplace', video_feeds: 'Vídeos', instream_video: 'In-stream', search: 'Busca', instagram_explore: 'Explorar', instagram_explore_grid_home: 'Explorar (home)', instagram_profile_feed: 'Feed do perfil', right_hand_column: 'Coluna direita', an_classic: 'Native/Banner', rewarded_video: 'Vídeo premiado', messenger_inbox: 'Caixa de entrada', messenger_stories: 'Stories', profile_feed: 'Feed do perfil', notification: 'Notificações', threads_feed: 'Feed', instagram_search: 'Busca' };
  function placementLabel(k) { const [pl, pos] = k.split('|'); return `${PL_PLAT[pl] || pl} · ${PL_POS[pos] || (pos || '').replace(/_/g, ' ')}`; }
  function bdValue(m) { return state.bd === 'cpl' ? m.cpl : state.bd === 'spend' ? m.spend : m.res; }
  const bdFmt = () => (state.bd === 'res' ? F.int : F.money);
  function hbar(id, entries, labelFn, colorIdx) {
    const p = palette();
    if (!entries || !entries.length) return emptyChart(id, 'Sem dados de quebra para este período');
    const sorted = entries.filter(([, m]) => m.spend > 0 && (state.bd !== 'cpl' || m.cpl != null))
      .sort((a, b) => (state.bd === 'cpl' ? a[1].cpl - b[1].cpl : bdValue(b[1]) - bdValue(a[1]))).slice(0, 10).reverse();
    if (!sorted.length) return emptyChart(id, 'Sem resultados');
    const o = baseOpt(p); const ax = axisCommon(p);
    o.grid = { left: 4, right: 52, top: 6, bottom: 4, containLabel: true };
    o.xAxis = Object.assign({ type: 'value' }, ax, { axisLabel: { show: false } });
    o.yAxis = { type: 'category', data: sorted.map(([k]) => labelFn(k)), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: p.text2, fontSize: 11.5, width: 120, overflow: 'truncate' } };
    o.tooltip = Object.assign(o.tooltip, { trigger: 'item', formatter: (x) => { const m = sorted[x.dataIndex][1]; return `<b>${esc(x.name)}</b><br>${resLabel()}: ${F.int(m.res)}<br>Investimento: ${F.money(m.spend)}<br>${cplLabel()}: ${F.money(m.cpl)}<br>CTR: ${F.pct(m.ctr)}`; } });
    const fmt = bdFmt();
    o.series = [{ type: 'bar', data: sorted.map(([, m]) => +(bdValue(m) || 0).toFixed(2)), barMaxWidth: 16, itemStyle: { color: p.c[colorIdx], borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: p.text2, fontSize: 11, formatter: (x) => fmt(x.value) } }];
    chart(id).setOption(o, true);
  }
  function renderBreakdowns() {
    const hasBd = state.data.breakdowns && Object.keys(state.data.breakdowns).length;
    $('#bd-note').textContent = hasBd ? (state.adsets.size || state.q ? '· quebras consideram o filtro de campanha (a Meta entrega quebras no nível de campanha)' : '') : '· indisponível para CSV — sincronize pela API para ver estas quebras';
    $$('#bd-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === state.bd));
    const pl = breakdown('placement', state.since, state.until, allowed);
    hbar('placement-chart', pl && [...pl.entries()], placementLabel, 0);
    const rg = breakdown('region', state.since, state.until, allowed);
    hbar('region-chart', rg && [...rg.entries()], (k) => k.replace(/^State of /, '').replace(/ \(state\)$/, ''), 2);
    renderAgeGender();
  }
  function renderAgeGender() {
    const p = palette();
    const ag = breakdown('age_gender', state.since, state.until, allowed);
    if (!ag || !ag.size) return emptyChart('age-chart', 'Sem dados de idade/gênero');
    const ages = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
    const gens = [['female', 'Mulheres'], ['male', 'Homens']];
    if ([...ag.keys()].some((k) => k.endsWith('|unknown'))) gens.push(['unknown', 'N/I']);
    const data = []; let max = 0, min = Infinity;
    gens.forEach(([g], gi) => ages.forEach((a, ai) => {
      const m = ag.get(a + '|' + g); const v = m ? bdValue(m) : null;
      if (v != null) { max = Math.max(max, v); min = Math.min(min, v); }
      data.push([ai, gi, v == null ? '-' : +v.toFixed(2), m]);
    }));
    const o = baseOpt(p);
    o.grid = { left: 4, right: 8, top: 6, bottom: 44, containLabel: true };
    o.xAxis = { type: 'category', data: ages, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: p.text3, fontSize: 11 }, splitArea: { show: false } };
    o.yAxis = { type: 'category', data: gens.map((g) => g[1]), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: p.text2, fontSize: 11.5 } };
    const lowGood = state.bd === 'cpl';
    o.visualMap = { min: min === Infinity ? 0 : min, max: max || 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 120, textStyle: { color: p.text3, fontSize: 10.5 }, formatter: (v) => bdFmt()(v),
      inRange: { color: lowGood ? [p.good, p.surface, p.bad] : [p.surface, p.c[1], p.c[0]] } };
    o.tooltip = Object.assign(o.tooltip, { trigger: 'item', formatter: (x) => { const m = x.data.m; if (!m) return 'Sem dados'; return `<b>${gens[x.data.value[1]][1]} · ${ages[x.data.value[0]]}</b><br>${resLabel()}: ${F.int(m.res)}<br>Investimento: ${F.money(m.spend)}<br>${cplLabel()}: ${F.money(m.cpl)}`; } });
    const fmt = bdFmt();
    o.series = [{ type: 'heatmap', data: data.map((x) => ({ value: x.slice(0, 3), m: x[3] })), label: { show: true, color: p.text, fontSize: 10.5, fontWeight: 600, textBorderColor: p.surface, textBorderWidth: 2.5, formatter: (x) => (x.data.value[2] === '-' ? '' : fmt(x.data.value[2]).replace(/,00$/, '')) }, itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 } }];
    chart('age-chart').setOption(o, true);
  }

  // ---- Weekday
  function weekdayAgg() {
    const names = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const m = aggregate(state.since, state.until, allowed, (r) => D.parse(r[state.data._c.d]).getUTCDay());
    return [1, 2, 3, 4, 5, 6, 0].map((i) => Object.assign({ label: names[i], short: names[i].slice(0, 3) }, m.get(i) || derive(blank())));
  }
  function renderWeekday() {
    const p = palette(); const w = weekdayAgg();
    if (!cur.spend) return emptyChart('weekday-chart');
    const o = baseOpt(p); const ax = axisCommon(p);
    o.legend = { top: 0, right: 0, textStyle: { color: p.text2, fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 };
    o.xAxis = Object.assign({ type: 'category', data: w.map((x) => x.short) }, ax, { splitLine: { show: false } });
    o.yAxis = [{ type: 'value', axisLabel: { color: p.text3, fontSize: 11 }, splitLine: ax.splitLine }, { type: 'value', axisLabel: { color: p.text3, fontSize: 11, formatter: (v) => F.money(v) }, splitLine: { show: false } }];
    const bestIdx = w.reduce((bi, x, i) => (x.cpl != null && (w[bi].cpl == null || x.cpl < w[bi].cpl) ? i : bi), 0);
    o.series = [
      { name: resLabel(), type: 'bar', data: w.map((x, i) => ({ value: x.res, itemStyle: { color: i === bestIdx ? p.c[3] : p.c[0], borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 30 },
      { name: cplLabel(), type: 'line', yAxisIndex: 1, data: w.map((x) => (x.cpl == null ? null : +x.cpl.toFixed(2))), smooth: 0.3, symbolSize: 6, lineStyle: { color: p.c[1], width: 2.2 }, itemStyle: { color: p.c[1] } },
    ];
    o.tooltip.formatter = tipFmt([F.int, F.money]);
    chart('weekday-chart').setOption(o, true);
  }

  // ---- Funnel
  function renderFunnel() {
    const c = cur;
    const steps = [
      ['Impressões', c.imp, null],
      ['Cliques no link', c.lclk, c.imp ? c.lclk / c.imp : null, 'CTR'],
      [resLabel(), c.res, c.lclk ? c.res / c.lclk : null, 'conversão'],
    ];
    const max = c.imp || 1;
    $('#funnel').innerHTML = steps.map(([l, v, rate, rl], i) => {
      const w = i === 0 ? 100 : Math.max(6, Math.pow(v / max, 0.28) * 100);
      return `<div class="f-step"><div class="lbl">${esc(l)}</div><div class="f-bar"><i style="width:${w}%"></i><b class="num">${F.int(v)}</b></div><div class="rate">${rate == null ? '' : `<strong class="num">${F.pct(rate)}</strong>${rl}`}</div></div>`;
    }).join('') + `<div class="f-step" style="margin-top:6px"><div class="lbl">Custo</div><div class="muted" style="font-size:12.5px">${F.money(c.cpm)} por mil impressões · ${F.money(c.cpc)} por clique · <b style="color:var(--text)">${F.money(c.cpl)}</b> por ${resLabel().toLowerCase().replace(/s$/, '')}</div><div></div></div>`;
  }

  // ---- Drawer (detalhe do anúncio)
  function openAd(id) {
    const d = state.data; const a = d.ads[id]; if (!a) return;
    const single = new Set([id]);
    const m = total(state.since, state.until, single);
    $('#dr-crumb').textContent = d.campaigns[a.campaignId].name + ' › ' + d.adsets[a.adsetId].name;
    $('#dr-title').textContent = a.name;
    const img = a.image || a.thumb;
    const am = d.account.id ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(d.account.id.replace('act_', ''))}&selected_ad_ids=${encodeURIComponent(id)}` : null;
    $('#dr-body').innerHTML = `
      ${img ? `<div class="drawer-img" style="background-image:url('${esc(img)}')"></div>` : ''}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${statusPill(a.status)} ${a.format ? `<span class="status off">${esc(a.format)}</span>` : ''}
        ${am && d.source === 'live' ? `<a class="btn" style="margin-left:auto;text-decoration:none;color:var(--text)" href="${am}" target="_blank" rel="noopener">Abrir no Gerenciador ↗</a>` : ''}
        ${a.link ? `<a class="btn" style="text-decoration:none;color:var(--text)" href="${esc(a.link)}" target="_blank" rel="noopener">Ver post ↗</a>` : ''}</div>
      <div class="drawer-kpis">
        <div><span>${cplLabel()}</span><strong class="num">${cplChip(m.cpl)}</strong></div>
        <div><span>${resLabel()}</span><strong class="num">${F.int(m.res)}</strong></div>
        <div><span>Investimento</span><strong class="num">${F.money(m.spend)}</strong></div>
        <div><span>CTR</span><strong class="num">${F.pct(m.ctr)}</strong></div>
        <div><span>CPC</span><strong class="num">${F.money(m.cpc)}</strong></div>
        <div><span>Conv. clique→lead</span><strong class="num">${F.pct(m.cvr)}</strong></div>
      </div>
      <div><div class="kpi-label" style="margin-bottom:6px">Evolução diária</div><div id="dr-chart" style="height:220px"></div></div>
      ${a.title || a.body ? `<div><div class="kpi-label" style="margin-bottom:6px">Texto do anúncio</div><div class="ad-copy">${a.title ? `<b>${esc(a.title)}</b>\n` : ''}${esc(a.body || '')}</div></div>` : ''}
      <div class="muted" style="font-size:12px">ID do anúncio: ${esc(id)}</div>`;
    $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      const p = palette(); const dk = [];
      for (let k = state.since; k <= state.until; k = D.add(k, 1)) dk.push(k);
      const mm = aggregate(state.since, state.until, single, (r) => r[d._c.d]);
      const o = baseOpt(p); const ax = axisCommon(p);
      o.grid = { left: 4, right: 4, top: 24, bottom: 4, containLabel: true };
      o.legend = { top: 0, right: 0, textStyle: { color: p.text2, fontSize: 11 }, itemWidth: 10, itemHeight: 6 };
      o.xAxis = Object.assign({ type: 'category', data: dk.map((k) => D.fmt(k)) }, ax, { splitLine: { show: false } });
      o.yAxis = [{ type: 'value', axisLabel: { color: p.text3, fontSize: 10 }, splitLine: ax.splitLine }, { type: 'value', axisLabel: { color: p.text3, fontSize: 10, formatter: (v) => F.compact(v) }, splitLine: { show: false } }];
      o.series = [
        { name: resLabel(), type: 'bar', data: dk.map((k) => (mm.get(k) ? mm.get(k).res : 0)), itemStyle: { color: p.c[0], borderRadius: [3, 3, 0, 0] }, barMaxWidth: 14 },
        { name: 'Investimento', type: 'line', yAxisIndex: 1, data: dk.map((k) => (mm.get(k) ? +mm.get(k).spend.toFixed(2) : 0)), smooth: 0.3, showSymbol: false, lineStyle: { color: p.c[1], width: 2 }, itemStyle: { color: p.c[1] } },
      ];
      o.tooltip.formatter = tipFmt([F.int, F.money]);
      const c = echarts.init($('#dr-chart')); c.setOption(o);
      charts['dr-chart'] = c;
    });
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
    if (charts['dr-chart']) { charts['dr-chart'].dispose(); delete charts['dr-chart']; }
  }

  // ------------------------------------------------------------------ multi-select
  function MultiSelect(wrap, opts) {
    wrap.innerHTML = `<button class="btn" aria-haspopup="listbox" aria-expanded="false"><span class="ms-l">${opts.label}</span><span class="badge-count hidden"></span><svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="popover left ms-pop hidden"><input type="search" placeholder="Filtrar ${opts.label.toLowerCase()}…" /><div class="ms-list"></div><div class="ms-foot"><button data-a="none">Limpar</button><button data-a="close">Concluir</button></div></div>`;
    const btn = $('button', wrap), pop = $('.popover', wrap), list = $('.ms-list', pop), inp = $('input', pop), badge = $('.badge-count', wrap);
    function draw() {
      const q = norm(inp.value); const sel = opts.selected();
      const items = opts.items().filter((x) => !q || norm(x.name).includes(q));
      list.innerHTML = items.length ? items.map((x) => `<label><input type="checkbox" value="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''}/><span><div class="ms-name">${hlq(x.name, q)}</div><div class="ms-meta">${x.meta}</div></span></label>`).join('') : '<div class="empty">Nada encontrado</div>';
    }
    function hlq(t, q) { if (!q) return esc(t); const i = norm(t).indexOf(q); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); }
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = pop.classList.contains('hidden'); closePops(); if (open) { pop.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); inp.value = ''; draw(); inp.focus(); } });
    pop.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('input', draw);
    list.addEventListener('change', (e) => { const s = opts.selected(); if (e.target.checked) s.add(e.target.value); else s.delete(e.target.value); opts.onChange(); });
    $('.ms-foot', pop).addEventListener('click', (e) => { const a = e.target.dataset.a; if (a === 'none') { opts.selected().clear(); opts.onChange(); draw(); } if (a === 'close') closePops(); });
    return { refresh() { const n = opts.selected().size; badge.textContent = n; badge.classList.toggle('hidden', !n); if (!pop.classList.contains('hidden')) draw(); } };
  }
  function itemMeta(kind) {
    const d = state.data; const key = kind === 'c' ? (r, a) => a.campaignId : (r, a) => a.adsetId;
    const all = new Set(Object.keys(d.ads));
    return aggregate(state.since, state.until, all, key);
  }
  const msCampaigns = MultiSelect($('#ms-campaigns'), {
    label: 'Campanhas', selected: () => state.campaigns,
    items: () => { const m = itemMeta('c'); return Object.values(state.data.campaigns).map((c) => { const x = m.get(c.id); return { id: c.id, name: c.name, meta: `${isActive(c.status) ? '● Ativa' : '○ Inativa'} · ${x ? F.money(x.spend) + ' · ' + F.int(x.res) + ' ' + resLabel().toLowerCase() : 'sem veiculação no período'}`, s: x ? x.spend : -1 }; }).sort((a, b) => b.s - a.s); },
    onChange: () => { for (const s of [...state.adsets]) if (state.campaigns.size && !state.campaigns.has(state.data.adsets[s].campaignId)) state.adsets.delete(s); render(); },
  });
  const msAdsets = MultiSelect($('#ms-adsets'), {
    label: 'Conjuntos', selected: () => state.adsets,
    items: () => { const m = itemMeta('s'); return Object.values(state.data.adsets).filter((s) => !state.campaigns.size || state.campaigns.has(s.campaignId)).map((s) => { const x = m.get(s.id); return { id: s.id, name: s.name, meta: `${esc(state.data.campaigns[s.campaignId].name)} · ${x ? F.money(x.spend) + ' · ' + F.int(x.res) : 'sem veiculação'}`, s: x ? x.spend : -1 }; }).sort((a, b) => b.s - a.s); },
    onChange: render,
  });

  // ------------------------------------------------------------------ popovers & events
  function closePops() { $$('.popover').forEach((p) => p.classList.add('hidden')); $$('[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
  document.addEventListener('click', closePops);
  function togglePop(btn, pop) { btn.addEventListener('click', (e) => { e.stopPropagation(); const open = pop.classList.contains('hidden'); closePops(); if (open) { pop.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); } }); pop.addEventListener('click', (e) => e.stopPropagation()); }
  togglePop($('#date-btn'), $('#date-pop'));
  togglePop($('#menu-btn'), $('#menu-pop'));

  function drawPresets() {
    $('#preset-list').innerHTML = PRESETS.map(([k, l]) => `<button data-p="${k}" aria-pressed="${state.preset === k}">${l}</button>`).join('');
    $('#since').value = state.since; $('#until').value = state.until;
    if (state.data) { $('#since').min = $('#until').min = state.data.minDate; $('#range-hint').textContent = `Dados disponíveis de ${D.fmt(state.data.minDate, { year: 'numeric' })} a ${D.fmt(state.data.maxDate, { year: 'numeric' })}.`; }
  }
  $('#date-btn').addEventListener('click', drawPresets);
  $('#preset-list').addEventListener('click', (e) => { const p = e.target.dataset.p; if (!p) return; if (p === 'custom') { state.preset = 'custom'; drawPresets(); $('#since').focus(); return; } setPreset(p); closePops(); render(); });
  $('#apply-range').addEventListener('click', () => {
    let a = $('#since').value, b = $('#until').value; if (!a || !b) return;
    if (a > b) [a, b] = [b, a];
    state.preset = 'custom'; state.since = a; state.until = b; closePops(); render();
  });
  $('#compare').addEventListener('change', (e) => { state.compare = e.target.checked; store.set('compare', state.compare); render(); });
  $('#mode-seg').addEventListener('click', (e) => { const m = e.target.closest('button'); if (!m) return; state.mode = m.dataset.mode; store.set('mode', state.mode); render(); });
  $('#status-seg').addEventListener('click', (e) => { const m = e.target.closest('button'); if (!m) return; state.status = m.dataset.status; render(); });
  const segBind = (sel, key, attr, fn) => $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state[key] = b.dataset[attr]; $$(sel + ' button').forEach((x) => x.setAttribute('aria-pressed', x === b)); (fn || render)(); });
  segBind('#trend-seg', 'trend', 't', renderTrend);
  segBind('#gran-seg', 'gran', 'g', renderTrend);
  segBind('#share-seg', 'share', 's', renderShare);
  segBind('#bd-seg', 'bd', 'm', renderBreakdowns);
  segBind('#table-seg', 'tableView', 'v', renderTable);
  let qT;
  $('#q').addEventListener('input', (e) => { clearTimeout(qT); qT = setTimeout(() => { state.q = e.target.value; render(); }, 180); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'Escape') { closePops(); closeDrawer(); }
  });
  $('#chips').addEventListener('click', (e) => {
    if (e.target.id === 'clear-all') { state.campaigns.clear(); state.adsets.clear(); state.q = ''; $('#q').value = ''; return render(); }
    const b = e.target.closest('button[data-t]'); if (!b) return;
    if (b.dataset.t === 'c') state.campaigns.delete(b.dataset.id);
    if (b.dataset.t === 's') state.adsets.delete(b.dataset.id);
    if (b.dataset.t === 'q') { state.q = ''; $('#q').value = ''; }
    render();
  });
  $('#rank-sort').addEventListener('change', (e) => { state.rankSort = e.target.value; state.rankLimit = 8; renderRanking(); });
  $('#min-res').addEventListener('change', (e) => { state.minRes = Math.max(0, +e.target.value || 0); store.set('minRes', state.minRes); renderRanking(); renderInsights(); });
  $('#cpl-goal').addEventListener('change', (e) => { state.goal = +e.target.value > 0 ? +e.target.value : null; store.set('goal', state.goal); renderRanking(); renderTable(); });
  $('#rank-more').addEventListener('click', () => { state.rankLimit += 8; renderRanking(); });
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-ad]'); if (t && !e.target.closest('[data-exp]')) openAd(t.dataset.ad); });
  $('#scrim').addEventListener('click', closeDrawer);
  $('#dr-close').addEventListener('click', closeDrawer);
  $('#table').addEventListener('click', (e) => {
    const ex = e.target.closest('[data-exp]');
    if (ex) { e.stopPropagation(); const id = ex.dataset.exp; state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); renderTable(); return; }
    const th = e.target.closest('th[data-k]');
    if (th) { const k = th.dataset.k; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'name' || k === 'cpl' || k === 'cpc' || k === 'cpm' ? 1 : -1) }; renderTable(); return; }
    const tr = e.target.closest('tr.lvl-0, tr.lvl-1');
    if (tr && state.tableView === 'tree') { const b = $('[data-exp]', tr); if (b) b.click(); }
  });
  $('#expand-all').addEventListener('click', () => {
    if (state.expanded.size) state.expanded.clear();
    else { const m = tableModel(); m.camps.forEach((c) => state.expanded.add(c.id)); m.sets.forEach((s) => state.expanded.add(s.id)); }
    renderTable();
  });
  $('#theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; store.set('theme', next);
    try { localStorage.setItem('bnr.theme', next); } catch (e) { /* ok */ }
    render();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) render(); });
  $('#copy-link').addEventListener('click', async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); toast('Link copiado — quem abrir verá esta mesma visão'); } catch (e) { toast('Copie o endereço da barra do navegador'); } closePops(); });
  $('#export-csv').addEventListener('click', () => { exportCsv(); closePops(); });
  $('#csv-input').addEventListener('change', onCsvInput);
  $('#load-demo').addEventListener('click', () => { closePops(); useData(window.BNRDemo.build(), true); toast('Dados de demonstração carregados'); });
  $('#load-live').addEventListener('click', () => { closePops(); loadLive(true); });

  // drag & drop CSV
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { dragN++; $('#dropzone').classList.remove('hidden'); } });
  window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#dropzone').classList.add('hidden'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragN = 0; $('#dropzone').classList.add('hidden'); const f = e.dataTransfer.files[0]; if (f) readCsv(f); });
  function onCsvInput(e) { const f = e.target.files[0]; if (f) readCsv(f); e.target.value = ''; closePops(); }
  function readCsv(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try { const data = window.BNRCsv.toData(String(fr.result), file.name); useData(data, true); setPreset('max'); render(); toast(`CSV importado: ${data.daily.rows.length} linhas, ${Object.keys(data.ads).length} anúncios`); }
      catch (err) { toast('Erro: ' + err.message, 6000); }
    };
    fr.readAsText(file, 'utf-8');
  }

  function exportCsv() {
    const d = state.data; const m = tableModel();
    const dec = (v) => (v == null ? '' : String(+v.toFixed(4)).replace('.', ','));
    const head = ['Campanha', 'Conjunto', 'Anúncio', 'Status', 'Investimento', 'Leads', 'Conversas', resLabel(), cplLabel(), 'CTR', 'CPC', 'CPM', 'Impressões', 'Cliques no link', 'Conversão clique→lead'];
    const lines = [head.join(';')];
    for (const a of m.ads.sort(sorter)) {
      const x = a.m;
      lines.push([d.campaigns[a.ad.campaignId].name, d.adsets[a.ad.adsetId].name, a.name, a.status, dec(x.spend), x.leads, x.msgs, x.res, dec(x.cpl), dec(x.ctr), dec(x.cpc), dec(x.cpm), x.imp, x.lclk, dec(x.cvr)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a'); el.href = url; el.download = `bnr-meta-ads_${state.since}_${state.until}.csv`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms || 2600); }

  // ------------------------------------------------------------------ URL hash (visão compartilhável)
  function writeHash() {
    const p = new URLSearchParams();
    p.set('p', state.preset);
    if (state.preset === 'custom') { p.set('s', state.since); p.set('u', state.until); }
    if (state.mode !== 'leads') p.set('m', state.mode);
    if (state.campaigns.size) p.set('c', [...state.campaigns].join(','));
    if (state.adsets.size) p.set('as', [...state.adsets].join(','));
    if (state.status !== 'all') p.set('st', state.status);
    if (state.q) p.set('q', state.q);
    if (state.data && state.data.source === 'demo' && new URLSearchParams(location.search).has('demo')) p.set('demo', '1');
    history.replaceState(null, '', '#' + p.toString());
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('p')) state.preset = p.get('p');
    if (state.preset === 'custom') { state.since = p.get('s'); state.until = p.get('u'); if (!state.since || !state.until) state.preset = 'last_30'; }
    if (p.get('m')) state.mode = p.get('m');
    if (p.get('c')) state.campaigns = new Set(p.get('c').split(','));
    if (p.get('as')) state.adsets = new Set(p.get('as').split(','));
    if (p.get('st')) state.status = p.get('st');
    if (p.get('q')) { state.q = p.get('q'); $('#q').value = state.q; }
  }

  // ------------------------------------------------------------------ boot
  function useData(data, resetFilters) {
    state.data = prepare(data);
    setCurrency(data.account && data.account.currency);
    if (resetFilters) { state.campaigns.clear(); state.adsets.clear(); state.expanded.clear(); }
    for (const id of [...state.campaigns]) if (!data.campaigns[id]) state.campaigns.delete(id);
    for (const id of [...state.adsets]) if (!data.adsets[id]) state.adsets.delete(id);
    setPreset(state.preset);
    render();
  }
  async function loadLive(manual) {
    try {
      const r = await fetch('data/insights.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json(); data.source = 'live';
      useData(data, manual);
      if (manual) toast('Dados atualizados');
      return true;
    } catch (e) {
      if (manual) toast('Ainda não há dados sincronizados (data/insights.json). Veja o README.', 5000);
      return false;
    }
  }
  (async function boot() {
    readHash();
    $('#min-res').value = state.minRes;
    if (state.goal) $('#cpl-goal').value = state.goal;
    const wantDemo = new URLSearchParams(location.search).has('demo') || new URLSearchParams(location.hash.slice(1)).has('demo');
    if (wantDemo || !(await loadLive(false))) useData(window.BNRDemo.build(), false);
    // recarrega dados a cada 30 min se a aba ficar aberta
    setInterval(() => { if (state.data && state.data.source === 'live' && document.visibilityState === 'visible') loadLive(false); }, 30 * 60 * 1000);
  })();
})();
