import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plug,
  Play,
  Copy,
  BadgeCheck,
  BookMarked,
  Code2,
  DollarSign,
  Eraser,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  RefreshCw,
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
  User,
  Waves,
  WrapText,
  KeyRound,
  LockOpen,
  Trash2,
  Gamepad2,
  ExternalLink,
  XCircle,
  MonitorSmartphone,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  AccountSection,
  AppTab,
  AppTheme,
  EditorSettings,
  Note,
  ScriptEntry,
  SettingsSection,
} from "../types";

interface CompletionState {
  open: boolean;
  items: string[];
  index: number;
  x: number;
  y: number;
  start: number;
  end: number;
}

interface EditorProps {
  activeTab: AppTab;
  accountSection: AccountSection;
  note: Note | null;
  settingsSection: SettingsSection;
  theme: AppTheme;
  settings: EditorSettings;
  onChange: (body: string) => void;
  onThemeChange: (theme: AppTheme) => void;
  onSettingsChange: (settings: Partial<EditorSettings>) => void;
  onSaveNow: () => void;
  onAutosave: () => void;
  opiumwareVersion: string;
  opiumwareRobloxVersion: string;
  opiumwareChangelog: string;
  uiVersion: string;
  uiLatestVersion: string;
  uiDownloadsVersion: string;
  uiUpdateLogs: string;
  isCheckingUpdates: boolean;
  onCheckForUpdates: () => void;
  selectedScript: ScriptEntry | null;
  onCreateFileFromScript: (script: ScriptEntry) => void;
  onExecuteSelectedScript: (script: ScriptEntry) => void;
  onCopySelectedScript: (script: ScriptEntry) => void;
  ports: number[];
  selectedPort: number;
  attachedPorts: number[];
  portStatus: string;
  attachMode: "selected" | "available";
  onSelectPort: (port: number) => void;
  onAttachModeChange: (mode: "selected" | "available") => void;
  onAttachPort: () => void;
  onExecuteScript: (script: string) => void;
  onExecuteScriptToPort: (port: number, script: string) => void;
  onOpenInstanceWindow: (port: number) => void;
  onCloseInstanceWindow: (port: number) => void;
  onClearCurrent: () => void;
}

interface RobloxAccountBasic {
  id: number;
  username: string;
  displayName: string;
  description: string;
  created: string;
  avatarUrl: string;
}

interface RobloxAccountEntry extends RobloxAccountBasic {
  token: string;
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

const INTELLISENSE_KEYWORDS = [
  "print",
  "function",
  "local",
  "return",
  "if",
  "elseif",
  "else",
  "end",
  "for",
  "while",
  "repeat",
  "until",
  "table.insert",
  "table.remove",
  "string.format",
  "math.floor",
  "game:GetService",
  "workspace",
  "task.wait",
  "pcall",
  "xpcall",
  "pairs",
  "ipairs",
  "next",
  "spawn",
  "typeof",
  "Vector3.new",
  "CFrame.new",
  "Instance.new",
];

function parseFunctionHints(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("//") || value.startsWith("#")) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightCode(value: string): string {
  const tokenPattern =
    /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|import|from|export|interface|type|class|new|async|await|try|catch|finally|switch|case|default)\b|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/gm;
  let html = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(value)) !== null) {
    const raw = match[0];
    const index = match.index;
    if (index > last) {
      html += escapeHtml(value.slice(last, index));
    }
    let cls = "ow-tok-text";
    if (/^\/\//.test(raw) || /^\/\*/.test(raw)) cls = "ow-tok-comment";
    else if (/^['"`]/.test(raw)) cls = "ow-tok-string";
    else if (/^(true|false|null|undefined)$/.test(raw)) cls = "ow-tok-constant";
    else if (/^\d/.test(raw)) cls = "ow-tok-number";
    else cls = "ow-tok-keyword";
    html += `<span class="${cls}">${escapeHtml(raw)}</span>`;
    last = index + raw.length;
  }
  if (last < value.length) {
    html += escapeHtml(value.slice(last));
  }
  return html;
}

export default function Editor({
  activeTab,
  accountSection,
  note,
  settingsSection,
  theme,
  settings,
  onChange,
  onThemeChange,
  onSettingsChange,
  onSaveNow,
  onAutosave,
  opiumwareVersion,
  opiumwareRobloxVersion,
  opiumwareChangelog,
  uiVersion,
  uiLatestVersion,
  uiDownloadsVersion,
  uiUpdateLogs,
  isCheckingUpdates,
  onCheckForUpdates,
  selectedScript,
  onCreateFileFromScript,
  onExecuteSelectedScript,
  onCopySelectedScript,
  ports,
  selectedPort,
  attachedPorts,
  portStatus,
  attachMode,
  onSelectPort,
  onAttachModeChange,
  onAttachPort,
  onExecuteScript,
  onExecuteScriptToPort,
  onOpenInstanceWindow,
  onCloseInstanceWindow,
  onClearCurrent,
}: EditorProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const syntaxLayerRef = useRef<HTMLPreElement>(null);
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLPreElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const syncFrameRef = useRef<number | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [draftBody, setDraftBody] = useState(note?.body ?? "");
  const [minimapViewport, setMinimapViewport] = useState({ top: 0, height: 0 });
  const [completion, setCompletion] = useState<CompletionState>({
    open: false,
    items: [],
    index: 0,
    x: 0,
    y: 0,
    start: 0,
    end: 0,
  });
  const [accountToken, setAccountToken] = useState("");
  const [accounts, setAccounts] = useState<RobloxAccountEntry[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<RobloxAccountEntry | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(true);
  const [playLoadingId, setPlayLoadingId] = useState<number | null>(null);
  const [instanceModalPort, setInstanceModalPort] = useState<number | null>(null);
  const [instanceScript, setInstanceScript] = useState("");
  const [screenCaptureGranted, setScreenCaptureGranted] = useState(false);
  const [screenCaptureChecked, setScreenCaptureChecked] = useState(false);
  const [instancePreviewImage, setInstancePreviewImage] = useState<string | null>(null);
  const [functionHints, setFunctionHints] = useState<string[]>([]);
  const [previewConsentOpen, setPreviewConsentOpen] = useState(false);
  const [pendingPreviewEnable, setPendingPreviewEnable] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("opiumware/account/confirm-remove");
    setConfirmRemove(raw !== "0");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void invoke<string>("read_functions_txt")
      .then((text) => {
        if (cancelled) return;
        const parsed = parseFunctionHints(text);
        if (parsed.length > 0) {
          setFunctionHints(parsed);
          return;
        }
        return fetch("/functions.txt")
          .then((res) => (res.ok ? res.text() : ""))
          .then((fallbackText) => {
            if (cancelled) return;
            setFunctionHints(parseFunctionHints(fallbackText));
          });
      })
      .catch(() =>
        fetch("/functions.txt").then((res) => (res.ok ? res.text() : ""))
      )
      .then((text) => {
        if (typeof text !== "string") return;
        if (cancelled) return;
        setFunctionHints(parseFunctionHints(text));
      })
      .catch(() => {
        if (cancelled) return;
        setFunctionHints([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    textAreaRef.current?.focus();
  }, [note?.id, activeTab]);

  useEffect(() => {
    setDraftBody(note?.body ?? "");
  }, [note?.id]);

  useEffect(() => {
    return () => {
      if (syncFrameRef.current != null) {
        cancelAnimationFrame(syncFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const alreadyPrompted = localStorage.getItem("opiumware/preview/prompted") === "1";
    if (!alreadyPrompted) {
      setPreviewConsentOpen(true);
      setPendingPreviewEnable(false);
    }
  }, []);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!completion.open) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (completionRef.current?.contains(target)) return;
      if (textAreaRef.current?.contains(target)) return;
      setCompletion((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [completion.open]);

  useEffect(() => {
    if (!(activeTab === "account" && accountSection === "instances")) return;
    if (!settings.livePreview) {
      setScreenCaptureChecked(true);
      setScreenCaptureGranted(false);
      return;
    }
    let cancelled = false;
    void invoke<boolean>("request_screen_capture_access")
      .then((granted) => {
        if (cancelled) return;
        setScreenCaptureGranted(Boolean(granted));
        setScreenCaptureChecked(true);
        if (!granted) {
          onSettingsChange({ livePreview: false });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setScreenCaptureGranted(false);
        setScreenCaptureChecked(true);
        onSettingsChange({ livePreview: false });
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, accountSection, onSettingsChange, settings.livePreview]);

  useEffect(() => {
    if (!(activeTab === "account" && accountSection === "instances")) return;
    if (attachedPorts.length === 0) {
      setInstancePreviewImage(null);
      return;
    }
    if (!screenCaptureGranted || !settings.livePreview) {
      setInstancePreviewImage(null);
      return;
    }
    let cancelled = false;
    const capture = () => {
      void invoke<string | null>("capture_screen_preview")
        .then((value) => {
          if (cancelled) return;
          if (value) setInstancePreviewImage(value);
        })
        .catch(() => {
          // ignore transient capture failures
        });
    };
    capture();
    const timer = setInterval(capture, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTab, accountSection, screenCaptureGranted, settings.livePreview, attachedPorts.length]);

  const commitBodyChange = (next: string) => {
    setDraftBody(next);
    if (!note) return;
    if (!settings.smoothTyping) {
      onChange(next);
      return;
    }
    if (syncFrameRef.current != null) {
      cancelAnimationFrame(syncFrameRef.current);
    }
    syncFrameRef.current = requestAnimationFrame(() => {
      onChange(next);
      syncFrameRef.current = null;
    });
  };

  const getCurrentBody = () => textAreaRef.current?.value ?? draftBody;

  const handleExecute = () => {
    const current = getCurrentBody();
    commitBodyChange(current);
    onExecuteScript(current);
  };

  const handleClear = () => {
    commitBodyChange("");
    onClearCurrent();
  };
  const minimapText = useMemo(
    () =>
      draftBody
        .split("\n")
        .map((line) => line.replace(/\t/g, "  ").slice(0, 88))
        .join("\n"),
    [draftBody]
  );
  const highlightedHtml = useMemo(() => highlightCode(draftBody), [draftBody]);

  const syncMinimapViewport = () => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const total = Math.max(1, textarea.scrollHeight);
    const visible = textarea.clientHeight;
    const track = Math.max(1, visible - 8);
    const ratio = visible / total;
    const height = Math.max(22, track * ratio);
    const maxScroll = Math.max(1, total - visible);
    const topRatio = textarea.scrollTop / maxScroll;
    const top = Math.max(0, Math.min(track - height, (track - height) * topRatio));
    setMinimapViewport({ top, height });
  };

  useEffect(() => {
    syncMinimapViewport();
  }, [draftBody, settings.fontSize, settings.lineHeight, settings.editorPadding, settings.showMinimap]);

  const updateCompletion = (
    nextText: string,
    caret: number,
    selectionStart = caret,
    selectionEnd = caret,
    force = false,
    scrollTop = textAreaRef.current?.scrollTop ?? 0,
    scrollLeft = textAreaRef.current?.scrollLeft ?? 0
  ) => {
    const selectionActive = selectionEnd > selectionStart;
    const before = nextText.slice(0, selectionStart);
    const selectedText = selectionActive ? nextText.slice(selectionStart, selectionEnd).trim() : "";
    const tokenMatch = before.match(/[A-Za-z_][A-Za-z0-9_.$]*$/);
    const token = selectionActive ? selectedText : tokenMatch?.[0] ?? "";
    if (!force && token.length < 1 && !selectionActive) {
      setCompletion((prev) => ({ ...prev, open: false }));
      return;
    }

    const start = selectionActive ? selectionStart : selectionStart - token.length;
    const end = selectionActive ? selectionEnd : selectionStart;
    const symbolSet = new Set<string>(INTELLISENSE_KEYWORDS);
    const functionSet = new Set<string>(functionHints);
    const matches = nextText.match(/[A-Za-z_][A-Za-z0-9_.$]{1,}/g);
    if (matches) {
      for (const m of matches) symbolSet.add(m);
    }

    const needle = token.toLowerCase();
    const fnItems = Array.from(functionSet)
      .filter((item) => (needle ? item.toLowerCase().startsWith(needle) : true))
      .sort((a, b) => a.localeCompare(b));
    const symbolItems = Array.from(symbolSet)
      .filter((item) => (needle ? item.toLowerCase().startsWith(needle) : true))
      .sort((a, b) => a.localeCompare(b));

    // Ctrl+Space should expose the complete functions.txt set; keep symbols as secondary.
    const items = force
      ? [...fnItems, ...symbolItems.filter((item) => !functionSet.has(item))]
      : [...fnItems, ...symbolItems.filter((item) => !functionSet.has(item))].slice(0, 24);

    if (items.length === 0) {
      setCompletion((prev) => ({ ...prev, open: false }));
      return;
    }

    const lineNumber = before.split("\n").length;
    const lines = before.split("\n");
    const col = lines.length > 0 ? lines[lines.length - 1].length : 0;
    const lineHeightPx = settings.fontSize * settings.lineHeight;
    const charWidthPx = settings.fontSize * 0.6;
    const leftBase = settings.showLineNumbers ? 56 : 0;
    const x = Math.max(
      8,
      leftBase + settings.editorPadding + col * charWidthPx - scrollLeft + 4
    );
    const y = Math.max(
      8,
      settings.editorPadding + lineHeightPx * lineNumber - scrollTop + 4
    );

    setCompletion((prev) => ({
      ...prev,
      open: true,
      items,
      index: 0,
      x,
      y,
      start,
      end,
    }));
  };

  const applyCompletion = (choice: string) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const next =
      draftBody.slice(0, completion.start) + choice + draftBody.slice(completion.end);
    commitBodyChange(next);
    setCompletion((prev) => ({ ...prev, open: false }));
    requestAnimationFrame(() => {
      const nextPos = completion.start + choice.length;
      textarea.selectionStart = nextPos;
      textarea.selectionEnd = nextPos;
      textarea.focus();
    });
  };

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
              className="ow-setting-toggle"
              type="checkbox"
              checked={settings.wordWrap}
              onChange={(event) => onSettingsChange({ wordWrap: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <Type size={14} />
              Smooth typing
            </span>
            <input
              className="ow-setting-toggle"
              type="checkbox"
              checked={settings.smoothTyping}
              onChange={(event) => onSettingsChange({ smoothTyping: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              <FileCode2 size={14} />
              Minimap
            </span>
            <input
              className="ow-setting-toggle"
              type="checkbox"
              checked={settings.showMinimap}
              onChange={(event) => onSettingsChange({ showMinimap: event.target.checked })}
            />
          </label>
          <label className="ow-setting-row">
            <span>
              {settings.showLineNumbers ? <Eye size={14} /> : <EyeOff size={14} />}
              Line numbers
            </span>
            <input
              className="ow-setting-toggle"
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
              className="ow-setting-toggle"
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
              className="ow-setting-toggle"
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
              className="ow-setting-toggle"
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
          <p>`Ctrl + S`: Save</p>
          <p>`Ctrl + Enter`: Execute</p>
          <p>`Ctrl + L`: Clear editor</p>
          <p>`Ctrl + Space`: Intellisense</p>
          <p>`Tab`: Insert tab/spaces</p>
          <p>`Shift + Tab`: Outdent selection (coming soon)</p>
          <p>`Alt + Up/Down`: Move line (coming soon)</p>
          <p>`Right click`: File context menu actions</p>
        </div>
      );
    }
    if (settingsSection === "version") {
      return (
        <div className="ow-settings-panel">
          <h3>
            <Code2 size={16} />
            Version
          </h3>
          <p>
            <strong>Opiumware Version:</strong> {opiumwareVersion || "unknown"}
          </p>
          <p>
            <strong>Supported Roblox Version:</strong>{" "}
            {opiumwareRobloxVersion || "unknown"}
          </p>
          <div className="ow-update-notes">
            <strong>Opiumware Changelog</strong>
            <pre>{opiumwareChangelog || "No changelog available."}</pre>
          </div>
          <hr className="ow-settings-divider" />
          <p>
            <strong>UI Version:</strong> {uiVersion || "unknown"}
          </p>
          <p>
            <strong>Downloads version.txt:</strong> {uiDownloadsVersion || "missing"}
          </p>
          <p>
            <strong>Latest UI Version:</strong> {uiLatestVersion || "unknown"}
          </p>
          <div className="ow-update-notes">
            <strong>UI Update Logs</strong>
            <pre>{uiUpdateLogs || "No UI update logs available."}</pre>
          </div>
          <div className="ow-toolbar-actions">
            <button
              className="ow-toolbar-btn"
              type="button"
              onClick={onCheckForUpdates}
              disabled={isCheckingUpdates}
            >
              <RefreshCw size={13} />
              {isCheckingUpdates ? "Checking..." : "Check for updates"}
            </button>
          </div>
        </div>
      );
    }
    if (settingsSection === "opiumware") {
      return (
        <div className="ow-settings-panel">
          <h3>
            <Plug size={16} />
            Opiumware Ports
          </h3>
          <label className="ow-setting-row">
            <span>
              <Plug size={14} />
              Active port
              <span
                className={`ow-port-indicator ${attachedPorts.includes(selectedPort) ? "attached" : "detached"}`}
                title={attachedPorts.includes(selectedPort) ? "Attached" : "Detached"}
              />
            </span>
            <select
              className="ow-port-select"
              value={selectedPort}
              onChange={(event) => onSelectPort(Number(event.target.value))}
            >
              {ports.map((port) => (
                <option key={port} value={port}>
                  {port}
                </option>
              ))}
            </select>
          </label>
          <label className="ow-setting-row">
            <span>
              <Plug size={14} />
              Attach mode
            </span>
            <select
              className="ow-port-select"
              value={attachMode}
              onChange={(event) =>
                onAttachModeChange(event.target.value as "selected" | "available")
              }
            >
              <option value="selected">Selected port</option>
              <option value="available">Attach to available port</option>
            </select>
          </label>
          <label className="ow-setting-row">
            <span>
              <Plug size={14} />
              Auto attach to available port
            </span>
            <input
              className="ow-setting-toggle"
              type="checkbox"
              checked={settings.autoAttach}
              onChange={(event) => onSettingsChange({ autoAttach: event.target.checked })}
            />
          </label>
          <p>{portStatus}</p>
        </div>
      );
    }
    if (settingsSection === "instanceManager") {
      return (
        <div className="ow-settings-panel">
          <h3>
            <MonitorSmartphone size={16} />
            Instance Manager
          </h3>
          <p className="ow-instance-note">
            Toggle live Roblox window preview used by Instance Manager.
          </p>
          <label className="ow-setting-row">
            <span>
              <MonitorSmartphone size={14} />
              Live Roblox preview
            </span>
            <input
              className="ow-setting-toggle"
              type="checkbox"
              checked={settings.livePreview}
              onChange={(event) => {
                if (event.target.checked) {
                  setPendingPreviewEnable(true);
                  setPreviewConsentOpen(true);
                  return;
                }
                onSettingsChange({ livePreview: false });
                setScreenCaptureGranted(false);
                setInstancePreviewImage(null);
              }}
            />
          </label>
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
            className="ow-setting-toggle"
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
            className="ow-setting-toggle"
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
            Ask before delete/close
          </span>
          <input
            className="ow-setting-toggle"
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
            className="ow-setting-toggle"
            type="checkbox"
            checked={settings.showStatusBar}
            onChange={(event) => onSettingsChange({ showStatusBar: event.target.checked })}
          />
        </label>
        <p>Autosave folder key:</p>
        <code>opiumware/autosave/default</code>
      </div>
    );
  }, [
    settingsSection,
    settings,
    theme,
    opiumwareVersion,
    opiumwareRobloxVersion,
    opiumwareChangelog,
    uiVersion,
    uiLatestVersion,
    uiDownloadsVersion,
    uiUpdateLogs,
    isCheckingUpdates,
    onCheckForUpdates,
    onSettingsChange,
    onThemeChange,
    ports,
    selectedPort,
    attachedPorts,
    attachMode,
    onSelectPort,
    onAttachModeChange,
    portStatus,
  ]);

  const removeAccount = (id: number) => {
    setAccounts((prev) => prev.filter((item) => item.id !== id));
    if (removeTarget?.id === id) {
      setRemoveTarget(null);
    }
  };

  const handleAskAgainChange = (checked: boolean) => {
    const nextConfirm = !checked;
    setConfirmRemove(nextConfirm);
    localStorage.setItem("opiumware/account/confirm-remove", nextConfirm ? "1" : "0");
  };

  const handleRequestRemoveAccount = (account: RobloxAccountEntry) => {
    if (!confirmRemove) {
      removeAccount(account.id);
      return;
    }
    setRemoveTarget(account);
  };

  const handleLaunchAccount = (account: RobloxAccountEntry) => {
    setPlayLoadingId(account.id);
    setAccountError("");
    void invoke<string>("roblox_launch_instance", { token: account.token })
      .then(() => {
        setAccountError("");
      })
      .catch((error) => {
        setAccountError(String((error as Error)?.message || error || "Failed to launch Roblox"));
      })
      .finally(() => setPlayLoadingId(null));
  };

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
              <pre className="ow-script-preview">{selectedScript.script.slice(0, 2200)}</pre>
              <div className="ow-toolbar-actions">
                <button
                  className="ow-toolbar-btn"
                  onClick={() => onCreateFileFromScript(selectedScript)}
                  type="button"
                >
                  <FileCode2 size={13} />
                  Copy To Code Editor
                </button>
                <button
                  className="ow-toolbar-btn"
                  onClick={() => onExecuteSelectedScript(selectedScript)}
                  type="button"
                >
                  <Play size={13} />
                  Execute
                </button>
                <button
                  className="ow-toolbar-btn"
                  onClick={() => onCopySelectedScript(selectedScript)}
                  type="button"
                >
                  <Copy size={13} />
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <div className="ow-editor-empty">Select a script from the library list.</div>
          )}
        </div>
      </main>
    );
  }

  if (activeTab === "account") {
    const instancePorts = attachedPorts;
    const attachedCount = attachedPorts.length;

    if (accountSection === "instances") {
      return (
        <main className="ow-editor">
          <header className="ow-editor-header">
            <div className="ow-editor-toolbar">
              <span className="ow-toolbar-title">
                <User size={14} />
                Instance Manager
              </span>
            </div>
          </header>
          <div className="ow-editor-settings">
            <div className="ow-settings-panel">
              <h3>Roblox Instances</h3>
              <p>
                Attached instances: <strong>{attachedCount}</strong>
              </p>
              <p className="ow-instance-note">
                Note: This preview only captures the Roblox.app window. It does not record your
                entire screen, save recordings, or upload screen data. It only shows a live capture
                inside Instance Manager.
              </p>
              {!screenCaptureGranted && (
                <div className="ow-instance-perm-banner">
                  <span>
                    {screenCaptureChecked
                      ? "Screen Recording permission is required for live preview."
                      : "Requesting Screen Recording permission..."}
                  </span>
                  <button
                    className="ow-toolbar-btn"
                    type="button"
                    onClick={() => {
                      setPendingPreviewEnable(true);
                      setPreviewConsentOpen(true);
                    }}
                  >
                    Enable Preview
                  </button>
                </div>
              )}
              {instancePorts.length === 0 && (
                <p>No running attached Roblox instances detected.</p>
              )}
              <div className="ow-instance-grid">
                {instancePorts.map((port) => {
                  const attached = true;
                  return (
                    <div key={port} className="ow-instance-card">
                      <button
                        type="button"
                        className="ow-instance-head ow-instance-open-btn"
                        onClick={() => onOpenInstanceWindow(port)}
                        title={`Open Roblox window on port ${port}`}
                      >
                        <span className="ow-instance-app">
                          <Gamepad2 size={14} />
                          Roblox.app
                        </span>
                        <strong>{attached ? `Port ${port}` : "Unattached"}</strong>
                        <ExternalLink size={13} />
                      </button>
                      {settings.livePreview && screenCaptureGranted && instancePreviewImage && (
                        <div className={`ow-instance-preview ${attachedCount > 2 ? "live" : ""}`}>
                          <div className="ow-instance-scanlines" />
                          <img
                            className="ow-instance-preview-image"
                            src={instancePreviewImage}
                            alt={`Roblox instance preview ${port}`}
                          />
                        </div>
                      )}
                      <div className="ow-instance-actions">
                        <button
                          className="ow-toolbar-btn ow-confirm-yes ow-instance-action-btn"
                          type="button"
                          onClick={() => {
                            setInstanceModalPort(port);
                            setInstanceScript(note?.body ?? "");
                          }}
                        >
                          <Play size={13} />
                          Execute
                        </button>
                        <button
                          className="ow-toolbar-btn ow-instance-action-btn"
                          type="button"
                          onClick={() => onCloseInstanceWindow(port)}
                        >
                          <XCircle size={13} />
                          Close Window
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {instanceModalPort !== null && (
            <div
              className="ow-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setInstanceModalPort(null);
              }}
            >
              <div className="ow-modal-card ow-update-card">
                <h3>
                  <Play size={16} />
                  Execute on Port {instanceModalPort}
                </h3>
                <textarea
                  className="ow-instance-script-input"
                  value={instanceScript}
                  onChange={(event) => setInstanceScript(event.target.value)}
                  placeholder="Edit script for this instance..."
                />
                <div className="ow-modal-actions">
                  <button
                    type="button"
                    className="ow-toolbar-btn ow-confirm-yes"
                    onClick={() => {
                      const target = instanceModalPort;
                      if (target == null) return;
                      onExecuteScriptToPort(target, instanceScript);
                      setInstanceModalPort(null);
                    }}
                  >
                    Execute
                  </button>
                  <button
                    type="button"
                    className="ow-toolbar-btn"
                    onClick={() => setInstanceModalPort(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {previewConsentOpen && (
            <div
              className="ow-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setPreviewConsentOpen(false);
                  setPendingPreviewEnable(false);
                }
              }}
            >
              <div className="ow-modal-card ow-update-card">
                <h3>
                  <MonitorSmartphone size={16} />
                  {pendingPreviewEnable ? "Turn On Live Preview?" : "Enable Live Roblox Preview?"}
                </h3>
                <p className="ow-instance-note">
                  This preview only captures the Roblox.app window. It does not record your full screen,
                  save recordings, or upload screen data.
                </p>
                <div className="ow-modal-actions">
                  <button
                    type="button"
                    className="ow-toolbar-btn ow-confirm-yes"
                    onClick={() => {
                      localStorage.setItem("opiumware/preview/prompted", "1");
                      setScreenCaptureChecked(false);
                      void invoke<boolean>("request_screen_capture_access")
                        .then((granted) => {
                          const ok = Boolean(granted);
                          setScreenCaptureGranted(ok);
                          setScreenCaptureChecked(true);
                          onSettingsChange({ livePreview: ok });
                        })
                        .catch(() => {
                          setScreenCaptureGranted(false);
                          setScreenCaptureChecked(true);
                          onSettingsChange({ livePreview: false });
                        })
                        .finally(() => {
                          setPreviewConsentOpen(false);
                          setPendingPreviewEnable(false);
                        });
                    }}
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    className="ow-toolbar-btn"
                    onClick={() => {
                      localStorage.setItem("opiumware/preview/prompted", "1");
                      onSettingsChange({ livePreview: false });
                      setScreenCaptureGranted(false);
                      setPreviewConsentOpen(false);
                      setPendingPreviewEnable(false);
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      );
    }

    return (
      <main className="ow-editor">
        <header className="ow-editor-header">
          <div className="ow-editor-toolbar">
            <span className="ow-toolbar-title">
              <User size={14} />
              Account Manager
            </span>
          </div>
        </header>
        <div className="ow-editor-settings">
          <div className="ow-settings-panel">
            <h3>Account Manager</h3>
            <p>Add Roblox accounts with token (in-memory only, never persisted).</p>
            <div className="ow-account-input-row">
              <input
                type="password"
                className="ow-library-input"
                value={accountToken}
                onChange={(event) => setAccountToken(event.target.value)}
                placeholder=".ROBLOSECURITY token"
              />
              <button
                className="ow-toolbar-btn"
                type="button"
                disabled={accountLoading || !accountToken.trim()}
                onClick={() => {
                  const token = accountToken.trim();
                  if (!token) return;
                  setAccountLoading(true);
                  setAccountError("");
                  void invoke<RobloxAccountBasic>("roblox_get_account_basic", { token })
                    .then((data) => {
                      setAccounts((prev) => {
                        if (prev.some((item) => item.id === data.id)) return prev;
                        return [{ ...data, token }, ...prev];
                      });
                      setAccountToken("");
                    })
                    .catch(() => setAccountError("Failed to load account from token"))
                    .finally(() => setAccountLoading(false));
                }}
              >
                {accountLoading ? "Loading..." : "Add Account"}
              </button>
              <button
                className="ow-toolbar-btn"
                type="button"
                onClick={() => {
                  setAccounts([]);
                  setAccountError("");
                }}
              >
                Clear
              </button>
            </div>
            {accountError && <p className="ow-update-error">{accountError}</p>}
            <div className="ow-account-grid">
              {accounts.map((account) => (
                <div key={account.id} className="ow-account-card">
                  <img src={account.avatarUrl} alt={`${account.username} avatar`} />
                  <div className="ow-account-meta">
                    <strong>{account.displayName || account.username}</strong>
                    <span>@{account.username}</span>
                    <span>ID: {account.id}</span>
                    <span>Created: {account.created ? account.created.slice(0, 10) : "unknown"}</span>
                  </div>
                  <div className="ow-toolbar-actions">
                    <button
                      className="ow-toolbar-btn ow-confirm-yes"
                      type="button"
                      disabled={playLoadingId === account.id}
                      onClick={() => handleLaunchAccount(account)}
                    >
                      <Play size={13} />
                      {playLoadingId === account.id ? "Launching..." : "Play"}
                    </button>
                    <button
                      className="ow-toolbar-btn"
                      type="button"
                      onClick={() => handleRequestRemoveAccount(account)}
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && <p>No accounts loaded.</p>}
            </div>
          </div>
        </div>
        {removeTarget && (
          <div
            className="ow-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setRemoveTarget(null);
            }}
          >
            <div className="ow-modal-card ow-update-card">
              <h3>
                <Trash2 size={16} />
                Remove Account
              </h3>
              <p>Are you sure you want to remove this account?</p>
              <p>
                <strong>@{removeTarget.username}</strong>
              </p>
              <label className="ow-confirm-toggle-row">
                <span>Don't ask again</span>
                <input
                  className="ow-setting-toggle"
                  type="checkbox"
                  checked={!confirmRemove}
                  onChange={(event) => handleAskAgainChange(event.target.checked)}
                />
              </label>
              <div className="ow-modal-actions">
                <button
                  type="button"
                  className="ow-toolbar-btn ow-confirm-yes"
                  onClick={() => {
                    removeAccount(removeTarget.id);
                    setRemoveTarget(null);
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="ow-toolbar-btn"
                  onClick={() => setRemoveTarget(null)}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (activeTab === "contribution") {
    return (
      <main className="ow-editor">
        <header className="ow-editor-header">
          <div className="ow-editor-toolbar">
            <span className="ow-toolbar-title">
              <BookMarked size={14} />
              Contribution
            </span>
          </div>
        </header>
        <div className="ow-editor-settings">
          <div className="ow-settings-panel">
            <h3>Contributors</h3>
            <div className="ow-contrib-list">
              <div className="ow-contrib-card">
                <img className="ow-contrib-avatar" src="/icons/zyit0.png" alt="zyit0 avatar" />
                <div className="ow-contrib-meta">
                  <div className="ow-contrib-name">zyit0</div>
                  <div className="ow-contrib-desc">Owner, tester, developer</div>
                </div>
              </div>
              <div className="ow-contrib-card">
                <img className="ow-contrib-avatar" src="/icons/eee.png" alt="eee avatar" />
                <div className="ow-contrib-meta">
                  <div className="ow-contrib-name">eee</div>
                  <div className="ow-contrib-desc">Tester (didn't really do anything)</div>
                </div>
              </div>
            </div>
          </div>
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
    <main className="ow-editor ow-editor-monaco">
      <header className="ow-editor-header">
        <div className="ow-editor-toolbar">
          <span className="ow-toolbar-title">
            <FileCode2 size={14} />
            {note.title || "untitled.txt"}
          </span>
          <div className="ow-toolbar-actions">
            <button
              className="ow-toolbar-btn"
              onClick={handleExecute}
              type="button"
            >
              <Play size={13} />
              Execute
            </button>
            <button className="ow-toolbar-btn" onClick={onAttachPort} type="button">
              <Plug size={13} />
              Attach
            </button>
            <button className="ow-toolbar-btn" onClick={handleClear} type="button">
              <Eraser size={13} />
              Clear
            </button>
            <button className="ow-toolbar-btn" onClick={onSaveNow} type="button">
              <Save size={13} />
              Save
            </button>
            <span className="ow-toolbar-save">
              Port:
              {ports.length > 1 ? (
                <select
                  className="ow-port-select"
                  value={selectedPort}
                  onChange={(event) => onSelectPort(Number(event.target.value))}
                >
                  {ports.map((port) => (
                    <option key={port} value={port}>
                      {port}
                    </option>
                  ))}
                </select>
              ) : (
                <strong> {selectedPort}</strong>
              )}
              <span
                className={`ow-port-indicator ${attachedPorts.includes(selectedPort) ? "attached" : "detached"}`}
                title={attachedPorts.includes(selectedPort) ? "Attached" : "Detached"}
              />
              <strong>{attachedPorts.length ? ` attached:${attachedPorts.length}` : " detached"}</strong>
            </span>
          </div>
        </div>
      </header>
      <div
        className={`ow-editor-workspace ${settings.showMinimap ? "has-minimap" : ""}`}
      >
        {settings.showLineNumbers && (
          <div
            className="ow-line-gutter"
            ref={lineGutterRef}
            aria-hidden="true"
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              padding: `${settings.editorPadding}px 6px`,
              fontFamily:
                settings.fontFamily === "system"
                  ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
                  : '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
            }}
          >
            {draftBody.split("\n").map((_, index) => {
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
        <div className="ow-code-host">
          <pre
            ref={syntaxLayerRef}
            className="ow-editor-syntax-layer"
            aria-hidden="true"
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
            dangerouslySetInnerHTML={{ __html: highlightedHtml || " " }}
          />
          <textarea
            ref={textAreaRef}
            className={`ow-editor-textarea ow-editor-textarea-overlay ${
              settings.smoothTyping ? "smooth" : ""
            }`}
            value={draftBody}
            wrap={settings.wordWrap ? "soft" : "off"}
            onKeyDown={(event) => {
            const keyCode = (event as unknown as { keyCode?: number }).keyCode ?? 0;
            const isCtrlSpace =
              event.ctrlKey &&
              (event.code === "Space" ||
                event.key === " " ||
                event.key === "Spacebar" ||
                keyCode === 32);
            if (isCtrlSpace) {
              event.preventDefault();
              const target = event.currentTarget;
              updateCompletion(
                target.value,
                target.selectionStart,
                target.selectionStart,
                target.selectionEnd,
                true,
                target.scrollTop,
                target.scrollLeft
              );
              return;
            }
            if (completion.open) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCompletion((prev) => ({
                  ...prev,
                  index: Math.min(prev.items.length - 1, prev.index + 1),
                }));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCompletion((prev) => ({
                  ...prev,
                  index: Math.max(0, prev.index - 1),
                }));
                return;
              }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                const choice = completion.items[completion.index];
                if (choice) applyCompletion(choice);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setCompletion((prev) => ({ ...prev, open: false }));
                return;
              }
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              onSaveNow();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
              event.preventDefault();
              handleClear();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              handleExecute();
              return;
            }
            if (event.key === "Tab") {
              event.preventDefault();
              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const insertion = settings.softTabs ? " ".repeat(settings.tabSize) : "\t";
              const next = draftBody.slice(0, start) + insertion + draftBody.slice(end);
              commitBodyChange(next);
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
            onChange={(event) => commitBodyChange(event.target.value)}
            onInput={(event) => {
              const target = event.currentTarget;
              updateCompletion(
                target.value,
                target.selectionStart,
                target.selectionStart,
                target.selectionEnd,
                false,
                target.scrollTop,
                target.scrollLeft
              );
            }}
            onScroll={(event) => {
              if (lineGutterRef.current) {
                lineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
              }
              if (minimapRef.current) {
                minimapRef.current.scrollTop = event.currentTarget.scrollTop;
              }
              if (syntaxLayerRef.current) {
                syntaxLayerRef.current.scrollTop = event.currentTarget.scrollTop;
                syntaxLayerRef.current.scrollLeft = event.currentTarget.scrollLeft;
              }
              syncMinimapViewport();
              if (completion.open) {
                updateCompletion(
                  event.currentTarget.value,
                  event.currentTarget.selectionStart,
                  event.currentTarget.selectionStart,
                  event.currentTarget.selectionEnd,
                  false,
                  event.currentTarget.scrollTop,
                  event.currentTarget.scrollLeft
                );
              }
            }}
            onBlur={() => {
              if (settings.autosaveOnBlur) onAutosave();
              setTimeout(() => {
                setCompletion((prev) => ({ ...prev, open: false }));
              }, 120);
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
        {completion.open && (
          <div
            ref={completionRef}
            className="ow-intellisense"
            style={{ left: `${completion.x}px`, top: `${completion.y}px` }}
          >
            {completion.items.map((item, idx) => (
              <button
                key={item}
                type="button"
                className={`ow-intellisense-item ${idx === completion.index ? "active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyCompletion(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {settings.showMinimap && (
          <div className="ow-minimap-pane" aria-hidden="true">
            <span
              className="ow-minimap-viewport"
              style={{
                top: `${minimapViewport.top}px`,
                height: `${minimapViewport.height}px`,
              }}
            />
            <pre ref={minimapRef} className="ow-minimap-text">
              {minimapText || " "}
            </pre>
          </div>
        )}
      </div>
      {settings.showStatusBar && (
        <div className="ow-status-bar">
          <span>Ln {cursorLine}</span>
          <span>
            {settings.softTabs ? "Spaces" : "Tabs"}: {settings.tabSize}
          </span>
          <span>{settings.wordWrap ? "Wrap: On" : "Wrap: Off"}</span>
          <span>{draftBody.length} chars</span>
        </div>
      )}
      {previewConsentOpen && (
        <div
          className="ow-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewConsentOpen(false);
              setPendingPreviewEnable(false);
            }
          }}
        >
          <div className="ow-modal-card ow-update-card">
            <h3>
              <MonitorSmartphone size={16} />
              {pendingPreviewEnable ? "Turn On Live Preview?" : "Enable Live Roblox Preview?"}
            </h3>
            <p className="ow-instance-note">
              This preview only captures the Roblox.app window. It does not record your full screen,
              save recordings, or upload screen data.
            </p>
            <div className="ow-modal-actions">
              <button
                type="button"
                className="ow-toolbar-btn ow-confirm-yes"
                onClick={() => {
                  localStorage.setItem("opiumware/preview/prompted", "1");
                  setScreenCaptureChecked(false);
                  void invoke<boolean>("request_screen_capture_access")
                    .then((granted) => {
                      const ok = Boolean(granted);
                      setScreenCaptureGranted(ok);
                      setScreenCaptureChecked(true);
                      onSettingsChange({ livePreview: ok });
                    })
                    .catch(() => {
                      setScreenCaptureGranted(false);
                      setScreenCaptureChecked(true);
                      onSettingsChange({ livePreview: false });
                    })
                    .finally(() => {
                      setPreviewConsentOpen(false);
                      setPendingPreviewEnable(false);
                    });
                }}
              >
                Allow
              </button>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => {
                  localStorage.setItem("opiumware/preview/prompted", "1");
                  onSettingsChange({ livePreview: false });
                  setScreenCaptureGranted(false);
                  setPreviewConsentOpen(false);
                  setPendingPreviewEnable(false);
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
