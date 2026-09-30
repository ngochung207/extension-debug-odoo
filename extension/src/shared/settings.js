// Settings (language, theme) in chrome.storage.local: shared by every panel and the toolbar popup (src/popup/).
// auto / light / dark: Odoo's colors; the others are editor color themes, like VS Code's (palettes in ui.css, [data-theme=…])
export const THEMES = ['auto', 'light', 'dark', 'github-light', 'solarized-light', 'github-dark', 'dracula', 'monokai', 'one-dark', 'nord', 'solarized-dark', 'catppuccin'];

export const applyTheme = (theme) => {
  if (theme !== 'auto' && THEMES.includes(theme)) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
};

/** Reads the settings and applies the theme; call before the first render. Later changes apply live. → { lang?, theme? } */
export async function loadSettings() {
  const saved = await chrome.storage.local.get(['lang', 'theme']).catch(() => ({}));
  applyTheme(saved.theme);
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.theme) applyTheme(ch.theme.newValue);
    if (ch.lang) location.reload(); // everything is rendered through _t: reload is simplest
  });
  return saved;
}
