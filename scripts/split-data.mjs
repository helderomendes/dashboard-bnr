#!/usr/bin/env node
/**
 * Divide o JSON completo da sincronização em partes mensais para o dashboard.
 *
 *   node scripts/split-data.mjs <insights-completo.json> <pasta-data-publica>
 *
 * Gera <pasta>/insights.json (pequeno: conta, campanhas, conjuntos, anúncios e a lista
 * de partes) e <pasta>/chunks/AAAA-MM.<hash>.json com as linhas diárias e as quebras
 * de cada mês. O hash vem do conteúdo, então meses fechados podem ter cache imutável;
 * o dashboard baixa só os meses do período que a pessoa está vendo.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) { console.error('uso: split-data.mjs <entrada.json> <pasta-saida>'); process.exit(2); }

const data = JSON.parse(await readFile(input, 'utf8'));
const month = (d) => d.slice(0, 7);
const months = new Map(); // 'AAAA-MM' -> { daily: [], breakdowns: {} }
const bucket = (m) => { let b = months.get(m); if (!b) months.set(m, (b = { daily: [], breakdowns: {} })); return b; };

const dIdx = data.daily.cols.indexOf('d');
for (const r of data.daily.rows) bucket(month(r[dIdx])).daily.push(r);
for (const [name, b] of Object.entries(data.breakdowns || {})) {
  const i = b.cols.indexOf('d');
  for (const r of b.rows) (bucket(month(r[i])).breakdowns[name] ||= []).push(r);
}

await rm(join(outDir, 'chunks'), { recursive: true, force: true });
await mkdir(join(outDir, 'chunks'), { recursive: true });
const chunks = [];
let bytes = 0;
for (const m of [...months.keys()].sort()) {
  const body = JSON.stringify({ m, ...months.get(m) });
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const file = `chunks/${m}.${hash}.json`;
  await writeFile(join(outDir, file), body);
  bytes += body.length;
  chunks.push({ m, f: file, n: months.get(m).daily.length });
}

const core = {
  ...data,
  daily: { cols: data.daily.cols, rows: [] },
  breakdowns: Object.fromEntries(Object.entries(data.breakdowns || {}).map(([k, b]) => [k, { cols: b.cols, rows: [] }])),
  chunks,
};
const coreBody = JSON.stringify(core);
await writeFile(join(outDir, 'insights.json'), coreBody);
console.log(`• Dados divididos: insights.json ${(coreBody.length / 1024).toFixed(0)} KB + ${chunks.length} meses (${(bytes / 1024).toFixed(0)} KB no total)`);
