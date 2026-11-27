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
    data: null, page: 'overview', topSort: 'cpl',
    preset: 'last_30', since: null, until: null,
    compare: store.get('compare', true),
    mode: store.get('mode', 'leads'),
    campaigns: new Set(), adsets: new Set(), status: 'all', q: '',
    gran: 'day', granAuto: true, share: 'res', bd: 'res',
    rankSort: 'cpl', rankLimit: 8, rankScope: store.get('rankScope', 'active'), goalAuto: store.get('goalAuto', true),
    minRes: store.get('minRes', 3), goal: store.get('goal', null),
    tableView: 'tree', sort: { key: 'res', dir: -1 }, expanded: new Set(),
    sales: null, attr: store.get('attr', 'last'), salesShow: 'all', salesLimit: 12,
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
    if (data.chunks && data.chunks.length) { // dados divididos por mês: o período vem do arquivo principal
      min = data.range ? data.range.since : data.chunks[0].m + '-01';
      max = data.range ? data.range.until : D.today();
      data._loaded = new Set(); data._pending = new Map();
    }
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
      // objetivo do anúncio = objetivo do conjunto (leads, conversas ou outro); sem informação, não filtra
      const sg = data.adsets[a.adsetId].goal, ob = data.campaigns[a.campaignId].objective;
      a.goal = sg || (ob === 'OUTCOME_LEADS' || ob === 'LEAD_GENERATION' ? 'leads' : ob === 'MESSAGES' ? 'msgs' : 'unknown');
    }
    for (const [id, s] of Object.entries(data.adsets)) s.id = id;
    for (const [id, c] of Object.entries(data.campaigns)) c.id = id;
    for (const b of Object.values(data.breakdowns || {})) { b._c = {}; b.cols.forEach((c, i) => (b._c[c] = i)); }
    return data;
  }
  const isActive = (s) => s === 'ACTIVE';

  // Filtro inteligente por objetivo: no modo Leads só entram anúncios que buscam lead;
  // no modo Conversas, só os de conversa. "Todos" mostra tudo, cada um pelo seu resultado.
  const goalOk = (a) => !state.goalAuto || state.mode === 'all' || a.goal === 'unknown' || a.goal === state.mode;
  const goalName = { leads: 'leads', msgs: 'conversas', other: 'outros objetivos' };
  function hiddenByGoal() {
    if (!state.goalAuto || state.mode === 'all') return 0;
    return Object.values(state.data.ads).filter((a) => a.goal !== 'unknown' && a.goal !== state.mode && (!state.campaigns.size || state.campaigns.has(a.campaignId))).length;
  }
  function allowedAds() {
    const d = state.data; const q = norm(state.q).trim();
    const set = new Set();
    for (const a of Object.values(d.ads)) {
      if (state.campaigns.size && !state.campaigns.has(a.campaignId)) continue;
      if (state.adsets.size && !state.adsets.has(a.adsetId)) continue;
      if (state.status === 'active' && !isActive(a.status)) continue;
      if (state.status === 'inactive' && isActive(a.status)) continue;
      if (!goalOk(a)) continue;
      if (q && !q.split(/\s+/).every((w) => a._s.includes(w))) continue;
      set.add(a.id);
    }
    return set;
  }
  const blank = () => ({ spend: 0, imp: 0, clk: 0, lclk: 0, leads: 0, msgs: 0, days: 0 });
  function add(m, r, C, ad) {
    m.spend += r[C.spend] || 0; m.imp += r[C.imp] || 0; m.clk += r[C.clk] || 0;
    m.lclk += r[C.lclk] || 0; m.leads += r[C.leads] || 0; m.msgs += r[C.msgs] || 0;
    // resultado "do próprio objetivo" (usado no modo Todos): lead para quem busca lead, conversa para quem busca conversa
    const g = ad && ad.goal; m.own = (m.own || 0) + (g === 'leads' ? r[C.leads] || 0 : g === 'msgs' ? r[C.msgs] || 0 : (r[C.leads] || 0) + (r[C.msgs] || 0));
  }
  function derive(m) {
    const res = state.mode === 'leads' ? m.leads : state.mode === 'msgs' ? m.msgs : (m.own != null ? m.own : m.leads + m.msgs);
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
      const ad = d.ads[r[C.ad]];
      const k = keyFn ? keyFn(r, ad) : 'all';
      let m = out.get(k); if (!m) out.set(k, (m = blank()));
      add(m, r, C, ad);
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
    else charts[id].resize();
    return charts[id];
  }
  window.addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));
  function palette() {
    return {
      c: [1, 2, 3, 4, 5, 6].map((i) => css('--chart-' + i)),
      text: css('--text'), text2: css('--text-2'), text3: css('--text-3'), grid: css('--chart-grid'), soft: css('--chart-soft'),
      surface: css('--surface'), border: css('--border'), accent: css('--accent'), good: css('--good'), bad: css('--bad'),
    };
  }
  function baseOpt(p) {
    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: p.text2 },
      tooltip: {
        trigger: 'axis', triggerOn: 'mousemove|click', confine: true, backgroundColor: p.surface, borderColor: p.border, textStyle: { color: p.text, fontSize: 12 },
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

  // ------------------------------------------------------------------ pages
  const PAGES = {
    overview: { slug: 'visao-geral', title: 'Visão geral', sub: () => `Como está a captação de ${resLabel().toLowerCase()} no período` },
    origin: { slug: 'origem', title: 'Origem dos leads', sub: () => 'De qual campanha, conjunto e anúncio vem cada resultado' },
    ads: { slug: 'anuncios', title: 'Anúncios', sub: () => 'Quais criativos trazem leads mais baratos' },
    sales: { slug: 'vendas', title: 'Vendas', sub: () => 'Do anúncio até a venda: qual criativo gerou cada contrato' },
    campaigns: { slug: 'campanhas', title: 'Campanhas', sub: () => 'Todos os números por campanha, conjunto e anúncio' },
    audience: { slug: 'publico', title: 'Público', sub: () => 'Posicionamento, idade, gênero, região e dia da semana' },
    settings: { slug: 'configuracoes', title: 'Configurações', sub: () => 'Fonte de dados e preferências' },
  };
  const pageBySlug = (slug) => Object.keys(PAGES).find((k) => PAGES[k].slug === slug) || 'overview';
  const pageFromHash = () => pageBySlug(location.hash.replace(/^#\/?/, '').split('?')[0]);

  // ------------------------------------------------------------------ render
  let allowed = new Set();
  let cur = null, prev = null;
  // ---- Carregamento sob demanda: só os meses do período visto (e do período anterior, se comparando)
  function missingChunks() {
    const d = state.data; if (!d || !d.chunks) return [];
    const [ps] = prevRange(); const from = (state.compare ? ps : state.since).slice(0, 7), to = state.until.slice(0, 7);
    return d.chunks.filter((c) => c.m >= from && c.m <= to && !d._loaded.has(c.m));
  }
  function loadChunk(c) {
    const d = state.data;
    if (d._pending.has(c.m)) return d._pending.get(c.m);
    const p = fetch('data/' + c.f).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((x) => {
      if (state.data !== d) return; // dados trocados no meio do caminho
      d.daily.rows.push(...x.daily);
      for (const [k, rows] of Object.entries(x.breakdowns || {})) if (d.breakdowns[k]) d.breakdowns[k].rows.push(...rows);
      d._loaded.add(c.m);
    }).finally(() => d._pending.delete(c.m));
    d._pending.set(c.m, p); return p;
  }
  let loadingT = null;
  function ensureChunks() {
    const miss = missingChunks(); if (!miss.length) return true;
    clearTimeout(loadingT); loadingT = setTimeout(() => { document.body.classList.add('is-loading'); toast(`Carregando ${miss.length === 1 ? '1 mês' : miss.length + ' meses'} de dados…`, 60000); }, 250);
    Promise.all(miss.map(loadChunk)).then(() => { clearTimeout(loadingT); document.body.classList.remove('is-loading'); $('#toast').classList.remove('show'); render(); })
      .catch(() => { clearTimeout(loadingT); document.body.classList.remove('is-loading'); toast('Não foi possível carregar parte dos dados. Tente de novo.', 5000); });
    return false;
  }
  function render() {
    if (!state.data) return;
    if (!ensureChunks()) { renderShell(); return; }
    allowed = allowedAds();
    cur = total(state.since, state.until, allowed);
    const [ps, pu] = prevRange();
    prev = state.compare ? total(ps, pu, allowed) : null;
    renderShell(); renderChips();
    const pg = state.page;
    if (pg === 'overview') { renderKPIs(); renderTrend(); renderSpend(); renderInsights(); renderTopAds(); }
    if (pg === 'origin') { renderSankey(); renderShare(); renderFunnel(); }
    if (pg === 'ads') renderRanking();
    if (pg === 'campaigns') renderTable();
    if (pg === 'audience') { renderBreakdowns(); renderWeekday(); renderSegmentation(); }
    if (pg === 'sales') renderSales();
    requestAnimationFrame(() => Object.values(charts).forEach((c) => { if (!c.isDisposed() && c.getDom().offsetParent) c.resize(); }));
    writeHash();
  }

  function renderShell() {
    const d = state.data; const pg = PAGES[state.page];
    $$('.view').forEach((v) => (v.hidden = v.dataset.view !== state.page));
    $$('#nav a').forEach((a) => { const on = a.dataset.page === state.page; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#page-title').textContent = pg.title;
    $('#page-sub').textContent = pg.sub();
    $('.page-actions').classList.toggle('hidden', state.page === 'settings');
    document.title = `${pg.title} · BNR Meta Ads`;
    $('#date-label').textContent = state.preset === 'custom' ? `${D.fmt(state.since)} – ${D.fmt(state.until, { year: 'numeric' })}` : PRESETS.find((x) => x[0] === state.preset)[1];
    const gen = new Date(d.generatedAt);
    const ago = Math.round((Date.now() - gen) / 60000);
    const agoTxt = ago < 1 ? 'agora' : ago < 60 ? `há ${ago} min` : ago < 1440 ? `há ${Math.round(ago / 60)} h` : 'em ' + gen.toLocaleDateString('pt-BR');
    const live = d.source === 'live';
    $('#account-name').textContent = d.account.name;
    $('#account-sub').textContent = live ? 'Atualizado ' + agoTxt : d.source === 'csv' ? 'CSV importado' : 'Modo demonstração';
    $('.avatar').textContent = String(d.account.name || 'B').trim().charAt(0).toUpperCase();
    $('#side-status').innerHTML = live
      ? `<b><span class="pulse"></span>Conectado à Meta</b>Atualizado ${agoTxt}. Sincroniza a cada 3 h.`
      : `<b><span class="pulse demo"></span>${d.source === 'csv' ? 'CSV importado' : 'Modo demonstração'}</b>${d.source === 'csv' ? esc(d.fileName || '') : 'Números fictícios até a conta ser conectada.'}<br><a href="#/configuracoes">Conectar dados</a>`;
    $('#src-desc').textContent = live ? `Conectado à conta ${d.account.id}. Última atualização ${agoTxt}.` : d.source === 'csv' ? `Usando o arquivo ${d.fileName || 'CSV'}.${d.warning ? ' ' + d.warning : ''}` : 'Mostrando dados de demonstração. Siga o README para conectar a conta (grátis).';
    $$('#mode-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    $$('#status-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.status === state.status));
    $('#compare').checked = state.compare;
    $('#foot').innerHTML = `<span>${esc(d.account.name)}${d.account.id ? ' · ' + esc(d.account.id) : ''} · ${Object.keys(d.campaigns).length} campanhas · ${Object.keys(d.ads).length} anúncios</span><span>Dados da Meta Marketing API · mesma atribuição do Gerenciador</span>`;
  }

  function renderChips() {
    const d = state.data; const chips = [];
    for (const id of state.campaigns) chips.push(['c', id, 'Campanha: ' + d.campaigns[id].name]);
    for (const id of state.adsets) chips.push(['s', id, 'Conjunto: ' + d.adsets[id].name]);
    if (state.q) chips.push(['q', '', 'Busca: “' + state.q + '”']);
    if (state.status !== 'all') chips.push(['st', '', state.status === 'active' ? 'Só ativos' : 'Só pausados']);
    const hid = hiddenByGoal();
    if (hid) chips.push(['g', '', `Só anúncios de ${goalName[state.mode]} · ${hid} de outros objetivos ocultos`]);
    else if (!state.goalAuto && state.mode !== 'all') chips.push(['g', '', 'Todos os objetivos (filtro inteligente desligado)']);
    $('#chips').innerHTML = chips.map(([t, id, l]) => `<span class="chip" title="${esc(l)}"><span>${esc(l)}</span><button data-t="${t}" data-id="${esc(id)}" aria-label="Remover filtro">✕</button></span>`).join('') +
      (chips.length > 1 ? '<button class="linkbtn" id="clear-all">Limpar filtros</button>' : '');
    msCampaigns.refresh(); msAdsets.refresh();
  }

  // ---- ícones
  const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    users: sv('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.6a3.2 3.2 0 0 1 0 6.2M21 20c0-2.7-1.6-5-4-5.8"/>'),
    wallet: sv('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>'),
    tag: sv('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/>'),
    target: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>'),
    star: sv('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
    fire: sv('<path d="M12 22c4 0 7-2.7 7-6.8 0-4.4-4-7-5-11.2-2.4 2-3.6 4.4-3.4 7.1C9.4 10.3 8.6 9 8.4 7.4 6.3 9.4 5 12 5 15.2 5 19.3 8 22 12 22z"/>'),
    up: sv('<path d="M7 17 17 7M8 7h9v9"/>'),
    down: sv('<path d="M7 7l10 10M17 8v9H8"/>'),
    alert: sv('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>'),
    pin: sv('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    phone: sv('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
    cal: sv('<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    layers: sv('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  };

  // ---- KPIs
  function delta(curV, prevV, inverse, neutral) {
    if (!state.compare || prevV == null || curV == null || !isFinite(prevV)) return '';
    if (prevV === 0) return curV === 0 ? '' : '<span class="delta flat">novo</span>';
    const ch = (curV - prevV) / prevV;
    if (Math.abs(ch) < 0.005) return '<span class="delta flat">0%</span>';
    const cls = neutral ? 'info' : (inverse ? ch < 0 : ch > 0) ? 'up' : 'down';
    return `<span class="delta ${cls}">${ch > 0 ? '↑' : '↓'} ${nf.int.format(Math.abs(ch * 100))}%</span>`;
  }
  function moneyParts(v) {
    if (v == null || !isFinite(v)) return '—';
    const t = moneyFmt.format(v); const i = t.lastIndexOf(',');
    return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<span class="cents">${esc(t.slice(i))}</span>`;
  }
  const singular = () => resLabel().toLowerCase().replace(/s$/, '');
  function renderKPIs() {
    const c = cur, pr = prev || {};
    const items = [
      { k: 'res', l: resLabel(), v: F.int(c.res), ico: ICON.users, hero: true, sub: 'no período' },
      { k: 'cpl', l: cplLabel(), v: moneyParts(c.cpl), ico: ICON.tag, inv: true, sub: 'custo médio por ' + singular() },
      { k: 'ctr', l: 'CTR (link)', v: F.pct(c.ctr), ico: ICON.up, sub: 'cliques no link ÷ impressões' },
      { k: 'cvr', l: 'Taxa de conversão', v: F.pct(c.cvr), ico: ICON.target, sub: 'de clique para ' + singular() },
    ];
    $('#kpis').innerHTML = items.map((it) => {
      const dl = delta(c[it.k], pr[it.k], it.inv, it.neutral);
      return `<div class="kpi ${it.hero ? 'hero' : ''}">
        <div class="kpi-top"><span class="kpi-label">${esc(it.l)}</span><span class="kpi-ico">${it.ico}</span></div>
        <div class="kpi-value num">${it.v}</div>
        <div class="kpi-foot">${dl}<span>${dl ? 'vs. período anterior' : esc(it.sub)}</span></div></div>`;
    }).join('');
  }

  // ---- Leads por dia (barras arredondadas)
  function bucketKey(day) { return state.gran === 'week' ? D.weekStart(day) : state.gran === 'month' ? D.monthStart(day) : day; }
  function buckets(since, until) {
    const out = []; let d = since; const seen = new Set();
    while (d <= until) { const k = bucketKey(d); if (!seen.has(k)) { seen.add(k); out.push(k); } d = D.add(d, 1); }
    return out;
  }
  function alpha(hex, a) { const h = hex.replace('#', ''); if (h.length !== 6) return hex; return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; }
  function renderTrend() {
    const p = palette();
    if (state.granAuto) { const n = D.diff(state.since, state.until) + 1; state.gran = n > 120 ? 'month' : n > 21 ? 'week' : 'day'; }
    $('#trend-title').textContent = `${resLabel()} por ${({ day: 'dia', week: 'semana', month: 'mês' })[state.gran]}`;
    $$('#gran-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.g === state.gran));
    const keys = buckets(state.since, state.until);
    const m = aggregate(state.since, state.until, allowed, (r) => bucketKey(r[state.data._c.d]));
    const vals = keys.map((k) => (m.get(k) ? m.get(k).res : 0));
    if (!vals.some(Boolean)) return emptyChart('trend-chart', `Nenhum ${singular()} no período`);
    const maxV = Math.max(...vals); const maxI = vals.indexOf(maxV);
    const labels = keys.map((k) => (state.gran === 'month' ? D.fmt(k, { day: undefined, month: 'short' }) : D.fmt(k)));
    const o = baseOpt(p);
    o.grid = { left: 4, right: 8, top: 34, bottom: 4, containLabel: true };
    o.xAxis = { type: 'category', data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.text3, fontSize: 11, hideOverlap: true } };
    o.yAxis = { type: 'value', axisLabel: { color: p.text3, fontSize: 11 }, splitLine: { lineStyle: { color: p.grid, type: 'dashed' } } };
    o.series = [{
      name: resLabel(), type: 'bar', barMaxWidth: 36, barCategoryGap: keys.length > 40 ? '22%' : '32%',
      data: vals.map((v, i) => ({ value: v, itemStyle: { color: i === maxI ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: p.c[0] }, { offset: 1, color: alpha(p.c[0], 0.85) }]) : p.soft, borderRadius: 99 } })),
      emphasis: { itemStyle: { color: p.c[0] } },
      markPoint: { symbol: 'roundRect', symbolSize: [Math.max(32, String(maxV).length * 9 + 16), 24], symbolOffset: [0, -20], data: [{ coord: [maxI, maxV], value: maxV }], label: { color: '#fff', fontWeight: 600, fontSize: 11.5 }, itemStyle: { color: p.c[0] } },
    }];
    o.tooltip.axisPointer = { type: 'shadow', shadowStyle: { color: alpha(p.c[0], 0.06) } };
    o.tooltip.formatter = (ps) => {
      const i = ps[0].dataIndex; const x = m.get(keys[i]);
      const head = state.gran === 'week' ? 'Semana de ' + labels[i] : labels[i];
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${resLabel()}: <b>${F.int(x ? x.res : 0)}</b><br>${cplLabel()}: <b>${F.money(x && x.cpl)}</b><br>Investimento: ${F.money(x ? x.spend : 0)}`;
    };
    chart('trend-chart').setOption(o, true);
  }

  // ---- Investimento (número grande + área)
  function renderSpend() {
    const p = palette();
    $('#spend-value').innerHTML = `<strong class="num">${moneyParts(cur.spend)}</strong>${delta(cur.spend, prev && prev.spend, false, true)}`;
    const keys = []; for (let k = state.since; k <= state.until; k = D.add(k, 1)) keys.push(k);
    const m = aggregate(state.since, state.until, allowed, (r) => r[state.data._c.d]);
    const vals = keys.map((k) => (m.get(k) ? +m.get(k).spend.toFixed(2) : 0));
    if (!vals.some(Boolean)) return emptyChart('spend-chart', 'Sem investimento');
    const maxV = Math.max(...vals); const maxI = vals.indexOf(maxV);
    const o = baseOpt(p);
    o.grid = { left: 2, right: 2, top: 30, bottom: 22 };
    o.xAxis = { type: 'category', data: keys.map((k) => D.fmt(k)), boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.text3, fontSize: 10.5, interval: Math.max(0, Math.ceil(keys.length / 3) - 1), hideOverlap: true, alignMinLabel: 'left', alignMaxLabel: 'right' } };
    o.yAxis = { type: 'value', show: false, min: (v) => v.min * 0.5 };
    o.series = [{
      type: 'line', smooth: 0.5, showSymbol: false, data: vals, name: 'Investimento',
      lineStyle: { width: 2.5, color: p.c[0] },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: alpha(p.c[0], 0.32) }, { offset: 1, color: alpha(p.c[0], 0.02) }]) },
      markPoint: maxI < 3 || maxI > vals.length - 4 ? undefined : { symbol: 'roundRect', symbolSize: [74, 22], symbolOffset: [0, -18], data: [{ coord: [maxI, maxV], value: maxV }], label: { color: '#fff', fontSize: 11, fontWeight: 600, formatter: (x) => 'R$ ' + F.compact(x.value) }, itemStyle: { color: p.c[0] } },
    }];
    o.tooltip.formatter = (ps) => `<b>${ps[0].axisValue}</b><br>Investimento: <b>${F.money(ps[0].value)}</b>`;
    chart('spend-chart').setOption(o, true);
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
  const cplChip = (v) => `<span class="pill ${cplClass(v)}">${F.money(v)}</span>`;
  const statusPill = (s) => `<span class="pill ${isActive(s) ? 'solid' : 'muted'}">${isActive(s) ? 'Ativo' : ({ PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado', ARCHIVED: 'Arquivado', DELETED: 'Excluído', DISAPPROVED: 'Reprovado', WITH_ISSUES: 'Com problemas', IN_PROCESS: 'Em análise', PENDING_REVIEW: 'Em análise' }[s] || 'Inativo')}</span>`;

  // ---- Insights → Atenção / Oportunidades
  function renderInsights() {
    const d = state.data; const out = [];
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    const byCamp = aggregate(state.since, state.until, allowed, (r, a) => a.campaignId);
    const avg = cur.cpl;
    const ads = [...byAd.entries()].map(([id, m]) => Object.assign({ id }, m));
    const minR = Math.max(1, state.minRes);
    const qualified = ads.filter((a) => a.res >= minR).sort((a, b) => a.cpl - b.cpl);
    // [tipo, ícone, título, texto, adId]
    if (qualified.length) {
      const b = qualified[0];
      out.push(['good', 'star', d.ads[b.id].name, `Melhor ${cplLabel()}: ${F.money(b.cpl)} · ${F.int(b.res)} ${resLabel().toLowerCase()}`, b.id]);
    }
    const thresh = Math.max((avg || 0) * 1.5, 50);
    ads.filter((a) => a.res === 0 && a.spend >= thresh && d.ads[a.id].goal !== 'other').sort((a, b) => b.spend - a.spend).slice(0, 2)
      .forEach((a) => out.push(['bad', 'fire', d.ads[a.id].name, `${F.money(a.spend)} gastos sem nenhum ${singular()}`, a.id]));
    if (qualified.length > 2 && avg) {
      const w = qualified[qualified.length - 1];
      if (w.cpl > avg * 1.6) out.push(['warn', 'alert', d.ads[w.id].name, `${cplLabel()} ${F.money(w.cpl)} · ${(w.cpl / avg).toFixed(1).replace('.', ',')}× a média`, w.id]);
    }
    if (state.compare) {
      const [ps, pu] = prevRange();
      const prevCamp = aggregate(ps, pu, allowed, (r, a) => a.campaignId);
      for (const [id, m] of byCamp) {
        const p0 = prevCamp.get(id);
        if (!p0 || !p0.cpl || !m.cpl || m.res < minR || p0.res < minR) continue;
        const ch = (m.cpl - p0.cpl) / p0.cpl;
        if (ch > 0.25) out.push(['warn', 'up', d.campaigns[id].name, `${cplLabel()} subiu ${Math.round(ch * 100)}% → ${F.money(m.cpl)}`]);
        else if (ch < -0.2) out.push(['good', 'down', d.campaigns[id].name, `${cplLabel()} caiu ${Math.round(-ch * 100)}% → ${F.money(m.cpl)}`]);
      }
    }
    if (cur.res > 5) {
      const camps = [...byCamp.entries()].filter(([, m]) => m.spend > 0).sort((a, b) => b[1].res - a[1].res);
      if (camps.length > 1) {
        const [cid, cm] = camps[0];
        out.push(['info', 'layers', d.campaigns[cid].name, `${Math.round((cm.res / cur.res) * 100)}% dos ${resLabel().toLowerCase()} com ${Math.round((cm.spend / cur.spend) * 100)}% da verba`]);
      }
      const top = ads.slice().sort((a, b) => b.res - a.res)[0];
      if (top && top.res / cur.res > 0.4 && ads.length > 3) out.push(['warn', 'alert', d.ads[top.id].name, `Concentra ${Math.round((top.res / cur.res) * 100)}% dos ${resLabel().toLowerCase()} — teste variações`, top.id]);
    }
    const pl = breakdown('placement', state.since, state.until, allowed);
    if (pl) {
      const best = [...pl.entries()].filter(([, m]) => m.res >= minR).sort((a, b) => a[1].cpl - b[1].cpl)[0];
      if (best) out.push(['info', 'phone', placementLabel(best[0]), `Posicionamento mais barato: ${F.money(best[1].cpl)}`]);
    }
    const wd = weekdayAgg();
    const bestW = wd.filter((x) => x.res >= minR).sort((a, b) => a.cpl - b.cpl)[0];
    if (bestW && D.diff(state.since, state.until) >= 13) out.push(['info', 'cal', bestW.label, `Melhor dia da semana: ${cplLabel()} ${F.money(bestW.cpl)}`]);

    const row = ([t, ico, title, text, adId]) => {
      const tag = adId ? 'button' : 'div';
      return `<${tag} class="row-item" ${adId ? `data-ad="${esc(adId)}"` : ''} title="${esc(title + ' — ' + text)}"><span class="row-ico t-${t}">${ICON[ico]}</span><span style="min-width:0"><b>${esc(title)}</b><small class="t-${t}">${esc(text)}</small></span><span class="chev">${adId ? '›' : ''}</span></${tag}>`;
    };
    const rank = { bad: 0, warn: 1, good: 0, info: 1 };
    const alerts = out.filter((x) => x[0] === 'bad' || x[0] === 'warn').sort((a, b) => rank[a[0]] - rank[b[0]]).slice(0, 2);
    const opps = out.filter((x) => x[0] === 'good' || x[0] === 'info').sort((a, b) => rank[a[0]] - rank[b[0]]).slice(0, 2);
    $('#alerts').innerHTML = !cur.spend ? '<div class="row-empty">Sem investimento no período.</div>' : alerts.length ? alerts.map(row).join('') : '<div class="row-empty">Nada fora do normal neste período.</div>';
    $('#opps').innerHTML = opps.length ? opps.map(row).join('') : '<div class="row-empty">Ainda sem volume para apontar oportunidades.</div>';
  }

  // ---- Melhores anúncios (lista)
  function renderTopAds() {
    const d = state.data;
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    let ads = [...byAd.entries()].filter(([, m]) => m.spend > 0).map(([id, m]) => Object.assign({ id }, m));
    const minR = Math.max(1, state.minRes);
    if (state.topSort === 'cpl') ads = ads.filter((a) => a.res >= minR).sort((a, b) => a.cpl - b.cpl);
    else if (state.topSort === 'res') ads.sort((a, b) => b.res - a.res || a.spend - b.spend);
    else ads.sort((a, b) => b.spend - a.spend);
    $('#top-sub').textContent = state.topSort === 'cpl' ? `Menor ${cplLabel()} entre anúncios com ${minR}+ ${resLabel().toLowerCase()}` : state.topSort === 'res' ? `Anúncios que mais trouxeram ${resLabel().toLowerCase()}` : 'Para onde a verba está indo';
    const list = ads.slice(0, 5);
    if (!list.length) { $('#top-ads').innerHTML = `<div class="empty">Nenhum anúncio com ${minR}+ ${resLabel().toLowerCase()} no período.</div>`; return; }
    $('#top-ads').innerHTML = list.map((a) => {
      const ad = d.ads[a.id]; const img = ad.thumb || ad.image;
      return `<div class="list-row" data-ad="${esc(a.id)}" role="button" tabindex="0" aria-label="Ver detalhes de ${esc(ad.name)}">
        <div class="lr-main"><span class="lr-thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span><div style="min-width:0"><div class="lr-name">${hl(ad.name)}</div><div class="lr-sub">${esc(d.campaigns[ad.campaignId].name)} › ${esc(d.adsets[ad.adsetId].name)}</div></div></div>
        <div class="lr-stat keep"><small>${cplLabel()}</small>${cplChip(a.cpl)}</div>
        <div class="lr-stat"><small>${resLabel()}</small><b class="num">${F.int(a.res)}</b></div>
        <div class="lr-stat"><small>Investimento</small><b class="num">${F.money(a.spend)}</b></div>
        <div class="lr-stat opt"><small>CTR</small><b class="num">${F.pct(a.ctr)}</b></div>
        <div class="lr-end">${statusPill(ad.status)}<span class="pill outline">Detalhes</span></div>
      </div>`;
    }).join('');
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
      type: 'sankey', left: 4, right: narrow ? 120 : 240, top: 8, bottom: 8, nodeGap: 10, nodeWidth: 12, draggable: false,
      emphasis: { focus: 'adjacency' }, nodeAlign: 'left', layoutIterations: 64,
      data: [...nodes.values()], links: [...links.entries()].map(([k, v]) => { const [s, t] = k.split('>'); return { source: s, target: t, value: v }; }),
      lineStyle: { color: 'gradient', opacity: 0.28, curveness: 0.5 },
      label: { color: p.text, fontSize: 11.5, formatter: (x) => trunc(label[x.name], narrow ? 18 : (nodes.get(x.name).depth === 2 ? 30 : 40)) + '  ' + F.int(meta[x.name].res) },
    }];
    chart('sankey-chart').setOption(o, true);
    chart('sankey-chart').off('click');
    chart('sankey-chart').on('click', (x) => {
      if (x.dataType !== 'node') return;
      const [t, id] = x.name.split(':');
      // Clicar mostra os números (tooltip); não troca o filtro. Anúncio abre os detalhes.
      if (t === 'a') openAd(id);
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
    const tot = f === 'res' ? cur.res : cur.spend; const vert = document.getElementById('share-chart').clientWidth > 460;
    const byName = new Map(rows.map(([id, m]) => [state.data.campaigns[id].name, m]));
    o.legend = { type: 'scroll', orient: vert ? 'vertical' : 'horizontal', right: vert ? 0 : undefined, left: vert ? undefined : 0, top: vert ? 'middle' : undefined, bottom: vert ? undefined : 0, width: vert ? '46%' : undefined, itemGap: 14, textStyle: { color: p.text2, fontSize: 12, rich: { pct: { color: p.text, fontWeight: 600, fontSize: 12 } } }, icon: 'circle', itemWidth: 9,
      formatter: (n) => { const m = byName.get(n); const v = m ? (f === 'res' ? m.res : m.spend) : 0; const nm = n.length > 26 ? n.slice(0, 25) + '…' : n; return `${nm}  {pct|${tot ? Math.round((v / tot) * 100) : 0}%}`; } };
    o.series = [{
      type: 'pie', radius: ['46%', '70%'], center: [document.getElementById('share-chart').clientWidth > 460 ? '27%' : '50%', document.getElementById('share-chart').clientWidth > 460 ? '50%' : '44%'], padAngle: 2, itemStyle: { borderRadius: 6, borderColor: p.surface, borderWidth: 2 },
      label: { show: true, position: 'center', formatter: () => `{v|${f === 'res' ? F.int(cur.res) : F.compact(cur.spend)}}\n{l|${f === 'res' ? resLabel().toLowerCase() : 'investidos'}}`, rich: { v: { fontSize: 24, fontWeight: 700, color: p.text, lineHeight: 30 }, l: { fontSize: 12, color: p.text3 } } },
      emphasis: { scale: true, scaleSize: 6 }, labelLine: { show: false },
      data: rows.map(([id, m], i) => ({ id, name: d.campaigns[id].name, value: f === 'res' ? m.res : +m.spend.toFixed(2), itemStyle: { color: p.c[i % p.c.length] } })),
    }];
    chart('share-chart').setOption(o, true);
    chart('share-chart').off('click');
    chart('share-chart').off('click'); // clicar só mostra os números da fatia
  }

  // ---- Ranking
  function renderRanking() {
    const d = state.data;
    const byAd = aggregate(state.since, state.until, allowed, (r) => r[d._c.ad]);
    // "Ativos": todo anúncio ativo entra, mesmo sem lead ou sem gasto no período.
    // "Todos": qualquer anúncio que veiculou no período, ativo ou não.
    const scope = state.rankScope;
    const ids = new Set(scope === 'active' ? [...allowed].filter((id) => isActive(d.ads[id].status)) : [...byAd.keys()].filter((id) => byAd.get(id).spend > 0));
    let ads = [...ids].map((id) => Object.assign({ id }, byAd.get(id) || derive(blank())));
    const minR = Math.max(1, state.minRes);
    const s = state.rankSort;
    const by = (f) => (a, b) => f(a, b) || b.spend - a.spend;
    const ok = (a) => a.res >= minR;
    if (s === 'cpl') ads.sort(by((a, b) => (ok(b) - ok(a)) || (ok(a) ? a.cpl - b.cpl : b.res - a.res)));
    else if (s === 'worst') ads.sort(by((a, b) => (b.cpl ?? (b.spend ? b.spend * 1e6 : -1)) - (a.cpl ?? (a.spend ? a.spend * 1e6 : -1))));
    else if (s === 'res') ads.sort(by((a, b) => b.res - a.res));
    else if (s === 'spend') ads.sort(by((a, b) => 0));
    else if (s === 'ctr') ads.sort(by((a, b) => ((b.imp >= 1000) - (a.imp >= 1000)) || (b.ctr || 0) - (a.ctr || 0)));
    const ranked = s === 'cpl' ? ads.filter(ok).length : ads.length;
    const what = scope === 'active' ? `${ads.length} anúncios ativos` : `${ads.length} anúncios com veiculação no período`;
    $('#rank-sub').textContent = s === 'cpl'
      ? `${what} · ${ranked} com pelo menos ${minR} ${resLabel().toLowerCase()} entram no ranking de ${cplLabel()} · média da conta ${F.money(cur.cpl)}`
      : what;
    const list = ads.slice(0, state.rankLimit);
    $('#rank-more').classList.toggle('hidden', ads.length <= state.rankLimit);
    if (!list.length) { $('#ranking').innerHTML = `<div class="empty" style="grid-column:1/-1">${scope === 'active' ? 'Nenhum anúncio ativo com os filtros atuais.' : 'Nenhum anúncio veiculou no período.'}</div>`; return; }
    $('#ranking').innerHTML = list.map((a, i) => {
      const ad = d.ads[a.id];
      const img = ad.thumb || ad.image;
      return `<button class="ad-card" data-ad="${esc(a.id)}">
        <div class="ad-thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}">
          <span class="ad-rank ${i === 0 && (s === 'cpl' || s === 'res') && a.res > 0 ? 'gold' : ''}">${s === 'cpl' && !ok(a) ? (a.spend ? 'Poucos ' + esc(resLabel().toLowerCase()) : 'Sem gasto') : '#' + (i + 1)}</span>
          <span class="ad-status">${statusPill(ad.status)}</span>
        </div>
        <div class="ad-info">
          <div class="ad-name" title="${esc(ad.name)}">${hl(ad.name)}</div>
          <div class="crumb" title="${esc(d.campaigns[ad.campaignId].name + ' › ' + d.adsets[ad.adsetId].name)}">${ad.goal === 'msgs' ? '<span class="goal-tag">Conversas</span>' : ad.goal === 'other' ? '<span class="goal-tag">Alcance/vídeo</span>' : ''}${esc(d.campaigns[ad.campaignId].name)} › ${esc(d.adsets[ad.adsetId].name)}</div>
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
    const ariaSort = (k) => (state.sort.key === k ? ` aria-sort="${state.sort.dir > 0 ? 'ascending' : 'descending'}"` : '');
    let html = `<thead><tr><th data-k="name" tabindex="0" class="${state.sort.key === 'name' ? 'sorted' : ''}"${ariaSort('name')}>${nameHead} ${arrow('name')}</th>${cols.map((c) => `<th data-k="${c.k}" tabindex="0" class="${state.sort.key === c.k ? 'sorted' : ''}"${ariaSort(c.k)}>${esc(c.t)} ${arrow(c.k)}</th>`).join('')}</tr></thead><tbody>`;
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
    o.yAxis = { type: 'category', data: sorted.map(([k]) => labelFn(k)), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: p.text2, fontSize: 11.5, width: 150, overflow: 'truncate' } };
    o.tooltip = Object.assign(o.tooltip, { trigger: 'item', formatter: (x) => { const m = sorted[x.dataIndex][1]; return `<b>${esc(x.name)}</b><br>${resLabel()}: ${F.int(m.res)}<br>Investimento: ${F.money(m.spend)}<br>${cplLabel()}: ${F.money(m.cpl)}<br>CTR: ${F.pct(m.ctr)}`; } });
    const fmt = bdFmt();
    o.series = [{ type: 'bar', data: sorted.map(([, m]) => +(bdValue(m) || 0).toFixed(2)), barMaxWidth: 14, itemStyle: { color: p.c[0], borderRadius: 99 }, label: { show: true, position: 'right', color: p.text2, fontSize: 11, formatter: (x) => fmt(x.value) } }];
    chart(id).setOption(o, true);
  }
  function renderBreakdowns() {
    const hasBd = state.data.breakdowns && Object.keys(state.data.breakdowns).length;
    $('#bd-note').textContent = hasBd ? (state.adsets.size || state.q ? '· quebras consideram o filtro de campanha (a Meta entrega quebras no nível de campanha)' : '') : '· indisponível para CSV — sincronize pela API para ver estas quebras';
    $$('#bd-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === state.bd));
    const pl = breakdown('placement', state.since, state.until, allowed);
    hbar('placement-chart', pl && [...pl.entries()], placementLabel, 0);
    // Cidades vêm da segmentação de cada conjunto (a Meta não quebra resultados por cidade).
    // Conjuntos com mais de uma cidade aparecem como um grupo, porque a divisão entre elas não existe nos dados.
    const hasGeo = Object.values(state.data.adsets).some((s) => s.geo && s.geo.length);
    if (hasGeo) {
      const byCity = aggregate(state.since, state.until, allowed, (r, a) => { const s = state.data.adsets[a.adsetId]; return s && s.geo && s.geo.length ? s.geo.join(' + ') : 'Sem cidade definida'; });
      $('#region-title').textContent = 'Cidades';
      $('#region-sub').textContent = 'Cidades segmentadas nos conjuntos · conjuntos com várias cidades aparecem juntos';
      hbar('region-chart', [...byCity.entries()], (k) => k, 2);
    } else {
      const rg = breakdown('region', state.since, state.until, allowed);
      $('#region-title').textContent = 'Regiões';
      $('#region-sub').textContent = 'Estados com mais resultado';
      hbar('region-chart', rg && [...rg.entries()], (k) => k.replace(/^State of /, '').replace(/ \(state\)$/, ''), 2);
    }
    renderAgeGender();
  }
  // Segmentação configurada em cada conjunto (vem da API; CSV e demonstração não trazem).
  function renderSegmentation() {
    const d = state.data; const card = $('#seg-card');
    const has = Object.values(d.adsets).some((s) => s.aud || s.geo);
    card.hidden = !has; if (!has) return;
    const bySet = aggregate(state.since, state.until, allowed, (r, a) => a.adsetId);
    const rows = [...bySet.entries()].filter(([, m]) => m.spend > 0).sort((a, b) => b[1].spend - a[1].spend);
    const tags = (arr, cls) => (arr || []).map((t) => `<span class="tag${cls ? ' ' + cls : ''}">${esc(t)}</span>`).join('');
    const age = (a) => {
      if (!a || !a.age) return '—';
      const ctl = `${a.age[0]}–${a.age[1] >= 65 ? '65+' : a.age[1]}`;
      return a.adv && a.ageSug ? `<span class="tag adv" title="Sugestão de idade para o Advantage+">${a.ageSug[0]}–${a.ageSug[1] >= 65 ? '65+' : a.ageSug[1]} sugerido</span><span class="sub">limite ${ctl}</span>` : ctl;
    };
    const head = `<thead><tr><th>Conjunto</th><th class="txt">Cidades</th><th class="txt">Idade</th><th class="txt">Gênero</th><th class="txt">Interesses e públicos</th><th>Investimento</th><th>${esc(resLabel())}</th><th>${esc(cplLabel())}</th></tr></thead>`;
    const body = rows.map(([id, m]) => {
      const s = d.adsets[id] || {}; const a = s.aud || {}; const c = d.campaigns[s.campaignId] || {};
      const who = tags(a.adv ? ['Advantage+'] : [], 'adv') + tags(a.interests) + tags(a.behaviors) + tags(a.audiences) + tags(a.excluded, 'ex');
      return `<tr><td><span class="nm">${esc(s.name || id)}</span><span class="sub">${esc(c.name || '')}</span></td>
        <td class="txt">${s.geo ? s.geo.map(esc).join('<br>') : '—'}</td><td class="txt">${age(a)}</td><td class="txt">${esc(a.genders || 'Todos')}</td>
        <td class="txt"><div class="tags">${who || '<span class="muted">Aberto (sem interesses)</span>'}</div></td>
        <td>${F.money(m.spend)}</td><td>${F.int(m.res)}</td><td>${m.cpl != null ? F.money(m.cpl) : '—'}</td></tr>`;
    }).join('');
    $('#seg-table').innerHTML = head + `<tbody>${body || '<tr><td colspan="8" class="muted">Nenhum conjunto veiculou no período</td></tr>'}</tbody>`;
    $('#seg-sub').textContent = `Para quem cada conjunto está configurado e o que entregou no período · ${rows.length} ${rows.length === 1 ? 'conjunto' : 'conjuntos'}`;
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
    const hiCut = state.bd === 'cpl' ? Infinity : min + (max - min) * 0.55;
    o.series = [{ type: 'heatmap', data: data.map((x) => ({ value: x.slice(0, 3), m: x[3], label: { color: x[2] != null && x[2] !== '-' && x[2] >= hiCut ? '#fff' : p.text } })), label: { show: true, fontSize: 11, fontWeight: 600, formatter: (x) => (x.data.value[2] === '-' ? '' : fmt(x.data.value[2]).replace(/,00$/, '')) }, itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 } }];
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
      { name: resLabel(), type: 'bar', data: w.map((x, i) => ({ value: x.res, itemStyle: { color: i === bestIdx ? p.c[0] : p.soft, borderRadius: 99 } })), barMaxWidth: 30 },
      { name: cplLabel(), type: 'line', yAxisIndex: 1, data: w.map((x) => (x.cpl == null ? null : +x.cpl.toFixed(2))), smooth: 0.3, symbolSize: 6, lineStyle: { color: p.c[3], width: 2.2 }, itemStyle: { color: p.c[3] } },
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
      const w = i === 0 ? 100 : Math.max(8, Math.pow(v / max, 0.28) * 100);
      return `<div class="f-step"><div class="lbl">${esc(l)}</div><div class="f-bar"><i style="width:${w}%"></i><b class="num${w < 22 ? ' out' : ''}" ${w < 22 ? `style="left:calc(${w}% + 10px)"` : ''}>${F.int(v)}</b></div><div class="rate">${rate == null ? '' : `<strong class="num">${F.pct(rate)}</strong>${rl}`}</div></div>`;
    }).join('') + `<div class="f-cost"><div><span>CPM</span><strong class="num">${F.money(c.cpm)}</strong></div><div><span>CPC (link)</span><strong class="num">${F.money(c.cpc)}</strong></div><div><span>${cplLabel()}</span><strong class="num">${F.money(c.cpl)}</strong></div></div>`;
  }

  // ------------------------------------------------------------------ vendas (lead → Dommus → venda)
  const SC = () => window.BNRSales;
  const VIA_LABEL = { utm: 'UTM do anúncio', email: 'E-mail', telefone: 'Telefone', nome: 'Nome e data', anuncio: 'Nome do anúncio', campanha: 'Só a campanha' };
  const VIA_CONF = { utm: 'good', email: 'good', telefone: 'good', nome: 'warn', anuncio: 'warn', campanha: 'warn' };
  const CONF_TXT = { good: 'confiança alta', warn: 'confiança média', bad: 'confiança baixa' };
  // Filtros de campanha/conjunto valem para as vendas; o filtro de objetivo, não (venda vem de lead e de conversa).
  function adPasses(id) {
    const a = state.data.ads[id];
    if (!a) return !state.campaigns.size && !state.adsets.size;
    if (state.campaigns.size && !state.campaigns.has(a.campaignId)) return false;
    if (state.adsets.size && !state.adsets.has(a.adsetId)) return false;
    return true;
  }
  /** Toque que leva o crédito da venda: o primeiro lead da pessoa ou o último antes da venda. */
  function saleTouch(s) {
    const t = s.t || []; if (!t.length) return null;
    if (state.attr === 'first') return t[0];
    const before = t.filter((x) => !s.d || !x[0] || x[0] <= s.d);
    return before.length ? before[before.length - 1] : t[0];
  }
  function salePasses(s) {
    const tc = saleTouch(s);
    if (tc) return adPasses(tc[1]);
    if (s.camp) return !state.adsets.size && (!state.campaigns.size || state.campaigns.has(s.camp));
    return !state.campaigns.size && !state.adsets.size;
  }
  function salesModel() {
    const S = state.sales; const d = state.data;
    const inP = (x) => x && x >= state.since && x <= state.until;
    const sales = S.sales.filter((s) => inP(s.d) && salePasses(s));
    const C = {}; S.leads.cols.forEach((c, i) => (C[c] = i));
    const leads = S.leads.rows.filter((r) => inP(r[C.d]) && adPasses(r[C.ad]));
    const adSet = new Set(Object.keys(d.ads).filter(adPasses));
    const spend = total(state.since, state.until, adSet);
    return { sales, leads, C, adSet, spend };
  }
  function prepSales(s) {
    if (!s) return null;
    s.sales = s.sales || []; s.leads = s.leads || { cols: ['d', 'ad', 'st', 'via'], rows: [] };
    s.stages = s.stages || ['No Dommus', 'Em atendimento', 'Visita', 'Proposta', 'Venda'];
    return s;
  }
  async function loadSales(data) {
    if (data.source === 'demo') { state.sales = prepSales(window.BNRDemo.sales(data)); return; }
    state.sales = null;
    if (data.source !== 'live') return;
    try {
      const r = await fetch('data/sales.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (state.data !== data) return;
      state.sales = prepSales(await r.json());
    } catch (e) { state.sales = { missing: true }; }
    if (state.page === 'sales') render();
  }

  function renderSales() {
    const S = state.sales;
    const box = $('#sales-status');
    if (!S && state.data.source === 'live') { box.innerHTML = '<div class="empty">Carregando vendas…</div>'; $('#sales-main').hidden = true; return; }
    if (!S || S.missing) {
      box.innerHTML = `<div class="setup"><b>A aba Vendas ainda não tem dados.</b> Ela precisa de duas coisas: os leads do formulário da Meta (permissão <code>leads_retrieval</code> no token) e o export do Dommus. O passo a passo está no README, em “Vendas: do anúncio ao contrato”. Enquanto isso, você pode importar um export do Dommus aqui mesmo.</div>` + importBlock(null);
      ['#sales-kpis', '#sales-funnel', '#sales-links', '#sales-ads', '#sales-list'].forEach((id) => ($(id).innerHTML = ''));
      $('#sales-main').hidden = true; return;
    }
    $('#sales-main').hidden = false;
    const m = salesModel(); const d = state.data;
    renderSalesStatus(S, m);
    const withAd = m.sales.filter((s) => saleTouch(s));
    const fromAds = m.sales.filter((s) => saleTouch(s) || s.camp);
    const vgv = m.sales.reduce((a, s) => a + (s.v || 0), 0);
    const vgvAds = fromAds.reduce((a, s) => a + (s.v || 0), 0);
    const cohort = m.leads.length; const cohortWon = m.leads.filter((r) => r[m.C.st] === 4).length;
    const lags = withAd.map((s) => { const tc = saleTouch(s); return tc && tc[0] && s.d ? D.diff(tc[0], s.d) : null; }).filter((x) => x != null && x >= 0).sort((a, b) => a - b);
    const median = lags.length ? lags[Math.floor(lags.length / 2)] : null;
    const valued = m.sales.filter((s) => s.v);
    const items = [
      { l: 'Vendas', v: F.int(m.sales.length), ico: ICON.star, hero: true, sub: `${F.int(fromAds.length)} vieram de anúncio` },
      { l: 'VGV vendido', v: esc(F.money(vgv)), ico: ICON.wallet, sub: valued.length ? `ticket médio ${F.money(vgv / valued.length)}` : 'sem valor no Dommus' },
      { l: 'Custo por venda', v: moneyParts(fromAds.length ? m.spend.spend / fromAds.length : null), ico: ICON.tag, sub: 'investimento ÷ vendas de anúncio' },
      { l: 'Lead → venda', v: F.pct(cohort ? cohortWon / cohort : null), ico: ICON.target, sub: `dos ${F.int(cohort)} leads que chegaram no período` },
    ];
    $('#sales-kpis').innerHTML = items.map((it) => `<div class="kpi ${it.hero ? 'hero' : ''}">
        <div class="kpi-top"><span class="kpi-label">${esc(it.l)}</span><span class="kpi-ico">${it.ico}</span></div>
        <div class="kpi-value num">${it.v}</div><div class="kpi-foot"><span>${esc(it.sub)}</span></div></div>`).join('');
    $('#sales-mini').innerHTML = [
      ['VGV ÷ investimento', m.spend.spend > 0 && vgvAds ? nf.int.format(vgvAds / m.spend.spend) + 'x' : '—', 'quanto cada R$ 1 em anúncio virou em VGV'],
      ['Tempo até a venda', median != null ? `${F.int(median)} dias` : '—', 'mediana, do lead até o contrato'],
      ['Investimento no período', F.money(m.spend.spend), 'dos anúncios no filtro'],
      ['Vendas sem origem', F.int(m.sales.length - fromAds.length), 'indicação, plantão, orgânico…'],
    ].map(([l, v, s]) => `<div><span>${esc(l)}</span><strong class="num">${esc(v)}</strong><small>${esc(s)}</small></div>`).join('');
    renderSalesFunnel(S, m);
    renderSalesLinks(S, m);
    renderSalesAds(m);
    renderSalesList(m);
  }

  function importBlock(S) {
    const needKey = S && S.keys;
    return `<div class="import-row">
      ${needKey ? '<label class="field" title="A frase do secret SALES_KEY. Fica só neste navegador.">Frase secreta <input type="password" id="sales-key" autocomplete="off" placeholder="SALES_KEY" /></label>' : ''}
      <label class="btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Importar export do Dommus<input type="file" id="dommus-input" accept=".csv,.xlsx,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden /></label>
      <span class="muted">CSV ou Excel. O arquivo é lido só neste navegador, nada é enviado.</span></div>`;
  }
  function renderSalesStatus(S, m) {
    const ok = (b) => `<span class="dot ${b ? 'on' : 'off'}"></span>`;
    const mf = S.metaForms || {}, dm = S.dommus || {}, cov = S.coverage;
    const formRows = m.leads.filter((r) => r[m.C.via] === 'form');
    const found = formRows.filter((r) => r[m.C.st] !== -1).length;
    const srcTxt = { api: 'API', export: 'export automático', import: 'arquivo importado', demo: 'demonstração' }[dm.source] || '';
    $('#sales-status').innerHTML = `<div class="conn">
        <div>${ok(mf.connected)}<b>Formulários da Meta</b><small>${mf.connected ? `${F.int(mf.leads)} leads com nome, e-mail e telefone` : esc(mf.error || 'não conectado')}</small></div>
        <div>${ok(dm.connected)}<b>Dommus</b><small>${dm.connected ? `${F.int(dm.records)} oportunidades · ${esc(srcTxt)}` : esc(dm.error || 'não conectado')}</small></div>
        <div>${ok(formRows.length && found / formRows.length > 0.7)}<b>Leads achados no Dommus</b><small>${formRows.length && dm.connected ? `${F.pct(found / formRows.length)} dos leads do formulário no período${cov && cov.since ? ` (export desde ${D.fmt(cov.since, { year: 'numeric' })})` : ''}` : '—'}</small></div>
      </div>${S.source === 'demo' ? '<p class="muted demo-note">Dados de demonstração. Os clientes aparecem mascarados, como na versão real.</p>' : ''}${importBlock(S)}`;
  }
  function renderSalesFunnel(S, m) {
    const st = m.leads.map((r) => r[m.C.st]);
    if (!st.length) { $('#sales-funnel').innerHTML = '<div class="empty">Nenhum lead no período.</div>'; return; }
    const dm = S.dommus && S.dommus.connected;
    const steps = [['Leads', st.length]].concat(S.stages.map((l, k) => [l, st.filter((x) => (k === 0 ? x !== -1 : x !== 9 && x >= k)).length]));
    const lost = st.filter((x) => x === 9).length;
    const max = steps[0][1] || 1;
    $('#sales-funnel').innerHTML = (dm ? '' : '<div class="setup sm">Conecte o Dommus para ver as etapas depois do lead.</div>') + steps.slice(0, dm ? undefined : 1).map(([l, v], i) => {
      const w = i === 0 ? 100 : Math.max(6, Math.pow(v / max, 0.45) * 100);
      const rate = i === 0 ? null : steps[i - 1][1] ? v / steps[i - 1][1] : null;
      return `<div class="f-step"><div class="lbl">${esc(l)}</div><div class="f-bar"><i style="width:${w}%"></i><b class="num${w < 22 ? ' out' : ''}" ${w < 22 ? `style="left:calc(${w}% + 10px)"` : ''}>${F.int(v)}</b></div><div class="rate">${rate == null ? '' : `<strong class="num">${F.pct(rate)}</strong>da anterior`}</div></div>`;
    }).join('') + (dm ? `<p class="muted f-note">${F.int(lost)} desistiram ou foram descartados · ${F.int(st.filter((x) => x === -1).length)} não foram achados no Dommus</p>` : '');
  }
  function renderSalesLinks(S, m) {
    const by = {}; let none = 0;
    for (const s of m.sales) { if (!s.via) { none++; continue; } by[s.via] = (by[s.via] || 0) + 1; }
    const order = ['utm', 'email', 'telefone', 'anuncio', 'nome', 'campanha'];
    const n = m.sales.length || 1;
    const rows = order.filter((k) => by[k]).map((k) => [VIA_LABEL[k], by[k], VIA_CONF[k]]);
    if (none) rows.push(['Sem anúncio identificado', none, 'none']);
    $('#sales-links').innerHTML = rows.length ? rows.map(([l, v, c]) => `<div class="link-row"><span>${esc(l)}</span><span class="lk-bar"><i style="width:${(v / n) * 100}%"></i></span><b class="num">${F.int(v)}</b><span class="pill ${c}">${c === 'none' ? 'sem origem' : CONF_TXT[c]}</span></div>`).join('') +
      '<p class="muted f-note">Como cada venda do Dommus foi ligada ao anúncio. E-mail, telefone e UTM são ligações exatas; nome e campanha são aproximações.</p>'
      : '<div class="empty">Nenhuma venda no período.</div>';
  }
  function renderSalesAds(m) {
    const d = state.data; const by = new Map(); const camps = new Map();
    const get = (id) => { let x = by.get(id); if (!x) by.set(id, (x = { id, leads: 0, won: 0, sales: 0, vgv: 0 })); return x; };
    for (const r of m.leads) { const x = get(r[m.C.ad]); x.leads++; if (r[m.C.st] === 4) x.won++; }
    for (const s of m.sales) {
      const tc = saleTouch(s);
      if (tc) { const x = get(tc[1]); x.sales++; x.vgv += s.v || 0; }
      else if (s.camp) { const c = camps.get(s.camp) || { sales: 0, vgv: 0 }; c.sales++; c.vgv += s.v || 0; camps.set(s.camp, c); }
    }
    const spend = aggregate(state.since, state.until, m.adSet, (r) => r[d._c.ad]);
    const list = [...by.values()].filter((x) => x.sales || x.leads >= 3).map((x) => Object.assign(x, { m: spend.get(x.id) || derive(blank()) }))
      .sort((a, b) => b.sales - a.sales || b.vgv - a.vgv || b.leads - a.leads).slice(0, 25);
    if (!list.length && !camps.size) { $('#sales-ads').innerHTML = '<div class="empty">Nenhum anúncio com leads ou vendas no período.</div>'; return; }
    const head = '<thead><tr><th>Anúncio</th><th>Leads</th><th>Vendas</th><th title="Dos leads do período, quantos já viraram venda">Lead → venda</th><th>Investimento</th><th>CPL</th><th>Custo por venda</th><th>VGV</th><th title="VGV ÷ investimento">Retorno</th></tr></thead>';
    const body = list.map((x) => {
      const a = d.ads[x.id] || { name: 'Anúncio ' + x.id, campaignId: '' }; const img = a.thumb || a.image;
      const cpl = x.leads ? x.m.spend / x.leads : null;
      return `<tr data-ad="${esc(x.id)}" class="clickable" tabindex="0"><td><div class="cell-ad"><span class="lr-thumb sm" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span><div><div class="nm">${esc(a.name)}</div><div class="sub">${esc((d.campaigns[a.campaignId] || {}).name || '')}</div></div></div></td>
        <td class="num">${F.int(x.leads)}</td><td class="num"><b>${F.int(x.sales)}</b></td><td class="num">${x.leads ? F.pct(x.won / x.leads) : '—'}</td><td class="num">${F.money(x.m.spend)}</td><td class="num">${F.money(cpl)}</td>
        <td class="num">${x.sales ? F.money(x.m.spend / x.sales) : '—'}</td><td class="num">${x.vgv ? F.money(x.vgv) : '—'}</td><td class="num">${x.sales && x.m.spend ? nf.int.format(x.vgv / x.m.spend) + 'x' : '—'}</td></tr>`;
    }).join('') + [...camps.entries()].map(([id, c]) => `<tr><td><div class="cell-ad"><span class="lr-thumb sm"></span><div><div class="nm">${esc((d.campaigns[id] || {}).name || 'Campanha ' + id)}</div><div class="sub">Só a campanha identificada, sem o anúncio</div></div></div></td><td class="num">—</td><td class="num"><b>${F.int(c.sales)}</b></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">${c.vgv ? F.money(c.vgv) : '—'}</td><td class="num">—</td></tr>`).join('');
    $('#sales-ads').innerHTML = `<table class="sales-table">${head}<tbody>${body}</tbody></table>`;
  }
  const dShort = (x) => (x ? D.parse(x).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
  function renderSalesList(m) {
    const d = state.data;
    $$('#attr-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.a === state.attr));
    $('#sales-show').value = state.salesShow;
    let list = m.sales;
    if (state.salesShow === 'ad') list = list.filter((s) => saleTouch(s) || s.camp);
    if (state.salesShow === 'none') list = list.filter((s) => !saleTouch(s) && !s.camp);
    $('#sales-list-sub').textContent = `${F.int(list.length)} ${list.length === 1 ? 'venda' : 'vendas'} fechadas no período · crédito para o ${state.attr === 'first' ? 'primeiro lead da pessoa' : 'último lead antes da venda'}`;
    if (!list.length) { $('#sales-list').innerHTML = '<div class="empty">Nenhuma venda no período com esse filtro.</div>'; $('#sales-more').hidden = true; return; }
    $('#sales-list').innerHTML = list.slice(0, state.salesLimit).map((s) => {
      const tc = saleTouch(s); const a = tc && d.ads[tc[1]];
      const img = a && (a.thumb || a.image);
      const days = tc && tc[0] && s.d ? D.diff(tc[0], s.d) : null;
      const conf = s.via ? VIA_CONF[s.via] : 'none';
      const origin = tc
        ? `<button class="j-step j-ad" data-ad="${esc(tc[1])}" title="Ver o anúncio"><span class="lr-thumb sm" style="${img ? `background-image:url('${esc(img)}')` : ''}"></span><span><small>Anúncio</small><b>${esc(a ? a.name : 'Anúncio ' + tc[1])}</b><em>${esc(a ? (d.campaigns[a.campaignId] || {}).name || '' : '')}${a && d.adsets[a.adsetId] ? ' › ' + esc(d.adsets[a.adsetId].name) : ''}</em></span></button>`
        : s.camp ? `<div class="j-step muted-step"><span><small>Campanha</small><b>${esc((d.campaigns[s.camp] || {}).name || s.camp)}</b><em>anúncio não identificado</em></span></div>`
          : `<div class="j-step muted-step"><span><small>Origem no Dommus</small><b>${esc(s.o || 'Não informada')}</b><em>sem anúncio identificado</em></span></div>`;
      const more = (s.t || []).length > 1 ? `<span class="pill outline" title="${esc(s.t.map((t) => `${D.fmt(t[0])}: ${(d.ads[t[1]] || {}).name || t[1]}`).join('\n'))}">${s.t.length} leads antes da venda</span>` : '';
      return `<div class="journey">
        <div class="j-client"><b>${esc(s.nm)}</b><small>${esc(s.ph || '')}</small><strong class="num">${s.v ? F.money(s.v) : 'Valor não informado'}</strong><small>${esc(s.pr || '')}</small></div>
        <div class="j-path">${origin}
          <span class="j-arrow" aria-hidden="true">→</span>
          <div class="j-step"><span><small>Lead</small><b>${dShort(tc && tc[0] ? tc[0] : s.cr)}</b><em>${tc ? (tc[2] === 'utm' ? 'landing page' : 'formulário') : 'no Dommus'}</em></span></div>
          <span class="j-arrow" aria-hidden="true">→</span>
          <div class="j-step won"><span><small>Venda</small><b>${dShort(s.d)}</b><em>${days != null && days >= 0 ? `+${F.int(days)} ${days === 1 ? 'dia' : 'dias'}` : 'Venda ganha'}</em></span></div>
        </div>
        <div class="j-match">${s.via ? `<span class="pill ${conf}">${esc(VIA_LABEL[s.via])} · ${CONF_TXT[conf]}</span>` : '<span class="pill none">sem origem</span>'}${more}</div>
      </div>`;
    }).join('');
    $('#sales-more').hidden = list.length <= state.salesLimit;
  }

  // Importa o export do Dommus no navegador e refaz o cruzamento (nada sai do navegador)
  async function hmacFn(pass) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return async (x) => [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(x)))].map((v) => v.toString(16).padStart(2, '0')).join('').slice(0, 20);
  }
  const inflateBrowser = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  async function importDommus(file) {
    const S = state.sales && !state.sales.missing ? state.sales : null;
    try {
      let hash = null, leads = [];
      if (S && S.keys) {
        const pass = ($('#sales-key') && $('#sales-key').value) || '';
        if (!pass) { toast('Digite a frase secreta (SALES_KEY) antes de importar.', 5000); return; }
        hash = await hmacFn(pass);
        if ((await hash('bnr-check')) !== S.keys.check) { toast('Frase secreta errada: ela precisa ser igual ao secret SALES_KEY.', 6000); return; }
        leads = S.keys.rows.map((r) => ({ d: r[0], ad: r[1], e: r[2], p: r[3], n: r[4] }));
      } else if (S) {
        const C = {}; S.leads.cols.forEach((c, i) => (C[c] = i));
        leads = S.leads.rows.filter((r) => r[C.via] === 'form').map((r) => ({ d: r[C.d], ad: r[C.ad] }));
      }
      const objs = await SC().readFile(new Uint8Array(await file.arrayBuffer()), file.name, inflateBrowser);
      const { records, map } = SC().toRecords(objs, {});
      if (!records.length) throw new Error('Não achei nenhuma oportunidade no arquivo (precisa ter nome, e-mail ou telefone).');
      // sem a frase, não dá para comparar contato: o cruzamento usa só UTM e nomes de anúncio/campanha
      await SC().withKeys(records, hash || (async () => null));
      const res = SC().match(leads, records, state.data);
      state.sales = prepSales(Object.assign({}, S || {}, {
        source: 'import', generatedAt: new Date().toISOString(), stages: SC().STAGES,
        metaForms: S ? S.metaForms : { connected: false, error: 'Leads do formulário não sincronizados' },
        dommus: { connected: true, source: 'import', records: records.length, fields: map },
        leads: res.leads, sales: res.sales, coverage: res.coverage, keys: S && S.keys,
      }));
      const cols = Object.keys(map).map((k) => SC().FIELD_LABEL[k]).filter(Boolean).join(', ');
      toast(`${F.int(records.length)} oportunidades lidas · ${F.int(res.sales.length)} vendas · colunas: ${cols}${!map.stage && !map.saleDate ? '. Atenção: não achei a coluna de etapa nem a de data da venda.' : ''}`, 9000);
      render();
    } catch (e) { toast('Erro ao ler o export: ' + e.message, 7000); }
  }
  function exportSalesCsv() {
    const d = state.data; const m = salesModel();
    const lines = [['Data da venda', 'Cliente', 'Valor', 'Empreendimento', 'Campanha', 'Conjunto', 'Anúncio', 'ID do anúncio', 'Data do lead', 'Dias até a venda', 'Ligado por', 'Origem no Dommus'].join(';')];
    for (const s of m.sales) {
      const tc = saleTouch(s); const a = tc && d.ads[tc[1]];
      const camp = a ? (d.campaigns[a.campaignId] || {}).name : s.camp ? (d.campaigns[s.camp] || {}).name : '';
      lines.push([s.d, s.nm, s.v == null ? '' : String(s.v).replace('.', ','), s.pr, camp || '', a ? (d.adsets[a.adsetId] || {}).name : '', a ? a.name : '', tc ? tc[1] : '', tc ? tc[0] : '', tc && tc[0] && s.d ? D.diff(tc[0], s.d) : '', s.via ? VIA_LABEL[s.via] : 'Sem origem', s.o].map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a'); el.href = url; el.download = `bnr-vendas_${state.since}_${state.until}.csv`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  /** Bloco de vendas no detalhe do anúncio. */
  function adSalesBlock(id) {
    const S = state.sales; if (!S || S.missing || !S.sales.length) return '';
    const list = S.sales.filter((s) => s.d >= state.since && s.d <= state.until && (saleTouch(s) || [])[1] === id);
    if (!list.length) return `<div><div class="sub-title">Vendas</div><div class="muted" style="font-size:12.5px">Nenhuma venda atribuída a este anúncio no período.</div></div>`;
    const vgv = list.reduce((a, s) => a + (s.v || 0), 0);
    return `<div><div class="sub-title">Vendas no período · ${F.int(list.length)} · ${F.money(vgv)}</div><div class="dr-sales">${list.slice(0, 8).map((s) => `<div><b>${esc(s.nm)}</b><span>${D.fmt(s.d, { year: 'numeric' })}</span><span class="num">${s.v ? F.money(s.v) : '—'}</span></div>`).join('')}</div></div>`;
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
      ${adSalesBlock(id)}
      <div><div class="sub-title">Evolução diária</div><div id="dr-chart" style="height:220px"></div></div>
      ${a.title || a.body ? `<div><div class="sub-title">Texto do anúncio</div><div class="ad-copy">${a.title ? `<b>${esc(a.title)}</b>\n` : ''}${esc(a.body || '')}</div></div>` : ''}
      <div class="muted" style="font-size:12px">ID do anúncio: ${esc(id)}</div>`;
    if (!$('#drawer').classList.contains('open')) lastFocus = document.activeElement;
    $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
    $('.app').inert = true; setTimeout(() => $('#dr-close').focus(), 50);
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
  let lastFocus = null;
  function closeDrawer() {
    if (!$('#drawer').classList.contains('open')) return;
    $('.app').inert = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus(); lastFocus = null;
    $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
    if (charts['dr-chart']) { charts['dr-chart'].dispose(); delete charts['dr-chart']; }
  }

  // ------------------------------------------------------------------ multi-select
  function MultiSelect(wrap, opts) {
    wrap.innerHTML = `<button class="btn" aria-haspopup="listbox" aria-expanded="false"><span class="ms-l">${opts.label}</span><span class="badge-count hidden"></span><svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="popover ms-pop hidden"><input type="search" placeholder="Filtrar ${opts.label.toLowerCase()}…" /><div class="ms-list"></div><div class="ms-foot"><button data-a="none">Limpar</button><button data-a="close">Concluir</button></div></div>`;
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
  segBind('#gran-seg', 'gran', 'g', () => { state.granAuto = false; renderTrend(); });
  segBind('#share-seg', 'share', 's', renderShare);
  segBind('#bd-seg', 'bd', 'm', renderBreakdowns);
  segBind('#table-seg', 'tableView', 'v', renderTable);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePops(); closeDrawer(); }
  });
  $('#chips').addEventListener('click', (e) => {
    if (e.target.id === 'clear-all') { state.campaigns.clear(); state.adsets.clear(); state.q = ''; state.status = 'all'; return render(); }
    const b = e.target.closest('button[data-t]'); if (!b) return;
    if (b.dataset.t === 'c') state.campaigns.delete(b.dataset.id);
    if (b.dataset.t === 's') state.adsets.delete(b.dataset.id);
    if (b.dataset.t === 'q') state.q = '';
    if (b.dataset.t === 'g') { state.goalAuto = !state.goalAuto; store.set('goalAuto', state.goalAuto); }
    if (b.dataset.t === 'st') state.status = 'all';
    render();
  });
  $('#rank-sort').addEventListener('change', (e) => { state.rankSort = e.target.value; state.rankLimit = 8; renderRanking(); });
  $('#rank-scope').value = state.rankScope;
  $('#rank-scope').addEventListener('change', (e) => { state.rankScope = e.target.value; store.set('rankScope', state.rankScope); state.rankLimit = 8; renderRanking(); });
  $('#min-res').addEventListener('change', (e) => { state.minRes = Math.max(0, +e.target.value || 0); store.set('minRes', state.minRes); render(); });
  $('#cpl-goal').addEventListener('change', (e) => { state.goal = +e.target.value > 0 ? +e.target.value : null; store.set('goal', state.goal); render(); });
  $('#top-sort').addEventListener('change', (e) => { state.topSort = e.target.value; renderTopAds(); });
  $('#theme-row').addEventListener('click', () => $('#theme-btn').click());
  $$('.brand-card, .m-brand').forEach((a) => a.addEventListener('click', () => { if (state.page === 'overview') window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  window.addEventListener('hashchange', () => { const pg = pageFromHash(); if (pg !== state.page) { state.page = pg; closePops(); render(); window.scrollTo(0, 0); } });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.list-row[data-ad], th[data-k], tr[data-ad]')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Tab' && $('#drawer').classList.contains('open')) {
      const f = $$('#drawer a[href], #drawer button').filter((x) => x.offsetParent); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
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
  $('#export-csv').addEventListener('click', () => { if (state.page === 'sales' && state.sales && !state.sales.missing) exportSalesCsv(); else exportCsv(); closePops(); });
  $$('#attr-seg button').forEach((b) => b.addEventListener('click', () => { state.attr = b.dataset.a; store.set('attr', state.attr); render(); }));
  $('#sales-show').addEventListener('change', (e) => { state.salesShow = e.target.value; state.salesLimit = 12; render(); });
  $('#sales-more').addEventListener('click', () => { state.salesLimit += 12; render(); });
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'dommus-input') { const f = e.target.files[0]; if (f) importDommus(f); e.target.value = ''; } });
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
    if (state.preset !== 'last_30') p.set('p', state.preset);
    if (state.preset === 'custom') { p.set('s', state.since); p.set('u', state.until); }
    if (state.mode !== 'leads') p.set('m', state.mode);
    if (state.campaigns.size) p.set('c', [...state.campaigns].join(','));
    if (state.adsets.size) p.set('as', [...state.adsets].join(','));
    if (state.status !== 'all') p.set('st', state.status);
    if (state.q) p.set('q', state.q);
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + location.search + '#/' + PAGES[state.page].slug + (qs ? '?' + qs : ''));
  }
  function readHash() {
    const h = location.hash.replace(/^#\/?/, '');
    let [slug, qs] = h.split('?');
    if (slug && slug.includes('=')) { qs = slug; slug = ''; }
    state.page = pageBySlug(slug);
    const p = new URLSearchParams(qs || '');
    if (p.get('p')) state.preset = p.get('p');
    if (state.preset === 'custom') { state.since = p.get('s'); state.until = p.get('u'); if (!state.since || !state.until) state.preset = 'last_30'; }
    if (p.get('m')) state.mode = p.get('m');
    if (p.get('c')) state.campaigns = new Set(p.get('c').split(','));
    if (p.get('as')) state.adsets = new Set(p.get('as').split(','));
    if (p.get('st')) state.status = p.get('st');
    if (p.get('q')) state.q = p.get('q');
  }

  // ------------------------------------------------------------------ boot
  function useData(data, resetFilters) {
    state.data = prepare(data);
    setCurrency(data.account && data.account.currency);
    if (resetFilters) { state.campaigns.clear(); state.adsets.clear(); state.expanded.clear(); }
    for (const id of [...state.campaigns]) if (!data.campaigns[id]) state.campaigns.delete(id);
    for (const id of [...state.adsets]) if (!data.adsets[id]) state.adsets.delete(id);
    setPreset(state.preset);
    loadSales(data);
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
    const wantDemo = new URLSearchParams(location.search).has('demo') || /[?&]demo=/.test(location.hash);
    if (wantDemo || !(await loadLive(false))) useData(window.BNRDemo.build(), false);
    // recarrega dados a cada 30 min se a aba ficar aberta
    setInterval(() => { if (state.data && state.data.source === 'live' && document.visibilityState === 'visible') loadLive(false); }, 30 * 60 * 1000);
  })();
})();
