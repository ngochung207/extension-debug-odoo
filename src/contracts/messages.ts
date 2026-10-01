// Contract shared by every context: what the extension's parts say to each other. Pure: no DOM, no chrome.*
// (tsconfig.contracts.json). Senders type their message with `satisfies ExtMessage`; receivers check it with
// isExtMessage(): a part that changes a message without the other side failing to type-check is a bug caught here.
// The MAIN ↔ ISOLATED world CustomEvents are typed in types/odoo-page.d.ts (DocumentEventMap).

/** A call recorded by entrypoints/rpc-recorder (bodies cut at 200 KB). `error`: no response at all (network, timeout, abort). */
export interface RawRpc {
  method: string;
  url: string;
  body: string;
  status: number;
  ms: number;
  at: string;
  response: string;
  error?: string;
}

/** chrome.runtime / chrome.tabs messages between the content scripts, the panel and the popup. */
export type ExtMessage =
  | { type: 'odoo-rpc'; raw: string } // rpc-relay → panel: a RawRpc as JSON text
  | { type: 'odoo-pick'; name: string } // rpc-relay → panel: field picked on the page ('' = cancelled)
  | { type: 'odoo-toggle'; open?: boolean } // popup / shortcut / panel → launcher: show or hide the panel (no `open`: toggle)
  | { type: 'odoo-full'; on?: boolean }; // panel → launcher: full screen on / off (no `on`: ask); answer: the state (boolean)

export type ExtMessageType = ExtMessage['type'];

const TYPES: ReadonlySet<string> = new Set<ExtMessageType>(['odoo-rpc', 'odoo-pick', 'odoo-toggle', 'odoo-full']);

/** Messages come from other extensions' pages too (and older copies of ours): checked before use. */
export const isExtMessage = (m: unknown): m is ExtMessage =>
  typeof m === 'object' && m !== null && TYPES.has(String((m as { type?: unknown }).type));
