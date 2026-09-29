# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions: [Semantic Versioning](https://semver.org/). Each release on GitHub uses its section below as release notes.

## [1.0.0] - 2026-09-29

### Added

- **Code tab › ORM Console**: JavaScript with an ORM-like `env` (`env['sale.order'].search(…)`, `.read()`, `.mapped()`, `.write()`, any public method…) run in the Odoo page with the logged-in session, so the server applies that user's access rights, record rules and active companies. Fields read like in Python (`return rec.state`, `rec.partner_id.name`, prefetched when iterating a recordset) and written by assignment (`rec.state = 'sent'`, a `write` sent in order with the other calls). Suggestions while typing: the models of the installed modules after `env['`, their fields in strings and after a dot (following relations: `partner_id.country_id.`), the recordset methods. Read-only by default (writes are blocked before they are sent); **Allow Writes** lets them through, each committed at once. Results as a table, prints, errors with line and server traceback, and the list of calls made. The code is kept per Odoo server (origin). With **Auto Refresh** ticked (offered once Allow Writes is), the view on screen reloads its data after writes (Odoo's `soft_reload`, like web_refresher).
- **Minimize** (− in the panel header): hides the panel back to the round button, which reopens it as it was.

### Changed

- Every tab in sight, nothing to scroll: beside the page the 9 tabs are laid out 5 + 4, in full screen on one row.
- The debug mode switch (`off` / `debug` / `assets`) moves from the panel header to the toolbar popup, which shows the page's current mode.
- Tabs have no side padding (cards edge to edge), and a tab with a single card shows it without a title to click.
- **Perf tab** in one card: status and Start / Stop on one line, a one-line note, then the requests with a filter and a count. Rows read like the RPC tab (method + model), with id · time · CPU below; the panel's own requests (ir.profile reads, session info) are left out.
- **Apps tab** in one card: the modules to act on are typed or ticked in the list below the input, which searches every module (installed or not, with its state) as you type; with nothing typed it lists the installed modules, as the former Installed modules card did.
- **Translations tab**: one input for the apps to export: the word being typed searches the installed modules (name or title) listed below it, ticking one puts its name in the input, Enter picks the match; typing the names still works. Languages are toggles (the active ones, the choice remembered), next to a locked Template (.pot) chip; the list takes the panel's height and a full-width button at the bottom says how many files it will download.

## [0.1.1] - 2026-09-29

### Added

- **Translations tab**: exports the translation template (`.pot`) and the `.po` of each language for several apps (`;`-separated), and downloads every file to `Downloads/<module>/i18n/`. Needs the new `downloads` permission.
- **Switch to This User** (Security › View as user): opens an incognito window on the current page, at Odoo's login of the picked user (their password is typed there); the current session is untouched. With the OCA module `impersonate_login`, "Impersonate in This Session" and "Back to My User" are offered too.
- **Apps tab**: for a `;`-separated list of modules, Activate (Update Apps List, then install them all with their dependencies), Upgrade, or Open Forms (one new tab per module); each module's state is listed below. The Installed modules card moved there from the Access tab.

### Changed

- Lists in every tab show one line per row: the details below it (label, storage, module, domain, query…) open on a click on the row and close on the next one. Clicking a name still copies it. The wide 2-column table (760px+) keeps them in its second column.
- Every collapsible section (user_context, Companies, combined arch, parameters / result, queries…) starts closed.
- Every card of every tab starts closed and loads its data only once opened; the cards left open (or closed) stay so after ⟳ Reload Data, a reload of the page or the panel.
- Rows with an action button (↗) keep it in a right-hand column, lined up on every row.
- Button labels and tooltips capitalised like Odoo's ("Export & Download", "Reload Data"…). ⟳ Reload Data also empties the Translations form.
- Icon without the green dot.
- The Perf tab is now the last one.
- The panel is pinned to the bottom of the window (beside the button), so its header never goes off screen. The button sits on the bottom edge too until dragged elsewhere; dropped back near that edge, it sticks to it again.
- After a reload, the panel comes back on the tab you were on, scrolled where you left it (each tab keeps its own position).

## [0.1.0] - 2026-09-28

First public release. Chrome extension (Manifest V3) for Odoo 18 / 19 developers, no build step.

### Added

- **In-page panel**: a draggable round button on Odoo pages opens the panel next to it (shadow DOM + iframe, so Odoo's CSS and the panel's never mix). Position kept per Odoo instance; open state and full screen kept across reloads.
- **Full screen** (⤢, Esc to leave). From 760px wide, every list becomes a 2-column table with sticky column names.
- **Record tab**: identity & metadata (xmlids, noupdate, create/write user), every field with its definition, value, module, index, groups, and which fields it triggers a recompute of.
- **View tab**: inheritance tree of the current view (primary + extensions, priority, file), combined arch, action details, form field modifiers (invisible / readonly / required) evaluated like the webclient, "Pick on page".
- **RPC tab**: live log of JSON-RPC and JSON-2 calls, recorded from page load; errors with tracebacks, "why was it blocked?" jump to the Security tab for AccessErrors.
- **Access tab**: session (db, version, web.base.url, test_mode), effective rights, ACLs, record rules, groups, system parameters (secret-looking values masked) and installed modules.
- **Security tab**: simulate another user's rights, explain why an operation is allowed or blocked rule by rule, fields hidden by `groups=`, model configuration audit, instance checks (HTTPS, cookie flags, security headers, database manager, list_db).
- **Perf tab**: Odoo's built-in server profiler: start/stop, profiled requests, SQL summary with repeated queries (N+1 suspects), slowest queries, speedscope link.
- **Copy anywhere**: click a field name, model, xmlid or parameter value in the panel; ⌥/Alt + click a field, label, list cell or column header on the Odoo page to copy its technical name.
- **Toolbar popup** (also the options page): language (English, Tiếng Việt), theme (system / light / dark), show / hide the panel. The toolbar icon is only enabled on Odoo pages.
- **i18n**: gettext `.po` catalogs read at runtime, `npm run i18n` to extract and merge.
- **CI / release**: GitHub Actions run syntax checks, tests and the i18n check; bumping the manifest version on `main` tags and publishes a release zip.

### Security

- Odoo data only reaches the DOM through `textContent`; the session cookie value is never read (flags only).
- The panel page is a `use_dynamic_url` web-accessible resource, so other sites can't frame it.
- `odoo.conf` is not readable from a browser by design; nothing in the extension tries to.

[1.0.0]: https://github.com/unclecatvn/extension-debug-odoo/releases/tag/v1.0.0
[0.1.1]: https://github.com/unclecatvn/extension-debug-odoo/releases/tag/v0.1.1
[0.1.0]: https://github.com/unclecatvn/extension-debug-odoo/releases/tag/v0.1.0
