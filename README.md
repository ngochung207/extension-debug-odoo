<div align="center">

<img src="extension/icons/icon-128.png" width="96" height="96" alt="Odoo Debug">

# Odoo Debug

**An in-page debug panel for Odoo developers.**<br>
Inspect records, views, RPC calls, access rights and server performance without leaving the page you are debugging.

[![Release](https://img.shields.io/github/v/release/unclecatvn/extension-debug-odoo?label=release)](https://github.com/unclecatvn/extension-debug-odoo/releases)
[![Build](https://github.com/unclecatvn/extension-debug-odoo/actions/workflows/release.yml/badge.svg)](https://github.com/unclecatvn/extension-debug-odoo/actions/workflows/release.yml)
[![GitHub stars](https://img.shields.io/github/stars/unclecatvn/extension-debug-odoo?style=social)](https://github.com/unclecatvn/extension-debug-odoo)
![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![No build step](https://img.shields.io/badge/build%20step-none-success)

**English** · [Tiếng Việt](README.vi.md)

[Website](https://unclecatvn.github.io/extension-debug-odoo/) · [Install](#installation) · [Features](#features) · [Usage](#usage) · [Privacy](#privacy--permissions) · [Development](#development) · [Changelog](CHANGELOG.md)

<img src="website/screenshots/overview.png" alt="Odoo Debug panel open next to a sales order, half light theme, half dark theme" width="100%">

</div>

## Why

Odoo's built-in developer mode tells you *what* is on screen. Odoo Debug tells you *why*: which module added a field,
which inherited view changed the form, which RPC failed and with what traceback, which record rule blocks a user,
and which request fires 50 SQL queries. Everything lives in a draggable panel on the Odoo page itself, isolated in a
shadow DOM so it never touches Odoo's styles.

## Features

| Tab | What you get |
|---|---|
| **Record** | Identity & metadata (xmlids, `noupdate`, create / write user), every field with its type, value, module, storage, compute / related source, `groups=` and the fields it triggers a recompute of. |
| **View** | Inheritance tree of the current view (primary + extensions, priority, source file), combined arch, action details, form field modifiers (`invisible` / `readonly` / `required`) evaluated like the webclient, *Pick on page*. |
| **RPC** | Live log of JSON-RPC and JSON-2 calls from page load: timing, errors with tracebacks, and a jump to the Security tab for `AccessError`s. |
| **Access** | Session (db, version, `web.base.url`, `test_mode`), effective rights, ACLs, record rules, groups, system parameters (secrets masked) and installed modules. |
| **Security** | Simulate another user's rights, explain rule by rule why an operation is allowed or blocked, user risk audit, fields hidden by `groups=`, instance checks (HTTPS, cookie flags, security headers, database manager). |
| **Perf** | Odoo's built-in server profiler: start / stop, profiled requests, SQL summary with repeated queries (N+1 suspects), slowest queries, speedscope flame graph. |

Plus: click any field name, model or xmlid in the panel to copy it, and <kbd>⌥ Alt</kbd> + click a field on the Odoo
page to copy its technical name.

### Screenshots

<table>
  <tr>
    <td width="50%"><b>View</b>: inheritance tree and combined arch<br><img src="website/screenshots/side-view.png" alt="View tab"></td>
    <td width="50%"><b>RPC</b>: every call with its timing<br><img src="website/screenshots/side-rpc.png" alt="RPC tab"></td>
  </tr>
</table>

**Record** in full screen: from 760px wide, lists become 2-column tables with sticky headers.
<img src="website/screenshots/full-record.png" alt="Record tab in full screen">

**Security**: why an operation is allowed or blocked, rule by rule, plus user risks.
<img src="website/screenshots/full-security.png" alt="Security tab">

**Perf**: profiled requests, with N+1 suspects and the slowest queries of each one.
<img src="website/screenshots/full-perf.png" alt="Perf tab">

<table>
  <tr>
    <td width="50%"><b>Access</b>: session, rights, ACLs<br><img src="website/screenshots/full-access.png" alt="Access tab"></td>
    <td width="50%"><b>Dark theme</b><br><img src="website/screenshots/side-security-dark.png" alt="Dark theme"></td>
  </tr>
</table>

## Installation

The extension is not on the Chrome Web Store yet; install it unpacked (Chrome, Edge, Brave and other Chromium browsers):

1. Download `odoo-debug-v<version>.zip` from [Releases](https://github.com/unclecatvn/extension-debug-odoo/releases) and unzip it
   (or `git clone https://github.com/unclecatvn/extension-debug-odoo.git`).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (from a clone: the `extension/` folder).
4. Open any Odoo page: a round button appears in the bottom-right corner.

## Usage

- **Open / close**: click the round button. Drag it anywhere; its position is kept per Odoo instance. Nothing shows on
  non-Odoo sites, and the toolbar icon is greyed out there.
- **Full screen**: <kbd>⤢</kbd> in the panel header, <kbd>Esc</kbd> or <kbd>⤡</kbd> to leave. Open state and full
  screen survive page reloads.
- **Debug mode**: the `off` / `debug` / `assets` switch in the header reloads Odoo in that mode.
- **Details**: click a list row to open its details (label, storage, module, full value…), again to close.
- **Copy**: click a field name, model, xmlid or parameter in the panel; <kbd>⌥ Alt</kbd> + click a form field, label,
  list cell or column header on the page. Masked secret values still copy the real value.
- **Reload data**: <kbd>⟳</kbd>. Stable server data (session info, `fields_get`, users) is cached until the page
  reloads; ACLs, rules, views and record values are always re-read.
- **Settings**: click the toolbar icon (or right-click → *Options*): language (English, Tiếng Việt), theme
  (system / light / dark), show / hide the panel.

### Compatibility

| | Supported |
|---|---|
| Odoo | 18.0, 19.0 |
| Browser | Chrome and Chromium-based browsers (Manifest V3) |
| Languages | English, Tiếng Việt |

One build serves every version: differences are detected at runtime (does the field / route exist?), never by
comparing version numbers. See [Odoo versions](#odoo-versions).

## Privacy & permissions

Odoo Debug talks only to the Odoo server of the tab you are on, with your own session. It has no backend, no
analytics and sends nothing anywhere else.

| Permission | Why |
|---|---|
| `host_permissions: <all_urls>` | Odoo runs on any domain; the panel only activates on pages detected as Odoo. |
| `scripting` | Read webclient state (current record, view, action) from the page. |
| `cookies` | Report the session cookie's flags (`Secure`, `HttpOnly`, `SameSite`) in the Security tab. The value is never read. |
| `storage` | Language and theme settings. |
| `clipboardWrite` | Copy field names, xmlids and values. |
| `declarativeContent` | Enable the toolbar icon on Odoo pages only. |

Odoo data only reaches the DOM through `textContent`, and the panel page can't be framed by other sites.
`odoo.conf` is never reachable from a browser (Odoo doesn't expose it), and the extension doesn't try.

## Development

No build step, no dependencies: edit, then reload the extension in `chrome://extensions`.

```bash
npm test
```

```bash
npm run i18n
```

`npm test` runs every `tests/*.test.mjs` with Node's built-in runner; `npm run i18n` extracts strings to
`extension/i18n/odoo_debug.pot` and merges them into every `.po`.

### Project structure

```
extension/                 the extension itself: exactly what the release zip contains (Load unpacked this folder)
  manifest.json
  icons/                   extension icons (make-icons.sh)
  i18n/                    odoo_debug.pot + en.po, vi.po (read at runtime, no build step)
  src/
    background.js          toolbar icon enabled on Odoo pages only (declarativeContent)
    popup/                 toolbar popup = options page: language, theme, show/hide the panel
    content/               hook.js (MAIN world, records JSON-RPC), relay.js (forwards to the panel),
                           bubble.js (draggable button + the panel's iframe in a shadow root, ⌥/Alt+click copy)
    panel/                 panel.html / panel.css / main.js: header, tabs, binding to the tab it is embedded in
    shared/                ui.js (DOM, RPC, cached reads), page.js (core page functions), i18n.js, odoo.js, settings.js
    features/<tab>/        one folder per tab: record, view, rpc, access, security, perf
      <tab>.js             the tab UI: render(section, state)
      page.js              functions injected into the Odoo page (self-contained, no imports)
      logic.js             pure logic, no chrome.* / DOM
website/                   project website; screenshots/ is shared with this README
tests/                     *.test.mjs, one per logic module
tools/i18n.mjs             npm run i18n: extract strings → .pot, merge into every .po
```

Paths below are relative to `extension/`.

### Conventions

- Every user-visible string goes through `_t('English text %s', value)` (or `N_('…')` where `_t` can't run, e.g. page
  functions); static HTML uses `data-i18n`. Run `npm run i18n` and translate the new entries in `i18n/vi.po`.
- Stable server data goes through `cached()` in `shared/ui.js`; anything that can change while you debug is always re-read.

### Odoo versions

There is no per-version code. To support another version, check these spots and add a fallback next to the existing one:

| What differs | Where |
|---|---|
| `res.users` group field (`groups_id` → `group_ids` / `all_group_ids` in 19) | `shared/odoo.js` `pickGroupField` |
| JSON-2 API `/json/2/<model>/<method>` (19) | `content/hook.js`, `features/rpc/logic.js` |
| `ir.profile.cpu_duration` (19), profiling wizard | `features/perf/perf.js` |
| Webclient internals: `__WOWL_DEBUG__` action service, `currentState`, `odoo.loader` + `py_js`, form `archInfo` | `shared/page.js`, `features/view/page.js`, `features/security/page.js` |
| `/odoo/…` URLs (older versions: `/web#…`) | `shared/page.js` fallback |
| Server methods: `has_access`, `res.users.has_groups`, `get_metadata`, `get_views`, `/web/become` | `features/access`, `features/security`, `features/record`, `features/view` |

Keep pure fallbacks in `shared/odoo.js` (tested in `tests/odoo.test.mjs` at the repo root). Page functions can't import, so their
fallbacks stay inline. If one spot grows past a couple of branches, that is the time to add an adapter, not before.

### Releasing

Bump `version` in `extension/manifest.json`, add its section to [CHANGELOG.md](CHANGELOG.md) and push to `main`: CI tags
`v<version>` and publishes the zip with that section as release notes. Keep each CHANGELOG bullet on one line: GitHub release notes turn every newline into a line break.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `npm test` passes and `npm run i18n` leaves `extension/i18n/` unchanged (CI checks both).
2. New strings are translated in `extension/i18n/vi.po`.
3. Tested on at least one Odoo instance; say which version in the PR.

Found a bug? [Open an issue](https://github.com/unclecatvn/extension-debug-odoo/issues) with your Odoo version, the
page you were on and, if relevant, the RPC tab's error.

## Support the project

If Odoo Debug saves you time, ⭐ [star it on GitHub](https://github.com/unclecatvn/extension-debug-odoo): it helps other Odoo developers find it.

## Author

Made by **UncleCat** · [unclecatvn.com](https://unclecatvn.com/)
