// ISOLATED-world content script: forwards RPCs recorded by hook.js (and field picks) to the panel.
document.addEventListener('odoo-debug-rpc', (e) => {
  if (!chrome.runtime?.id) return; // orphaned by an update: the copy injected again relays
  chrome.runtime.sendMessage({ type: 'odoo-rpc', raw: e.detail }).catch(() => {}); // panel closed → drop (hook.js keeps a buffer)
});
document.addEventListener('odoo-debug-pick', (e) => {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage({ type: 'odoo-pick', name: e.detail }).catch(() => {});
});
