// The CustomEvents the MAIN world (rpc-recorder, injected functions) and the ISOLATED world (rpc-relay, launcher)
// exchange on the page's document: both sides type-check against this (tsconfig.page.json, tsconfig.content.json).

declare global {
  interface DocumentEventMap {
    'odoo-debug-rpc': CustomEvent<string>; // rpc-recorder → rpc-relay: a RawRpc as JSON text
    'odoo-debug-pick': CustomEvent<string>; // view picker (injected) → rpc-relay: a field name ('' = cancelled)
    'odoo-debug-ready': CustomEvent<string>; // rpc-recorder → launcher: this is Odoo, with that debug mode
  }
}

export {};
