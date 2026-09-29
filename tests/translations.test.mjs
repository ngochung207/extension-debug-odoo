import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveLangs, resolveModules, b64ToBytes, gunzip, untar } from '../extension/src/features/translations/logic.js';

assert.deepEqual(resolveLangs(['vi_vn', 'fr_BE', 'VI_VN', 'xx_XX'], ['en_US', 'vi_VN', 'fr_BE']),
  { codes: ['vi_VN', 'fr_BE'], unknown: ['xx_XX'] });

assert.deepEqual(resolveModules(['sale', 'nope', 'stock'], [{ id: 3, name: 'sale', state: 'installed' }, { id: 4, name: 'stock', state: 'uninstalled' }]),
  { ids: [3], missing: ['nope'], notInstalled: ['stock'] });

assert.deepEqual([...b64ToBytes('aGVs\nbG8=\n')], [...new TextEncoder().encode('hello')]);

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

/** Minimal ustar archive like Python's tarfile writes: header + data padded to 512, 2 zero blocks, record padding. */
function tar(entries) {
  const parts = [];
  for (const { name, body, type = '0', prefix = '' } of entries) {
    const data = enc(body);
    const h = new Uint8Array(512);
    const put = (off, s) => h.set(enc(s), off);
    put(0, name); put(100, '0000644\0'); put(108, '0000000\0'); put(116, '0000000\0');
    put(124, `${data.length.toString(8).padStart(11, '0')}\0`); put(136, '00000000000\0');
    put(148, '        '); put(156, type); put(257, 'ustar\0'); put(263, '00'); put(345, prefix);
    put(148, `${h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0')}\0 `);
    parts.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const len = parts.reduce((n, p) => n + p.length, 0);
  parts.push(new Uint8Array((10240 - (len % 10240)) % 10240));
  const out = new Uint8Array(len + parts.at(-1).length);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

test('untar lists the regular files with their path', () => {
  const long = `${'x'.repeat(120)}/i18n/vi_VN.po`;
  const files = untar(tar([
    { name: 'sale/i18n/sale.pot', body: 'msgid ""' },
    { name: 'sale/i18n', body: '', type: '5' }, // a directory: skipped
    { name: 'PaxHeader', body: `${long.length + 9 + String(long.length + 9).length} path=${long}\n`, type: 'x' },
    { name: 'truncated', body: 'vi'.repeat(400) },
    { name: 'i18n/fr_BE.po', prefix: 'stock', body: 'fr' },
  ]));
  assert.deepEqual(files.map((f) => [f.name, dec(f.data)]), [
    ['sale/i18n/sale.pot', 'msgid ""'], [long, 'vi'.repeat(400)], ['stock/i18n/fr_BE.po', 'fr']]);
  assert.deepEqual(untar(tar([])), []);
  assert.deepEqual(untar(new Uint8Array(0)), []);
});

test('gunzip reverses gzip', async () => {
  const gz = new Uint8Array(await new Response(new Blob([enc('abc')]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  assert.equal(dec(await gunzip(gz)), 'abc');
});
