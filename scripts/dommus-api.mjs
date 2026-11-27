/**
 * API pública do Dommus Prospecta (https://documenter.getpostman.com/view/17793777/2s9YsT5o3C).
 *
 * Login:   POST https://api.leads.dommus.com.br/publica/{slug}/login
 *          header Authorization: <chave do desenvolvedor> · body { usuario, senha } → token
 * Dados:   GET /publica/oportunidade?recursos_adicionais=lead (até 200 por página)
 *          + tabelas de nomes: /status (etapas), /campanha, /midia, /origem, /empreendimento
 *
 * Variáveis (secrets): DOMMUS_SLUG, DOMMUS_DEV_KEY, DOMMUS_USER, DOMMUS_PASSWORD
 *   ou DOMMUS_TOKEN (token já obtido, pula o login). DOMMUS_BASE_URL muda o endereço da API.
 *
 * Devolve objetos "planos" com os nomes de coluna que o DE/PARA (assets/sales-core.js) já reconhece.
 * Nenhum dado pessoal é impresso no log: só contagens e nomes de campos.
 */
const BASE = (process.env.DOMMUS_BASE_URL || 'https://api.leads.dommus.com.br/publica').replace(/\/+$/, '');
const LIMIT = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hasDommusApi = () =>
  !!(process.env.DOMMUS_TOKEN || (process.env.DOMMUS_SLUG && process.env.DOMMUS_DEV_KEY && process.env.DOMMUS_USER && process.env.DOMMUS_PASSWORD));

async function login() {
  if (process.env.DOMMUS_TOKEN) return process.env.DOMMUS_TOKEN;
  const r = await fetch(`${BASE}/${encodeURIComponent(process.env.DOMMUS_SLUG)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: process.env.DOMMUS_DEV_KEY },
    body: JSON.stringify({ usuario: process.env.DOMMUS_USER, senha: process.env.DOMMUS_PASSWORD }),
  });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { /* resposta não-JSON */ }
  if (!r.ok) throw new Error(`login no Dommus recusado (HTTP ${r.status})${j && (j.message || j.mensagem) ? ': ' + (j.message || j.mensagem) : ''}`);
  const token = findToken(j) || (typeof j === 'string' ? j : null) || (text && !j ? text.trim() : null);
  if (!token) throw new Error(`login no Dommus sem token na resposta (campos: ${j ? Object.keys(j).join(', ') : 'nenhum'})`);
  return token;
}
function findToken(j) {
  if (!j || typeof j !== 'object') return null;
  for (const k of ['token', 'access_token', 'accessToken', 'jwt', 'tokenAutenticacao']) if (typeof j[k] === 'string') return j[k];
  for (const v of Object.values(j)) { const t = typeof v === 'object' ? findToken(v) : null; if (t) return t; }
  return null;
}

/** Primeiro array de registros da resposta + total, se vier. */
function unwrap(j) {
  if (Array.isArray(j)) return { rows: j, total: null };
  if (!j || typeof j !== 'object') return { rows: [], total: null };
  const total = Number(j.total ?? j.quantidade ?? j.qtd ?? j.count ?? (j.meta && j.meta.total)) || null;
  for (const k of ['dados', 'data', 'registros', 'items', 'results', 'rows', 'oportunidades', 'resultado']) {
    if (Array.isArray(j[k])) return { rows: j[k], total };
    if (j[k] && typeof j[k] === 'object') { const x = unwrap(j[k]); if (x.rows.length) return { rows: x.rows, total: total || x.total }; }
  }
  const arr = Object.values(j).find(Array.isArray);
  return { rows: arr || [], total };
}

async function get(path, token, params = {}, attempt = 0) {
  const u = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { Authorization: token, Accept: 'application/json' } });
  if ((r.status === 429 || r.status >= 500) && attempt < 5) { await sleep(2000 * (attempt + 1)); return get(path, token, params, attempt + 1); }
  if (!r.ok) throw new Error(`Dommus ${path} respondeu HTTP ${r.status}`);
  return r.json();
}

async function all(path, token, params = {}) {
  const out = [];
  for (let page = 1; page <= 2000; page++) {
    const { rows, total } = unwrap(await get(path, token, { ...params, page, limit: LIMIT }));
    out.push(...rows);
    if (rows.length < LIMIT || (total && out.length >= total)) break;
  }
  return out;
}

/** Tabela id → nome (falha silenciosa: sem a tabela, mostra o código). */
async function names(path, token, idKey, nameKeys) {
  try {
    const rows = await all(path, token);
    return new Map(rows.map((r) => [String(r[idKey]), nameKeys.map((k) => r[k]).find((v) => v != null && v !== '')]));
  } catch (e) { console.warn(`  ! tabela ${path} não lida: ${e.message}`); return new Map(); }
}

const first = (o, keys) => { for (const k of keys) { const v = o && o[k]; if (v != null && v !== '') return v; } return ''; };
const nameOf = (map, id, fallback) => (id == null || id === '' ? fallback || '' : map.get(String(id)) || fallback || String(id));
const leadOf = (op) => {
  const l = op.lead || op.leads || op.envolvido || op.envolvidos;
  return Array.isArray(l) ? l[0] || {} : l || {};
};

export async function fromDommusApi() {
  const token = await login();
  const [status, campanhas, midias, origens, empreend] = await Promise.all([
    names('status', token, 'id_status_oportunidade', ['nome']),
    names('campanha', token, 'id_campanha', ['nome']),
    names('midia', token, 'id_midia', ['descricao', 'nome']),
    names('origem', token, 'id_origem', ['origem', 'nome']),
    names('empreendimento', token, 'id_empreendimento', ['nome', 'nome_empreendimento', 'descricao']),
  ]);
  const ops = await all('oportunidade', token, { recursos_adicionais: 'lead' });
  if (ops.length) {
    const l = leadOf(ops[0]);
    console.log(`  · campos da oportunidade: ${Object.keys(ops[0]).join(', ')}`);
    console.log(`  · campos do lead: ${Object.keys(l).join(', ') || '(nenhum: recursos_adicionais=lead não veio)'}`);
  }
  const tipoEtapa = new Map();
  try { for (const s of await all('status', token)) tipoEtapa.set(String(s.id_status_oportunidade), s.tipo); } catch (e) { /* opcional */ }

  const rows = ops.filter((op) => op.ativo !== 0 && op.ativo !== false && op.ativo !== '0').map((op) => {
    const l = leadOf(op);
    const tipo = tipoEtapa.get(String(op.id_status_oportunidade));
    return {
      id: first(op, ['id_oportunidade', 'id']),
      nome: first(l, ['nome', 'nome_lead', 'name']) || first(op, ['nome', 'nome_lead']),
      email: first(l, ['email', 'e_mail']) || first(op, ['email']),
      telefone: first(l, ['telefone', 'celular', 'telefone_celular', 'whatsapp']) || first(op, ['telefone', 'celular']),
      data_cadastro: first(op, ['criado_em']) || first(l, ['criado_em']),
      data_atualizacao: first(op, ['atualizado_em']),
      etapa: nameOf(status, op.id_status_oportunidade, op.status_oportunidade && op.status_oportunidade.nome),
      tipo_etapa: tipo === 'D' ? 'Desistência' : '',
      data_venda: first(op, ['data_venda', 'convertido_em']),
      valor_venda: first(op, ['valor_venda']),
      empreendimento: nameOf(empreend, op.id_empreendimento ?? l.id_empreendimento),
      origem: nameOf(origens, l.id_origem ?? op.id_origem, first(l, ['origem'])),
      midia: nameOf(midias, l.id_midia ?? op.id_midia, first(l, ['midia'])),
      campanha: nameOf(campanhas, l.id_campanha ?? op.id_campanha, first(l, ['campanha'])),
      utm_source: first(l, ['utm_source']),
      utm_content: first(l, ['utm_content', 'ad_id', 'id_anuncio']),
    };
  });
  console.log(`  · ${rows.length} oportunidades · ${rows.filter((r) => r.email).length} com e-mail · ${rows.filter((r) => r.telefone).length} com telefone · ${rows.filter((r) => r.data_venda).length} com data de venda`);
  return rows;
}
