// ISOLATED-world content script: forwards what the MAIN world reports (RPCs recorded by rpc-recorder, fields picked on
// the page) to the panel.
import type { ExtMessage } from '../../contracts/messages.ts';

const forward = (msg: ExtMessage) => {
  if (!chrome.runtime?.id) return; // orphaned by an update: the copy injected again relays
  chrome.runtime.sendMessage(msg).catch(() => {}); // panel closed → dropped (rpc-recorder keeps a buffer)
};
document.addEventListener('odoo-debug-rpc', (e) => forward({ type: 'odoo-rpc', raw: e.detail }));
document.addEventListener('odoo-debug-pick', (e) => forward({ type: 'odoo-pick', name: e.detail }));
