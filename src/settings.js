import { $, $$ } from './dom.js';
import { loadPreferences, defaultPreferences, preferencesKey } from './preferences.js';

export function setupAppearance(onMeasure) {
  let prefs = loadPreferences(localStorage);
  function applyPrefs() {
    document.body.classList.toggle('dark', prefs.dark);
    document.documentElement.style.setProperty('--font-size', (16 * prefs.zoom) / 100 + 'px');
    document.documentElement.style.setProperty('--reading-line-height', prefs.spacing);
    $('#zoom-label').textContent = prefs.zoom + '%';
    $('#setting-theme').value = prefs.dark ? 'dark' : 'light';
    $('#setting-zoom').value = prefs.zoom;
    $('#setting-zoom-value').value = prefs.zoom + '%';
    $('#setting-spacing').value = String(prefs.spacing);
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(prefs));
      $('#settings-status').textContent = '更改即时生效，自动保存在本机。';
    } catch {
      $('#settings-status').textContent = '更改已生效，但本机偏好保存失败。';
    }
    onMeasure();
  }
  $('#zoom-in').onclick = () => {
    prefs.zoom = Math.min(150, prefs.zoom + 10);
    applyPrefs();
  };
  $('#zoom-out').onclick = () => {
    prefs.zoom = Math.max(80, prefs.zoom - 10);
    applyPrefs();
  };
  $('#setting-theme').onchange = (e) => {
    prefs.dark = e.target.value === 'dark';
    applyPrefs();
  };
  $('#setting-zoom').oninput = (e) => {
    prefs.zoom = Number(e.target.value);
    applyPrefs();
  };
  $('#setting-spacing').onchange = (e) => {
    prefs.spacing = Number(e.target.value);
    applyPrefs();
  };
  $('#close-settings').onclick = $('#done-settings').onclick = () => $('#settings-dialog').close();
  $('#reset-settings').onclick = () => {
    prefs = { ...defaultPreferences };
    applyPrefs();
  };
  return {
    apply: applyPrefs,
    setTheme(dark) {
      prefs.dark = !!dark;
      applyPrefs();
    },
    toggleTheme() {
      prefs.dark = !prefs.dark;
      applyPrefs();
    },
  };
}

export function setupSettingsTabs(shortcuts) {
  function selectSettingsTab(tab) {
    shortcuts.cancel();
    $$('[data-settings-tab]').forEach((b) => {
      const selected = b === tab;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
      $('#' + b.dataset.settingsTab).hidden = !selected;
    });
  }
  $$('[data-settings-tab]').forEach((tab) => {
    tab.onclick = () => selectSettingsTab(tab);
    tab.onkeydown = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const tabs = $$('[data-settings-tab]');
        const next =
          e.key === 'Home'
            ? tabs[0]
            : e.key === 'End'
              ? tabs.at(-1)
              : tabs[
                  (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                    tabs.length
                ];
        selectSettingsTab(next);
        next.focus();
      }
    };
  });
}
