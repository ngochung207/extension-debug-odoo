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
