import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BookMarked,
  Code2,
  Download,
  DollarSign,
  Eraser,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  IndentIncrease,
  Moon,
  Paintbrush2,
  Pilcrow,
  Save,
  Settings2,
  ShieldAlert,
  Sparkles,
  Sun,
  Type,
  Waves,
  WrapText,
  KeyRound,
  LockOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AppTab, AppTheme, EditorSettings, Note, ScriptEntry, SettingsSection } from "../types";

interface EditorProps {
  activeTab: AppTab;
  note: Note | null;
  settingsSection: SettingsSection;
  theme: AppTheme;
  settings: EditorSettings;
  onChange: (body: string) => void;
  onThemeChange: (theme: AppTheme) => void;
  onSettingsChange: (settings: Partial<EditorSettings>) => void;
  onSaveNow: () => void;
  onDownloadCurrentFile: () => void;
  selectedScript: ScriptEntry | null;
  onCreateFileFromScript: (script: ScriptEntry) => void;
}

const themes: Array<{ id: AppTheme; label: string; icon: ReactNode }> = [
  { id: "dark", label: "Dark", icon: <Moon size={14} /> },
  { id: "light", label: "Light", icon: <Sun size={14} /> },
  { id: "midnight", label: "Midnight", icon: <Moon size={14} /> },
  { id: "forest", label: "Forest", icon: <Paintbrush2 size={14} /> },
  { id: "sepia", label: "Sepia", icon: <FileText size={14} /> },
  { id: "ocean", label: "Ocean", icon: <Waves size={14} /> },
  { id: "dracula", label: "Dracula", icon: <Moon size={14} /> },
  { id: "rose", label: "Rose", icon: <Sparkles size={14} /> },
];

export default function Editor({
  activeTab,
  note,
  settingsSection,
  theme,
  settings,
  onChange,
  onThemeChange,
  onSettingsChange,
  onSaveNow,
  onDownloadCurrentFile,
  selectedScript,
  onCreateFileFromScript,
}: EditorProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorLine, setCursorLine] = useState(1);

  useEffect(() => {
    textAreaRef.current?.focus();
  }, [note?.id, activeTab]);

  const settingsContent = useMemo(() => {
    if (settingsSection === "editor") {
      return (
        <div className="ow-settings-panel">
          <h3>
            <Type size={16} />
            Editor Settings
          </h3>
          <label className="ow-setting-row">
            <span>
              <WrapText size={14} />
              Word wrap
            </span>
            <input
              type="checkbox"
              checked={settings.wordWrap}
              onChange={(event) => onSettingsChange({ wordWrap: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              {settings.showLineNumbers ? <Eye size={14} /> : <EyeOff size={14} />}
              Line numbers
            </span>
            <input
              type="checkbox"
              checked={settings.showLineNumbers}
              onChange={(event) => onSettingsChange({ showLineNumbers: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <Eye size={14} />
              Relative line numbers
            </span>
            <input
              type="checkbox"
              checked={settings.relativeLineNumbers}
              onChange={(event) =>
                onSettingsChange({ relativeLineNumbers: event.target.checked })
              }
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <Type size={14} />
              Spellcheck
            </span>
            <input
              type="checkbox"
              checked={settings.spellCheck}
              onChange={(event) => onSettingsChange({ spellCheck: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <IndentIncrease size={14} />
              Soft tabs
            </span>
            <input
              type="checkbox"
              checked={settings.softTabs}
              onChange={(event) => onSettingsChange({ softTabs: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <IndentIncrease size={14} />
              Tab size
            </span>
            <input
              type="number"
              min={2}
              max={8}
              value={settings.tabSize}
              onChange={(event) =>
                onSettingsChange({
                  tabSize: Math.max(2, Math.min(8, Number(event.target.value) || 2)),
                })
              }
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <Type size={14} />
              Font family
            </span>
            <select
              value={settings.fontFamily}
              onChange={(event) =>
                onSettingsChange({
                  fontFamily: event.target.value === "system" ? "system" : "mono",
                })
              }
            >
              <option value="mono">Monospace</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="ow-setting-row">
            <span>
              <Type size={14} />
              Font size
            </span>
            <input
              type="number"
              min={12}
              max={24}
              value={settings.fontSize}
              onChange={(event) =>
                onSettingsChange({
                  fontSize: Math.max(12, Math.min(24, Number(event.target.value) || 14)),
                })
              }
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <Pilcrow size={14} />
              Editor padding
            </span>
            <input
              type="number"
              min={8}
              max={40}
              value={settings.editorPadding}
              onChange={(event) =>
                onSettingsChange({
                  editorPadding: Math.max(8, Math.min(40, Number(event.target.value) || 14)),
                })
              }
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <Type size={14} />
              Line height
            </span>
            <input
              type="number"
              min={1.2}
              max={2.2}
              step={0.05}
              value={settings.lineHeight}
              onChange={(event) =>
                onSettingsChange({
                  lineHeight: Math.max(1.2, Math.min(2.2, Number(event.target.value) || 1.55)),
                })
              }
            />
          </label>
        </div>
      );
    }
    if (settingsSection === "theme") {
      return (
        <div className="ow-settings-panel">
          <h3>
            <Paintbrush2 size={16} />
            Theme
          </h3>
          <div className="ow-theme-buttons">
            {themes.map((item) => (
              <button
                key={item.id}
                className={theme === item.id ? "active" : ""}
                onClick={() => onThemeChange(item.id)}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          <p>Theme applies to both sidebars and editor pane.</p>
        </div>
      );
    }
    if (settingsSection === "keybinds") {
      return (
        <div className="ow-settings-panel">
          <h3>
            <Code2 size={16} />
            Keybinds
          </h3>
          <p>`Ctrl/Cmd + S`: Save now</p>
          <p>`Tab`: Insert tab/spaces</p>
          <p>`Right click`: File context menu actions</p>
        </div>
      );
    }
    return (
      <div className="ow-settings-panel">
        <h3>
          <Save size={16} />
          File Autosave
        </h3>
        <label className="ow-setting-row">
          <span>
            <Save size={14} />
            Save on blur
          </span>
          <input
            type="checkbox"
            checked={settings.autosaveOnBlur}
            onChange={(event) => onSettingsChange({ autosaveOnBlur: event.target.checked })}
          />
        </label>
        <label className="ow-setting-row">
          <span>
            <Save size={14} />
            Autosave delay (ms)
          </span>
          <input
            type="number"
            min={200}
            max={5000}
            step={100}
            value={settings.autosaveMs}
            onChange={(event) =>
              onSettingsChange({
                autosaveMs: Math.max(200, Math.min(5000, Number(event.target.value) || 300)),
              })
            }
          />
        </label>
        <label className="ow-setting-row">
          <span>
            <Eraser size={14} />
            Trim trailing whitespace
          </span>
          <input
            type="checkbox"
            checked={settings.trimTrailingWhitespaceOnSave}
            onChange={(event) =>
              onSettingsChange({ trimTrailingWhitespaceOnSave: event.target.checked })
            }
          />
        </label>
        <label className="ow-setting-row">
          <span>
            <ShieldAlert size={14} />
            Confirm before delete
          </span>
          <input
            type="checkbox"
            checked={settings.confirmBeforeDelete}
            onChange={(event) =>
              onSettingsChange({ confirmBeforeDelete: event.target.checked })
            }
          />
        </label>
        <label className="ow-setting-row">
          <span>
            <Code2 size={14} />
            Show status bar
          </span>
          <input
            type="checkbox"
            checked={settings.showStatusBar}
            onChange={(event) => onSettingsChange({ showStatusBar: event.target.checked })}
          />
        </label>
        <p>Autosave folder key:</p>
        <code>opiumware/autosave/default</code>
      </div>
    );
  }, [settingsSection, settings, theme, onSettingsChange, onThemeChange]);

  if (activeTab === "settings") {
    return (
      <main className="ow-editor">
        <header className="ow-editor-header">
          <div className="ow-editor-toolbar">
            <span className="ow-toolbar-title">
              <Settings2 size={14} />
              Settings
            </span>
          </div>
        </header>
        <div className="ow-editor-settings">{settingsContent}</div>
      </main>
    );
  }

  if (activeTab === "library") {
    return (
      <main className="ow-editor">
        <header className="ow-editor-header">
          <div className="ow-editor-toolbar">
            <span className="ow-toolbar-title">
              <BookMarked size={14} />
              Script Library
            </span>
          </div>
        </header>
        <div className="ow-editor-settings">
          {selectedScript ? (
            <div className="ow-settings-panel">
              <h3>{selectedScript.title}</h3>
              {selectedScript.bannerUrl && (
                <img
                  className="ow-script-banner"
                  src={selectedScript.bannerUrl}
                  alt={`${selectedScript.title} banner`}
                />
              )}
              {selectedScript.imageUrl && (
                <img
                  className="ow-script-image"
                  src={selectedScript.imageUrl}
                  alt={`${selectedScript.title} thumbnail`}
                />
              )}
              <div className="ow-script-badges">
                {selectedScript.verified && (
                  <span className="ow-badge verified">
                    <BadgeCheck size={12} />
                    Verified
                  </span>
                )}
                {selectedScript.paid ? (
                  <span className="ow-badge paid">
                    <DollarSign size={12} />
                    Paid
                  </span>
                ) : (
                  <span className="ow-badge free">
                    <LockOpen size={12} />
                    Free
                  </span>
                )}
                {selectedScript.keySystem && (
                  <span className="ow-badge keysystem">
                    <KeyRound size={12} />
                    KeySystem
                  </span>
                )}
              </div>
              <p>Game: {selectedScript.game}</p>
              <p>Views: {selectedScript.views.toLocaleString()}</p>
              <p>Verified: {selectedScript.verified ? "Yes" : "No"}</p>
              <div className="ow-toolbar-actions">
                <button
                  className="ow-toolbar-btn"
                  onClick={() => onCreateFileFromScript(selectedScript)}
                  type="button"
                >
                  <FileCode2 size={13} />
                  Copy To Code Editor
                </button>
              </div>
              <pre className="ow-script-preview">{selectedScript.script.slice(0, 2200)}</pre>
            </div>
          ) : (
            <div className="ow-editor-empty">Select a script from the library list.</div>
          )}
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="ow-editor">
        <header className="ow-editor-header">
          <div className="ow-editor-toolbar">
            <span className="ow-toolbar-title">
              <Code2 size={14} />
              Code Editor
            </span>
          </div>
        </header>
        <div className="ow-editor-empty">No file selected.</div>
      </main>
    );
  }

  return (
    <main className="ow-editor">
      <header className="ow-editor-header">
        <div className="ow-editor-toolbar">
          <span className="ow-toolbar-title">
            <FileCode2 size={14} />
            {note.title || "untitled.ts"}
          </span>
          <div className="ow-toolbar-actions">
            <button className="ow-toolbar-btn" onClick={onSaveNow} type="button">
              <Save size={13} />
              Save
            </button>
            <button className="ow-toolbar-btn" onClick={onDownloadCurrentFile} type="button">
              <Download size={13} />
              Export
            </button>
            <span className="ow-toolbar-save">Autosaving...</span>
          </div>
        </div>
      </header>
      <div className="ow-editor-workspace">
        {settings.showLineNumbers && (
          <div className="ow-line-gutter" aria-hidden="true">
            {note.body.split("\n").map((_, index) => {
              const line = index + 1;
              const value = settings.relativeLineNumbers
                ? line === cursorLine
                  ? line
                  : Math.abs(line - cursorLine)
                : line;
              return <span key={line}>{value}</span>;
            })}
          </div>
        )}
        <textarea
          ref={textAreaRef}
          className="ow-editor-textarea"
          value={note.body}
          wrap={settings.wordWrap ? "soft" : "off"}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const insertion = settings.softTabs ? " ".repeat(settings.tabSize) : "\t";
              const next = note.body.slice(0, start) + insertion + note.body.slice(end);
              onChange(next);
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + insertion.length;
              });
            }
          }}
          onSelect={(event) => {
            const text = event.currentTarget.value.slice(0, event.currentTarget.selectionStart);
            setCursorLine(text.split("\n").length);
          }}
          onKeyUp={(event) => {
            const text = event.currentTarget.value.slice(0, event.currentTarget.selectionStart);
            setCursorLine(text.split("\n").length);
          }}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (settings.autosaveOnBlur) onSaveNow();
          }}
          spellCheck={settings.spellCheck}
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            tabSize: settings.tabSize,
            padding: `${settings.editorPadding}px`,
            fontFamily:
              settings.fontFamily === "system"
                ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
                : '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
          }}
        />
      </div>
      {settings.showStatusBar && (
        <div className="ow-status-bar">
          <span>Ln {cursorLine}</span>
          <span>
            {settings.softTabs ? "Spaces" : "Tabs"}: {settings.tabSize}
          </span>
          <span>{settings.wordWrap ? "Wrap: On" : "Wrap: Off"}</span>
          <span>{note.body.length} chars</span>
        </div>
      )}
    </main>
  );
}
