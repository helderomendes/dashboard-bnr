/* Gerador de dados de demonstração — mesmo formato de data/insights.json.
   Usado quando ainda não existe sincronização com a Meta (ou com ?demo=1). */
(function () {
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const iso = (d) => d.toISOString().slice(0, 10);

  function thumb(label, c1, c2, icon) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"><path d="M40 150V80l50-30 50 30v70"/><path d="M150 150V55l45-25 45 25v95"/><path d="M250 150V95l30-18 30 18v55"/></g><text x="22" y="128" font-family="Inter,Arial" font-size="11" font-weight="700" fill="rgba(255,255,255,.75)" letter-spacing="2">${icon}</text><text x="22" y="156" font-family="Inter,Arial" font-size="17" font-weight="700" fill="#fff">${label}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function buildDemo(days) {
    days = days || 120;
    const r = rng(20261126);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today); start.setUTCDate(start.getUTCDate() - days + 1);

    const plan = [
      { id: 'c1', name: '[LEADS] Residencial Vista Verde | Formulário', obj: 'OUTCOME_LEADS', budget: 190, kind: 'form', status: 'ACTIVE', adsets: [
        { id: 's11', name: 'Interesses Imóveis | 25-45 | Raio 20km', q: 1.0, ads: [
          ['Vídeo tour decorado 30s', 1.35, 'VÍDEO', '#14213d', '#3a5a9b', 'Conheça o decorado do Vista Verde: 2 e 3 quartos com varanda gourmet. Entrada facilitada e parcelas que cabem no bolso. Agende sua visita!'],
          ['Carrossel plantas 2 e 3 quartos', 1.1, 'CARROSSEL', '#1f3b2c', '#3f8f5f', 'Escolha a planta ideal para sua família. Deslize e veja todas as opções do Residencial Vista Verde.'],
          ['Estático entrada facilitada', 0.75, 'IMAGEM', '#6b3b0a', '#c8891f', 'Saia do aluguel! Entrada a partir de R$ 9.900 e use seu FGTS. Fale com um corretor.']] },
        { id: 's12', name: 'Lookalike 1% Leads 180d', q: 1.25, ads: [
          ['Reels depoimento cliente', 1.45, 'REELS', '#3b1f4f', '#8b5cf6', '"Realizei o sonho da casa própria com a BNR." Veja a história da Ana e conheça o Vista Verde.'],
          ['Vídeo tour decorado 30s', 1.2, 'VÍDEO', '#14213d', '#3a5a9b', 'Conheça o decorado do Vista Verde: 2 e 3 quartos com varanda gourmet.']] },
        { id: 's13', name: 'Público aberto | Raio 15km', q: 0.7, ads: [
          ['Estático fachada noturna', 0.65, 'IMAGEM', '#0b1020', '#2f4a7a', 'Seu novo endereço está chegando. Residencial Vista Verde — lazer completo.'],
          ['Carrossel lazer completo', 0.9, 'CARROSSEL', '#0d3b4a', '#2aa3b8', 'Piscina, academia, espaço gourmet e playground. Tudo isso no seu condomínio.']] }] },
      { id: 'c2', name: '[LEADS] Lançamento Torre Aurora | Site', obj: 'OUTCOME_LEADS', budget: 240, kind: 'form', status: 'ACTIVE', adsets: [
        { id: 's21', name: 'Investidores | Renda alta | 30-55', q: 0.85, ads: [
          ['Vídeo valorização da região', 1.0, 'VÍDEO', '#2a1c02', '#a96f10', 'Torre Aurora: a região que mais valorizou nos últimos 5 anos. Condições de pré-lançamento.'],
          ['Estático tabela pré-lançamento', 1.3, 'IMAGEM', '#3d0f0f', '#d4473b', 'Tabela de pré-lançamento liberada por tempo limitado. Cadastre-se e receba em primeira mão.']] },
        { id: 's22', name: 'Remarketing visitantes do site 30d', q: 1.6, ads: [
          ['Carrossel diferenciais Aurora', 1.25, 'CARROSSEL', '#14213d', '#c8891f', 'Rooftop, coworking e vagas com carregador elétrico. Veja os diferenciais da Torre Aurora.'],
          ['Reels drone obra', 0.95, 'REELS', '#0f2e22', '#12925b', 'A obra está acelerada! Veja do alto como está ficando a Torre Aurora.']] },
        { id: 's23', name: 'Advantage+ público | Brasil', q: 0.6, ads: [
          ['Vídeo valorização da região', 0.8, 'VÍDEO', '#2a1c02', '#a96f10', 'Torre Aurora: a região que mais valorizou nos últimos 5 anos.']] }] },
      { id: 'c3', name: '[MENSAGENS] Plantão de Vendas | WhatsApp', obj: 'OUTCOME_ENGAGEMENT', budget: 120, kind: 'msg', status: 'ACTIVE', adsets: [
        { id: 's31', name: 'Interesses financiamento | MCMV', q: 1.1, ads: [
          ['Estático "Fale no WhatsApp"', 1.15, 'IMAGEM', '#0f2e22', '#25d366', 'Tire suas dúvidas sobre financiamento agora pelo WhatsApp. Atendimento em minutos!'],
          ['Vídeo simulação de parcela', 1.3, 'VÍDEO', '#142445', '#2f6fdb', 'Simule sua parcela em 1 minuto com nosso consultor no WhatsApp.']] },
        { id: 's32', name: 'Engajamento IG 90d', q: 0.9, ads: [
          ['Reels bastidores corretor', 1.0, 'REELS', '#3b1f4f', '#b69cff', 'Um dia no plantão de vendas da BNR. Chama a gente no direct!']] }] },
      { id: 'c4', name: '[REMARKETING] Engajados 30d | Formulário', obj: 'OUTCOME_LEADS', budget: 55, kind: 'form', status: 'PAUSED', pauseAt: 0.75, adsets: [
        { id: 's41', name: 'Engajou com anúncios 30d', q: 1.4, ads: [
          ['Estático última unidade', 1.2, 'IMAGEM', '#3d0f0f', '#f07167', 'Últimas unidades com condição especial. Garanta a sua!'],
          ['Carrossel plantas 2 e 3 quartos', 0.85, 'CARROSSEL', '#1f3b2c', '#3f8f5f', 'Escolha a planta ideal para sua família.']] }] },
    ];

    const data = {
      version: 1, source: 'demo', generatedAt: new Date().toISOString(),
      account: { id: 'act_000000000000', name: 'BNR Construtora 01', currency: 'BRL', timezone: 'America/Sao_Paulo' },
      campaigns: {}, adsets: {}, ads: {},
      daily: { cols: ['d', 'ad', 'spend', 'imp', 'clk', 'lclk', 'leads', 'msgs'], rows: [] },
      breakdowns: {},
    };

    const adList = [];
    let adN = 0;
    for (const c of plan) {
      data.campaigns[c.id] = { name: c.name, status: c.status, objective: c.obj };
      const sw = c.adsets.map((s) => s.q);
      const sSum = sw.reduce((a, b) => a + b, 0);
      c.adsets.forEach((s, si) => {
        data.adsets[s.id] = { name: s.name, status: c.status === 'ACTIVE' ? (s.q < 0.65 ? 'PAUSED' : 'ACTIVE') : 'CAMPAIGN_PAUSED', campaignId: c.id };
        const aSum = s.ads.reduce((a, b) => a + b[1], 0);
        s.ads.forEach((a) => {
          const id = 'a' + (++adN);
          const lateStart = r() < 0.3 ? Math.floor(r() * days * 0.5) : 0;
          data.ads[id] = {
            name: a[0], adsetId: s.id, campaignId: c.id,
            status: data.adsets[s.id].status === 'ACTIVE' ? (a[1] < 0.7 ? 'PAUSED' : 'ACTIVE') : 'ADSET_PAUSED',
            thumb: thumb(a[0], a[3], a[4], a[2]), format: a[2], body: a[5], title: c.name.split('] ')[1].split(' |')[0],
          };
          adList.push({ id, c, s, w: (s.q / sSum) * (a[1] / aSum), q: s.q * a[1], lateStart });
        });
      });
    }

    const camDay = {}; // c|d -> totals para breakdowns
    for (let i = 0; i < days; i++) {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
      const ds = iso(d), dow = d.getUTCDay();
      const wk = [0.82, 1.08, 1.06, 1.04, 1.02, 0.95, 0.8][dow];
      const season = 1 + 0.18 * Math.sin(i / 11) + i / days * 0.15;
      for (const a of adList) {
        if (i < a.lateStart) continue;
        if (a.c.pauseAt && i > days * a.c.pauseAt) continue;
        const spend = a.c.budget * a.w * season * (0.75 + r() * 0.5);
        const cpm = 22 + r() * 16 - a.q * 3;
        const imp = Math.round((spend / cpm) * 1000);
        const ctr = (0.007 + r() * 0.006) * (0.8 + a.q * 0.35);
        const lclk = Math.round(imp * ctr);
        const clk = Math.round(lclk * (1.6 + r() * 0.8));
        const conv = (a.c.kind === 'msg' ? 0.11 : 0.075) * a.q * wk * (0.6 + r() * 0.8);
        const expected = lclk * conv;
        const res = Math.max(0, Math.round(expected + (r() - 0.5) * Math.sqrt(expected + 0.4) * 1.6));
        const leads = a.c.kind === 'msg' ? (r() < 0.08 ? 1 : 0) : res;
        const msgs = a.c.kind === 'msg' ? res : (r() < 0.05 ? 1 : 0);
        data.daily.rows.push([ds, a.id, +spend.toFixed(2), imp, clk, lclk, leads, msgs]);
        const k = a.c.id + '|' + ds;
        const t = camDay[k] || (camDay[k] = { d: ds, c: a.c.id, spend: 0, imp: 0, lclk: 0, leads: 0, msgs: 0 });
        t.spend += spend; t.imp += imp; t.lclk += lclk; t.leads += leads; t.msgs += msgs;
      }
    }

    function split(name, keys) {
      const rows = [];
      for (const t of Object.values(camDay)) {
        const ws = keys.map((k) => k[1] * (0.7 + r() * 0.6));
        const sum = ws.reduce((a, b) => a + b, 0);
        const cvrW = keys.map((k) => k[2] || 1);
        let leftL = t.leads, leftM = t.msgs;
        keys.forEach((k, i) => {
          const share = ws[i] / sum;
          const last = i === keys.length - 1;
          const resShare = Math.min(1, share * cvrW[i]);
          const l = last ? leftL : Math.min(leftL, Math.round(t.leads * resShare + (r() - 0.5)));
          const m = last ? leftM : Math.min(leftM, Math.round(t.msgs * resShare + (r() - 0.5)));
          leftL -= l; leftM -= m;
          rows.push([t.d, t.c, k[0], +(t.spend * share).toFixed(2), Math.round(t.imp * share), Math.round(t.lclk * share), Math.max(0, l), Math.max(0, m)]);
        });
      }
      data.breakdowns[name] = { cols: ['d', 'c', 'k', 'spend', 'imp', 'lclk', 'leads', 'msgs'], rows };
    }
    split('placement', [
      ['instagram|feed', 0.24, 1.1], ['instagram|instagram_stories', 0.2, 0.9], ['instagram|instagram_reels', 0.2, 1.15],
      ['facebook|feed', 0.18, 1.2], ['facebook|facebook_reels', 0.06, 0.8], ['facebook|marketplace', 0.05, 0.7],
      ['facebook|facebook_stories', 0.04, 0.8], ['audience_network|an_classic', 0.03, 0.3]]);
    split('age_gender', [
      ['18-24|female', 0.05, 0.5], ['18-24|male', 0.05, 0.5], ['25-34|female', 0.17, 1.15], ['25-34|male', 0.15, 1.05],
      ['35-44|female', 0.16, 1.25], ['35-44|male', 0.14, 1.1], ['45-54|female', 0.09, 1.0], ['45-54|male', 0.08, 0.9],
      ['55-64|female', 0.04, 0.7], ['55-64|male', 0.04, 0.65], ['65+|female', 0.015, 0.4], ['65+|male', 0.015, 0.4], ['25-34|unknown', 0.01, 0.6]]);
    split('region', [
      ['São Paulo', 0.42, 1.1], ['Minas Gerais', 0.12, 0.9], ['Rio de Janeiro', 0.1, 0.85], ['Paraná', 0.08, 1.0],
      ['Goiás', 0.06, 1.05], ['Santa Catarina', 0.05, 0.95], ['Bahia', 0.05, 0.7], ['Distrito Federal', 0.04, 0.9],
      ['Rio Grande do Sul', 0.04, 0.8], ['Pernambuco', 0.02, 0.6], ['Ceará', 0.02, 0.6]]);
    return data;
  }

  /** Vendas de demonstração (mesmo formato de data/sales.json), a partir dos leads diários do demo. */
  function buildSalesDemo(data) {
    const r = rng(777);
    const C = {}; data.daily.cols.forEach((c, i) => (C[c] = i));
    const first = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Patrícia', 'Rafael', 'Simone', 'Thiago', 'Vanessa', 'Wesley'];
    const last = 'SMOCPRLAFBGTVN';
    const products = { c1: ['Residencial Vista Verde', 189000, 289000], c2: ['Torre Aurora', 420000, 780000], c3: ['Residencial Vista Verde', 179000, 249000], c4: ['Residencial Vista Verde', 199000, 279000] };
    // qualidade comercial por anúncio: nem todo CPL barato vende
    const qual = {}; Object.keys(data.ads).forEach((id, i) => { qual[id] = 0.4 + ((i * 37) % 11) / 10; });
    const today = new Date().toISOString().slice(0, 10);
    const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const rows = [], sales = [];
    for (const row of data.daily.rows) {
      const ad = data.ads[row[C.ad]]; const n = row[C.leads] + row[C.msgs];
      for (let k = 0; k < n; k++) {
        const q = qual[row[C.ad]];
        const x = r();
        let st = x < 0.12 ? -1 : x < 0.38 ? 9 : x < 0.62 ? 0 : x < 0.82 ? 1 : x < 0.92 ? 2 : 3;
        if (r() < 0.022 * q) st = 4;
        const via = row[C.msgs] ? 'telefone' : r() < 0.7 ? 'form' : 'utm';
        rows.push([row[C.d], row[C.ad], st, via === 'utm' ? 'utm' : 'form']);
        if (st !== 4) continue;
        const lag = 12 + Math.floor(r() * 70);
        const d = addDays(row[C.d], lag);
        if (d > today) { rows[rows.length - 1][2] = 3; continue; }
        const [pr, lo, hi] = products[ad.campaignId] || products.c1;
        const t = [[row[C.d], row[C.ad], via === 'form' ? (r() < 0.6 ? 'email' : 'telefone') : via]];
        if (r() < 0.25) { const other = Object.keys(data.ads)[Math.floor(r() * Object.keys(data.ads).length)]; t.unshift([addDays(row[C.d], -(5 + Math.floor(r() * 30))), other, 'email']); }
        sales.push({
          d, v: Math.round((lo + r() * (hi - lo)) / 1000) * 1000, pr,
          nm: first[Math.floor(r() * first.length)] + ' ' + last[Math.floor(r() * last.length)] + '.',
          ph: `(31) ••••-${String(1000 + Math.floor(r() * 8999))}`, cr: row[C.d],
          o: 'Facebook · Formulário', st: 'Venda Ganha', t, via: t[t.length - 1][2],
        });
      }
    }
    // vendas sem anúncio identificado (indicação, plantão, orgânico)
    for (let i = 0; i < Math.max(2, Math.round(sales.length * 0.3)); i++) {
      const d = addDays(today, -Math.floor(r() * 100));
      sales.push({ d, v: Math.round((200000 + r() * 300000) / 1000) * 1000, pr: 'Residencial Vista Verde', nm: first[Math.floor(r() * first.length)] + ' ' + last[Math.floor(r() * last.length)] + '.', ph: `(31) ••••-${String(1000 + Math.floor(r() * 8999))}`, cr: addDays(d, -30), o: ['Indicação', 'Plantão de vendas', 'Instagram orgânico', 'Site'][i % 4], st: 'Venda Ganha', t: [], via: null });
    }
    const camp = Object.keys(data.campaigns)[1];
    sales.push({ d: addDays(today, -9), v: 512000, pr: 'Torre Aurora', nm: 'Roberta L.', ph: '(31) ••••-4410', cr: addDays(today, -60), o: 'Facebook · ' + data.campaigns[camp].name, st: 'Venda Ganha', t: [], via: 'campanha', camp });
    sales.sort((a, b) => (a.d < b.d ? 1 : -1));
    const inDommus = rows.filter((x) => x[2] !== -1).length;
    return {
      version: 1, source: 'demo', generatedAt: new Date().toISOString(),
      stages: ['No Dommus', 'Em atendimento', 'Visita', 'Proposta', 'Venda'],
      metaForms: { connected: true, leads: rows.length }, dommus: { connected: true, source: 'demo', records: inDommus },
      leads: { cols: ['d', 'ad', 'st', 'via'], rows }, sales,
      coverage: { metaLeads: rows.length, found: inDommus, records: inDommus, linked: sales.filter((s) => s.t.length).length },
    };
  }

  window.BNRDemo = { build: buildDemo, sales: buildSalesDemo };
})();
