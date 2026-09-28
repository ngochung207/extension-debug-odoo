// ISOLATED-world content script: forwards RPCs recorded by hook.js (and field picks) to the panel.
document.addEventListener('odoo-debug-rpc', (e) => {
  chrome.runtime.sendMessage({ type: 'odoo-rpc', raw: e.detail }).catch(() => {}); // panel closed → drop (hook.js keeps a buffer)
});
document.addEventListener('odoo-debug-pick', (e) => {
  chrome.runtime.sendMessage({ type: 'odoo-pick', name: e.detail }).catch(() => {});
});
