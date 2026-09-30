// Toolbar icon: greyed out everywhere, enabled only on Odoo pages (Chrome can't hide a pinned icon per site).
// declarativeContent re-checks every page load and navigation by itself. Clicking it opens src/popup/.
chrome.action.disable();

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      // webclient (/odoo, /web) or any frontend page: login, portal, website (web.frontend_layout's #wrapwrap)
      conditions: ['body.o_web_client', '#wrapwrap'].map((sel) => new chrome.declarativeContent.PageStateMatcher({ css: [sel] })),
      actions: [new chrome.declarativeContent.ShowAction()],
    }]);
  });
});

// Keyboard shortcuts (manifest "commands", changed in chrome://extensions/shortcuts). Odoo pages only: elsewhere the
// content script isn't listening and window.odoo is missing, so both do nothing.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;
  if (command === 'toggle-panel') chrome.tabs.sendMessage(tab.id, { type: 'odoo-toggle' }).catch(() => {});
  if (command === 'toggle-debug') {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: pageToggleDebug }).catch(() => {});
  }
});

/** Debug off → on, on (or assets) → off. Self-contained: runs in the page. */
function pageToggleDebug() {
  if (typeof window.odoo?.csrf_token !== 'string') return;
  const u = new URL(location.href);
  u.searchParams.set('debug', window.odoo.debug ? '0' : '1');
  location.href = u.toString();
}
