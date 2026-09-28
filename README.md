# Odoo Debug

In-page debug panel for Odoo 18/19 developers (Chrome, Manifest V3, no build step).

**Install**: download `odoo-debug-v<version>.zip` from [Releases](https://github.com/unclecatvn/extension-debug-odoo/releases),
unzip it, then `chrome://extensions` → Developer mode → Load unpacked → pick the folder. Or clone this repo and load it
directly. What changed: [CHANGELOG.md](CHANGELOG.md).

On Odoo pages a round button appears: drag it anywhere (its position is kept per Odoo instance), click it to open or
close the panel beside it. Nothing shows on other sites, and the toolbar icon is greyed out there.

- ⌥/Alt + click a field on the Odoo page (form field or label, list cell or column header) copies its technical name.
- In the panel, click a field name, model or view xmlid to copy it. Filters stay on top while you scroll.
- ⤢ in the panel header: full screen (Esc or ⤡ to leave); kept across reloads, like the panel being open.
  When the panel is 760px wide or more, lists become 2-column tables (main line | description) with column names
  (sticky with the filter bar): shorter rows.
- Access tab: session (db, version, web.base.url, test_mode), rights, ACLs, rules, groups, system parameters
  (click a key or value to copy it; secret-looking values stay masked but copy the real value) and installed modules. odoo.conf itself is never
  reachable from a browser: Odoo doesn't expose it (it holds admin_passwd / db_password).
- Click the toolbar icon (or right-click → Options): language, theme (system / light / dark), show / hide the panel.

```
manifest.json
icons/                     extension icons (make-icons.sh)
i18n/                      odoo_debug.pot + en.po, vi.po (read at runtime, no build step)
tools/i18n.mjs             npm run i18n: extract strings → .pot, merge into every .po
tests/                     *.test.mjs, one per logic module (npm test)
src/
  background.js            toolbar icon enabled on Odoo pages only (declarativeContent)
  popup/                   toolbar popup = options page: language, theme, show/hide the panel (shared/settings.js)
  content/                 hook.js (MAIN world, records JSON-RPC), relay.js (forwards to the panel),
                           bubble.js (draggable button + the panel's iframe in a shadow root, ⌥/Alt+click copy)
  panel/                   panel.html / panel.css / main.js: header, tabs, binding to the tab it is embedded in
  shared/                  ui.js (DOM, RPC, cached reads), page.js (core page functions), i18n.js, odoo.js
  features/<tab>/          one folder per tab: record, view, rpc, access, security, perf
    <tab>.js               the tab UI: render(section, state)
    page.js                functions injected into the Odoo page (self-contained, no imports)
    logic.js               pure logic, no chrome.* / DOM
```

- `npm test` runs every `tests/*.test.mjs` (node's built-in runner).
- Every user-visible string goes through `_t('English text %s', value)` (or `N_('…')` where `_t` can't run,
  e.g. page functions); static HTML uses `data-i18n`. Then run `npm run i18n` and translate the new entries in `i18n/vi.po`.
- Stable server data (session info, `fields_get`, user list…) goes through `cached()` in `shared/ui.js`: kept until the
  Odoo page reloads or ⟳ is pressed. ACLs, rules, views and record values are always re-read.

## Odoo versions

There is no per-version code: each difference is detected at runtime (does the field / module / route exist?),
never by comparing version numbers, so one build serves 18 and 19. To support another version, check these spots
and add a fallback next to the existing one:

| What differs | Where |
|---|---|
| `res.users` group field (`groups_id` → `group_ids` / `all_group_ids` in 19) | `shared/odoo.js` `pickGroupField` |
| JSON-2 API `/json/2/<model>/<method>` (19) | `content/hook.js`, `features/rpc/logic.js` |
| `ir.profile.cpu_duration` (19), profiling wizard | `features/perf/perf.js` |
| Webclient internals: `__WOWL_DEBUG__` action service, `currentState`, `odoo.loader` + `py_js`, form `archInfo` | `shared/page.js`, `features/view/page.js`, `features/security/page.js` |
| `/odoo/…` URLs (older versions: `/web#…`) | `shared/page.js` fallback |
| Server methods: `has_access`, `res.users.has_groups`, `get_metadata`, `get_views`, `/web/become` | `features/access`, `features/security`, `features/record`, `features/view` |

Keep pure fallbacks in `shared/odoo.js` (tested in `tests/odoo.test.mjs`). Page functions can't import, so their
fallbacks stay inline. If one spot grows past a couple of branches, that is the time to add an adapter, not before.
- Release: bump `version` in `manifest.json`, add its section to `CHANGELOG.md`, push to `main`: CI tags `v<version>`
  and publishes the zip with that section as release notes.
