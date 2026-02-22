// src/types.ts

export interface Note {
  id: string;
  title: string;
  body: string;
  /** ISO-8601 date string */
  updatedAt: string;
  createdAt: string;
}

export type AppTab = "code" | "library" | "contribution" | "settings";

export type SettingsSection =
  | "editor"
  | "theme"
  | "files"
  | "keybinds"
  | "opiumware"
  | "version";

export type AppTheme =
  | "dark"
  | "light"
  | "midnight"
  | "forest"
  | "sepia"
  | "ocean"
  | "dracula"
  | "rose";

export interface EditorSettings {
  wordWrap: boolean;
  smoothTyping: boolean;
  showMinimap: boolean;
  showLineNumbers: boolean;
  relativeLineNumbers: boolean;
  spellCheck: boolean;
  autosaveOnBlur: boolean;
  autoAttach: boolean;
  softTabs: boolean;
  trimTrailingWhitespaceOnSave: boolean;
  confirmBeforeDelete: boolean;
  showStatusBar: boolean;
  tabSize: number;
  fontSize: number;
  lineHeight: number;
  editorPadding: number;
  fontFamily: "mono" | "system";
  autosaveMs: number;
}

export interface ScriptEntry {
  id: string;
  title: string;
  game: string;
  views: number;
  verified: boolean;
  paid: boolean;
  keySystem: boolean;
  free: boolean;
  imageUrl: string | null;
  bannerUrl: string | null;
  script: string;
}
