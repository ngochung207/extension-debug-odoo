// Functions injected into the Odoo tab (MAIN world) via chrome.scripting.executeScript.
// Each must be self-contained: only its source text is sent to the page.

export function pageRpcLog() {
  return window.__odooDebugHook?.buf.slice() || [];
}
