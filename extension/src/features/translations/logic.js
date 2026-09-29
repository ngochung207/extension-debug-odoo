// Pure helpers, no chrome.* / DOM: tested by tests/translations.test.mjs.

/** The empty template, always exported: <module>/i18n/<module>.pot (lang key of base.language.export). */
export const NEW_LANG = '__new__';

/** Wanted codes → active res.lang codes, matched case-insensitively (vi_vn → vi_VN); the rest in `unknown`. */
export function resolveLangs(wanted, active) {
  const byLower = new Map(active.map((code) => [code.toLowerCase(), code]));
  const codes = [], unknown = [];
  for (const w of wanted) {
    const code = byLower.get(w.toLowerCase());
    if (!code) unknown.push(w);
    else if (!codes.includes(code)) codes.push(code);
  }
  return { codes, unknown };
}

/** Wanted names + ir.module.module rows ({ id, name, state }) → installed ids, and what is missing / not installed. */
export function resolveModules(wanted, rows) {
  const byName = new Map(rows.map((m) => [m.name, m]));
  const ids = [], missing = [], notInstalled = [];
  for (const name of wanted) {
    const m = byName.get(name);
    if (!m) missing.push(name);
    else if (m.state !== 'installed') notInstalled.push(name);
    else ids.push(m.id);
  }
  return { ids, missing, notInstalled };
}

/** Binary field value (base64, Odoo wraps it every 76 chars) → bytes. */
export function b64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** .tgz bytes → .tar bytes. */
export async function gunzip(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

const BLOCK = 512;
const text = (bytes) => new TextDecoder().decode(bytes).replace(/\0.*$/s, '');

/** Regular files of a tar (ustar, with pax path records: what Python's tarfile writes) → [{ name, data }]. */
export function untar(tar) {
  const files = [];
  let off = 0, paxPath = null;
  while (off + BLOCK <= tar.length) {
    const h = tar.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break; // end of archive
    const size = parseInt(text(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48); // NUL = '0', a regular file
    const data = tar.subarray(off + BLOCK, off + BLOCK + size);
    if (type === 'x') paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data))?.[1] ?? null;
    else {
      if (type === '0') {
        const prefix = text(h.subarray(345, 500));
        files.push({ name: paxPath ?? (prefix ? `${prefix}/` : '') + text(h.subarray(0, 100)), data });
      }
      paxPath = null;
    }
    off += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}
