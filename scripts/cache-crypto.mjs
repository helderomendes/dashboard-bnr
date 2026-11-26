#!/usr/bin/env node
/**
 * Criptografa/descriptografa o cache da sincronização (AES-256-GCM, chave derivada com scrypt).
 * O repositório é público, então o cache só é guardado cifrado.
 *
 *   node scripts/cache-crypto.mjs encrypt <entrada.json> <saida.enc>
 *   node scripts/cache-crypto.mjs decrypt <entrada.enc> <saida.json>
 *
 * A chave vem de CACHE_KEY. Se ela faltar, ou se o arquivo não existir ou não abrir,
 * o script avisa e sai com código 0: a sincronização segue sem cache.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const [mode, input, output] = process.argv.slice(2);
const SECRET = process.env.CACHE_KEY || '';
const MAGIC = Buffer.from('BNRC1');

if (!['encrypt', 'decrypt'].includes(mode) || !input || !output) {
  console.error('uso: cache-crypto.mjs encrypt|decrypt <entrada> <saida>');
  process.exit(2);
}
if (SECRET.length < 20) {
  console.log('• CACHE_KEY ausente ou curta (mínimo 20 caracteres): seguindo sem cache.');
  process.exit(0);
}
const keyFor = (salt) => scryptSync(SECRET, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

try {
  const buf = await readFile(input);
  let out;
  if (mode === 'encrypt') {
    const salt = randomBytes(16), iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', keyFor(salt), iv);
    const body = Buffer.concat([c.update(gzipSync(buf)), c.final()]);
    out = Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
  } else {
    if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('formato desconhecido');
    let o = MAGIC.length;
    const salt = buf.subarray(o, o += 16), iv = buf.subarray(o, o += 12), tag = buf.subarray(o, o += 16);
    const d = createDecipheriv('aes-256-gcm', keyFor(salt), iv);
    d.setAuthTag(tag);
    out = gunzipSync(Buffer.concat([d.update(buf.subarray(o)), d.final()]));
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, out);
  console.log(`• Cache ${mode === 'encrypt' ? 'cifrado' : 'aberto'}: ${output} (${(out.length / 1024).toFixed(0)} KB)`);
} catch (e) {
  console.log(`• Cache não ${mode === 'encrypt' ? 'cifrado' : 'aberto'} (${e.code || e.message}): seguindo sem cache.`);
}
