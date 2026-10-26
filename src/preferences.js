// Retain the original key so existing installations keep their appearance settings.
export const preferencesKey = 'field-notes-prefs';
export const defaultPreferences = Object.freeze({ dark: false, zoom: 100, spacing: 1.9 });

export function loadPreferences(storage) {
  let saved;
  try {
    saved = JSON.parse(storage.getItem(preferencesKey));
  } catch {
    // Unavailable storage or malformed data must not prevent the editor from opening.
  }
  const preferences = { ...defaultPreferences, ...saved };
  preferences.dark = preferences.dark === true;
  preferences.zoom = Number.isFinite(preferences.zoom)
    ? Math.max(80, Math.min(150, Math.round(preferences.zoom / 10) * 10))
    : defaultPreferences.zoom;
  preferences.spacing = [1.6, 1.9, 2.2].includes(preferences.spacing)
    ? preferences.spacing
    : defaultPreferences.spacing;
  return preferences;
}
