export const OPEN_SETTINGS_SECTION = "nexus-open-settings-section";

/** Open Settings scrolled to one section, e.g. "templates". */
export function openSettingsSection(section: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_SECTION, { detail: section }));
}
