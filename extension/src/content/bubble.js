// ISOLATED-world content script: a draggable Odoo Debug button, on the bottom edge of the page until dragged elsewhere
// (dropped back on that edge, it sticks to it again). Clicking it opens the panel (src/panel/panel.html) in an iframe
// next to it, always on the bottom edge. Shown on Odoo pages only; the toolbar popup toggles it too.
// Also: ⌥/Alt + click on a field of the page copies its technical name.
(() => {
  const SIZE = 40; // button, px
  const GAP = 8;
  const SNAP = 24; // dropped this close to the bottom edge: the button sticks to it again
  const POS_KEY = 'odoo-debug-pos'; // localStorage of the site, one per Odoo instance: { x, y, bottom } (bottom: on the bottom edge)
  const OPEN_KEY = 'odoo-debug-open'; // sessionStorage: the panel reopens after a reload (debug switch, /web/become)
  const FULL_KEY = 'odoo-debug-full'; // sessionStorage too: full screen survives a reload
  const store = (s, k, v) => { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch { /* storage blocked */ } };
  const load = (s, k) => { try { return s.getItem(k); } catch { return null; } };

  let root, btn, frame, pos;
  let full = false;

  function mount() {
    if (btn) return;
    const host = document.createElement('odoo-debug-root');
    root = host.attachShadow({ mode: 'closed' }); // Odoo's CSS can't reach in, ours can't leak out
    root.innerHTML = `<style>
      :host { all: initial; }
      button { position: fixed; z-index: 2147483647; width: ${SIZE}px; height: ${SIZE}px; padding: 0; border: 0; border-radius: 50%;
        background: #714b67; box-shadow: 0 2px 8px rgba(0,0,0,.35); cursor: grab; touch-action: none; display: grid; place-items: center; }
      button:active { cursor: grabbing; }
      button:focus-visible { outline: 3px solid #d5a6c8; outline-offset: 2px; }
      img { width: 24px; height: 24px; pointer-events: none; }
      .frame { position: fixed; z-index: 2147483646; width: 420px; height: min(720px, calc(100vh - ${2 * GAP}px));
        max-width: calc(100vw - ${2 * GAP}px); border-radius: 10px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,.35); }
      .frame[hidden] { display: none; }
      .frame.full { width: calc(100vw - ${2 * GAP}px); height: calc(100vh - ${2 * GAP}px); max-width: none; }
      iframe { display: block; width: 100%; height: 100%; border: 0; }
      .toast { position: fixed; z-index: 2147483647; padding: 4px 8px; border-radius: 6px; pointer-events: none;
        background: #1f1d24; color: #fff; font: 600 12px ui-monospace, Menlo, monospace; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
    </style><button type="button" title="Odoo Debug · ⌥/Alt + click a field: copy its name" aria-label="Odoo Debug" aria-expanded="false"><img alt=""></button><div class="frame" hidden></div>`;
    btn = root.querySelector('button');
    frame = root.querySelector('.frame');
    root.querySelector('img').src = chrome.runtime.getURL('icons/icon-48.png');
    document.documentElement.append(host);

    try { pos = JSON.parse(load(localStorage, POS_KEY)); } catch { /* bad value */ }
    if (pos && typeof pos.bottom !== 'boolean') pos = { x: pos.x, bottom: true }; // saved by a version before the bottom edge
    place();
    addEventListener('resize', place);
    addEventListener('click', altClick, true); // capture: before Odoo opens the record / focuses the input

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !pos) return;
      const at = btn.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, px: at.left, py: at.top };
      let moved = false;
      btn.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return; // a click wobbles a little
        moved = true;
        pos = { x: start.px + dx, y: start.py + dy, bottom: false };
        place();
      };
      const up = (ev) => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointercancel', up);
        if (moved) {
          if (pos.y >= innerHeight - SIZE - GAP - SNAP) pos = { x: pos.x, bottom: true }; // back on the bottom edge
          place();
          store(localStorage, POS_KEY, JSON.stringify(pos));
        }
        else if (ev.type === 'pointerup') toggle();
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    });
    btn.addEventListener('click', (e) => { if (e.detail === 0) toggle(); }); // keyboard (Enter / Space)

    if (load(sessionStorage, FULL_KEY)) setFull(true);
    if (load(sessionStorage, OPEN_KEY)) toggle(true);
  }

  /** Keeps the button on screen (on the bottom edge unless dragged away) and the panel beside it, bottom-aligned, on the side with more room. */
  function place() {
    if (!innerWidth) return; // no layout yet (e.g. a tab opened in the background): the resize listener comes back
    if (!Number.isFinite(pos?.x)) pos = { x: innerWidth - SIZE - 16, bottom: true }; // default: bottom right
    const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
    pos.x = clamp(pos.x, GAP, innerWidth - SIZE - GAP);
    if (pos.bottom) Object.assign(btn.style, { left: `${pos.x}px`, top: '', bottom: `${GAP}px` }); // follows the edge on resize
    else Object.assign(btn.style, { left: `${pos.x}px`, top: `${clamp(pos.y, GAP, innerHeight - SIZE - GAP)}px`, bottom: '' });
    if (frame.hidden) return;
    if (full) return Object.assign(frame.style, { left: `${GAP}px`, top: `${GAP}px`, bottom: '' });
    const w = frame.offsetWidth;
    const left = pos.x + SIZE / 2 > innerWidth / 2 ? pos.x - w - GAP : pos.x + SIZE + GAP;
    // bottom, not top: pinned to the bottom of the window, like the button, whatever its height (devtools, resize);
    // the CSS height (at most 100vh - 2 gaps) keeps the header on screen
    Object.assign(frame.style, { left: `${clamp(left, GAP, innerWidth - w - GAP)}px`, top: 'auto', bottom: `${GAP}px` });
  }

  /** Technical name of the field under `t`: form widget (or its label), list cell or list column header. */
  function fieldName(t) {
    const label = t.closest?.('label[for]');
    const n = ((label && document.getElementById(label.htmlFor)) || t).closest?.('.o_field_widget[name], td.o_data_cell[name], th[data-name]');
    return n ? n.getAttribute('name') || n.dataset.name : null;
  }

  async function altClick(e) {
    if (!e.altKey || e.button !== 0) return;
    const name = fieldName(e.target);
    if (!name) return;
    e.preventDefault(); // ⌥+click on a link would download it
    e.stopImmediatePropagation();
    const at = { x: e.clientX, y: e.clientY };
    toast(await copy(name) ? `✓ ${name}` : `✗ ${name}`, at);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* not a secure context (http://), or refused */ }
    const prev = document.activeElement;
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    prev?.focus?.();
    return ok;
  }

  function toast(text, at) {
    const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
    Object.assign(t.style, { left: `${Math.min(at.x + 12, innerWidth - 240)}px`, top: `${at.y + 12}px` });
    root.append(t);
    setTimeout(() => t.remove(), 1200);
  }

  function toggle(open = frame.hidden) {
    // The panel is only created on first open: nothing runs (no RPC) until then.
    if (open && !frame.firstChild) {
      frame.append(Object.assign(document.createElement('iframe'), { src: chrome.runtime.getURL('src/panel/panel.html'), title: 'Odoo Debug', allow: 'clipboard-write' }));
    }
    frame.hidden = !open;
    btn.setAttribute('aria-expanded', open);
    store(sessionStorage, OPEN_KEY, open ? '1' : null);
    place();
  }

  /** Full screen: the panel covers the page (the button stays on top, to close it). */
  function setFull(on) {
    full = on;
    frame.classList.toggle('full', on);
    store(sessionStorage, FULL_KEY, on ? '1' : null);
    place();
  }

  document.addEventListener('odoo-debug-ready', mount);
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'odoo-full') { // from the panel: { on } sets it, no `on` just asks; the answer is the current state
      if (btn && typeof msg.on === 'boolean') setFull(msg.on);
      return reply(full);
    }
    if (msg?.type !== 'odoo-toggle') return;
    if (btn) toggle();
    else { mount(); toggle(true); }
  });
})();
