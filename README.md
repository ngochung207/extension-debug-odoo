# Odoo Debug — TypeScript 7 rewrite

The [Odoo Debug](../extension-debug-odoo) Chrome extension (an in-page debug panel for Odoo developers), rewritten in
TypeScript 7 with an esbuild bundle, one tab at a time, with the Odoo version differences in one place.

## Status

| Part | State |
|---|---|
| Toolchain: TS 7 (one project per execution context), esbuild, Node tests, CI checks | ✅ |
| Odoo version layer (`src/odoo/`): detection, adapters 18.0 / 19.0, self-check | ✅ |
| Entrypoints: service worker, RPC recorder + relay, launcher button, panel shell, popup | ✅ |
| Tabs: Record · View · RPC · Code · Security · Translations · Apps · Perf | ⏳ not ported (placeholder) |
| E2E against Odoo 18.0 / 19.0 (Docker) | ⏳ |

## Develop

```sh
npm install
npm run watch        # dist/ rebuilt on save; chrome://extensions → Load unpacked → dist/ (⟳ after a change)
npm run check        # typecheck + tests + build + injected / markup / imports checks (what CI runs)
npm run i18n         # .pot / .po after adding a translatable string
```

Disable the JavaScript version of Odoo Debug while this one is loaded: both would add their button to Odoo pages.

## Layout

```
src/
  entrypoints/                 what the manifest loads, one folder each (index.*); nothing else lives here
    background/                  service worker: toolbar icon, shortcuts, content scripts injected again after an update
    rpc-recorder/                MAIN world, document_start: records the page's JSON-RPC calls
    rpc-relay/                   ISOLATED world: forwards what the MAIN world reports to the panel
    launcher/                    ISOLATED world: the Odoo Debug button and the panel frame (+ launcher.tpl.html, launcher.css)
    panel/                       the panel shell: header, tab bar (index.html, index.ts, panel.tpl.html)
    popup/                       toolbar popup and options page (index.html, index.ts, popup.tpl.html)
  features/                    the panel's tabs
    registry.ts                  the tab list and the TabModule contract
    <tab>/                       <tab>.tab.ts · <tab>.tpl.html · <tab>.logic.ts · <tab>.injected.ts
  odoo/                        everything about Odoo: version.ts, adapter.ts, adapters/v18.ts · v19.ts, detect.ts,
                               models.ts (records), rpc.ts (JSON-RPC client), reads.ts (shared server reads)
  injected/                    functions run IN the Odoo page, shared by several features: page-state, json-rpc,
                               debug-mode, navigation
  extension/                   talking to Chrome: run-in-tab, page-cache, settings, cookies
  ui/                          the panel's UI kit: template.ts, components.ts + components.tpl.html, panel.css,
                               form-state.ts, dom.ts
  i18n/                        _t(), .po loading
  contracts/                   what every context shares: json.ts, messages.ts (pure)
  types/                       ambient declarations only: odoo-page.d.ts (window.odoo), page-events.d.ts, assets.d.ts
tests/
  unit/                        unit tests, the same tree as src/: tests/unit/odoo/version.test.ts ↔ src/odoo/version.ts
  e2e/                         against a real Odoo 18 / 19 (Docker), with the first ported tab
static/                        manifest.json, icons, i18n/*.po: copied to dist/ as they are
assets/                        sources of static files (icon.svg → static/icons/*.png)
scripts/                       build, check-page-fns, check-markup, check-imports, i18n (run by Node as .ts)
```

Dependencies point one way: `entrypoints → features → ui · odoo · extension · injected · i18n → contracts`. A tab never
imports another tab; only `features/registry.ts` imports the tabs (`npm run check:imports`).

## Execution contexts

An MV3 extension runs in several contexts, each with its own APIs. Each is a TypeScript project
(`tsconfig.<context>.json`, built together by `tsc -b`), so a file is checked against what **its** context provides:

| Context | Files | May use | The compiler rejects |
|---|---|---|---|
| `page` | `entrypoints/rpc-recorder`, `injected/`, `*.injected.ts` | DOM, `window.odoo` | `chrome.*` (absent in the MAIN world) |
| `worker` | `entrypoints/background` | `chrome.*` | the DOM (a worker has none) |
| `content` | `entrypoints/launcher`, `entrypoints/rpc-relay` | DOM, `chrome.runtime` / `storage` | `window.odoo` (invisible from the ISOLATED world) |
| `app` | `entrypoints/panel`, `entrypoints/popup`, `features/`, `ui/`, `odoo/`, `extension/`, `i18n/` | DOM, every `chrome.*` | `window.odoo` (only through injected functions) |
| `contracts` · `dom` | `contracts/` · `ui/template.ts` | nothing · the DOM | anything else |
| `node` | `scripts/`, `tests/` | Node | — |

## Tests

`src/` holds only code that ships. Tests live in `tests/`: `tests/unit/` mirrors the `src/` tree (the test of
`src/<path>/<name>.ts` is `tests/unit/<path>/<name>.test.ts`), `tests/e2e/` drives the built extension against a real
Odoo. Unit tests cover pure code (`*.logic.ts`, `odoo/`, `contracts/`…); what needs Chrome or Odoo is the e2e's job.

## File names

The suffix says what a file is and where it runs:

| Suffix | Is | Context |
|---|---|---|
| `index.ts` | an entrypoint (only under `entrypoints/`) | its own |
| `*.tab.ts` | a tab: renders it, wires its events (`TabModule`) | app |
| `*.logic.ts` | pure functions of a feature, unit-tested | app |
| `*.injected.ts` | functions run in the Odoo page | page |
| `*.tpl.html` | `<template>` markup the code next to it clones | — |

No barrel `index.ts` re-exporting a folder: import the file you need. Named exports only, except the text of
`*.tpl.html` / imported `.css` files (a default export by the bundler, declared in `types/assets.d.ts`).

## Odoo versions

Supported: **18.0** and **19.0**. `src/odoo/` holds every difference between them:

- `version.ts` reads `server_version_info` and picks the adapter: the version's own, else the closest older one
  (saas~18.x → 18, a newer major → 19, flagged *untested* in the header), else the oldest (*unsupported*).
- `adapter.ts` is the contract; `adapters/v18.ts` and `adapters/v19.ts` implement it, each value checked against that
  version's sources.
- `detect.ts` → `odoo()` detects once per page load, then **self-checks** the fields the adapter relies on with
  `fields_get`: a customized database that differs from its major shows in the header instead of failing in a tab.

Features never test a version number or probe a field themselves: they read `odoo().adapter`. A difference with no
equivalent at all on a version is declared by the tab (`supports()` in `features/registry.ts`) and shown instead of
the tab. Adding a version = a new `adapters/v<major>.ts` + its number in `SUPPORTED`; the compiler lists what it must
answer.

## Rules

- **Markup in templates, behaviour in code.** Every piece of UI is a `<template data-tpl="name">` in a `*.tpl.html`
  next to the code that uses it; the elements the code fills carry `data-ref="key"`. Code clones it with
  `ui/template.ts` and fills the refs, whose element types it declares (`tpl('pill', { pill: HTMLSpanElement })`) and
  which are checked on the first clone. Labels are translated with `data-i18n` in the template. `npm run check:markup`
  fails on `innerHTML` / `createElement` in a `.ts` (except non-UI helpers marked `markup-ok:`).
- **Injected functions** reach the Odoo page as their own source text only: nothing from outside them but browser
  globals and types. `npm run check:page` bundles them as the build does and fails otherwise.
- Odoo data reaches the DOM through `textContent` only.
- `entrypoints/rpc-recorder` runs on every site: no imports but types (the build fails above 4 KB).
- Erasable TypeScript only (no `enum`, `namespace`, parameter properties): Node runs tests and scripts as they are.
