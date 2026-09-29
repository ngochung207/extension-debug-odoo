# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions: [Semantic Versioning](https://semver.org/). Each release on GitHub uses its section below as release notes.

## [Unreleased]

### Added

- **Translations tab**: exports the translation template (`.pot`) and the `.po` of each language for several apps
  (`;`-separated), and downloads every file to `Downloads/<module>/i18n/`. Needs the new `downloads` permission.

### Changed

- Lists in every tab show one line per row: the details below it (label, storage, module, domain, query…) open on a
  click on the row and close on the next one. Clicking a name still copies it. The wide 2-column table (760px+) keeps
  them in its second column.
- Every collapsible section (user_context, Companies, combined arch, parameters / result, queries…) starts closed.
- Icon without the green dot.
- The Perf tab is now the last one.

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

[0.1.0]: https://github.com/unclecatvn/extension-debug-odoo/releases/tag/v0.1.0
