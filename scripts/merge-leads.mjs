#!/usr/bin/env node
/**
 * Soma os leads de vários arquivos (cache do GitHub e backup do branch backup-leads) num só,
 * sem repetir: o mesmo lead (id) fica uma vez. Arquivos que não existem são ignorados.
 *
 *   node scripts/merge-leads.mjs <saida.json> <entrada1.json> [entrada2.json ...]
 */
import { readFile, writeFile } from 'node:fs/promises';

const [out, ...inputs] = process.argv.slice(2);
const byId = new Map();
for (const f of inputs) {
  let data;
  try { data = JSON.parse(await readFile(f, 'utf8')); } catch (e) { continue; }
  const leads = Array.isArray(data.leads) ? data.leads : [];
  for (const l of leads) if (l && l.id && !byId.has(l.id)) byId.set(l.id, l);
  console.log(`• ${f}: ${leads.length} leads`);
}
if (!byId.size) { console.log('• Sem histórico de leads ainda'); process.exit(0); }
await writeFile(out, JSON.stringify({ leads: [...byId.values()] }));
console.log(`✔ ${out}: ${byId.size} leads no histórico`);
