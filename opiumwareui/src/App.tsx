import {
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BookMarked, Code2, Copy, Download, LoaderCircle, Settings2, TerminalSquare, User, Users } from "lucide-react";

import Editor from "./components/Editor";
import NoteList from "./components/NoteList";
import Sidebar from "./components/Sidebar";
import type { AccountSection, AppTab, AppTheme, EditorSettings, Note, SettingsSection } from "./types";
import type { ScriptEntry } from "./types";
import { generateId } from "./utils";

interface AppState {
  notes: Note[];
  trashedNotes: Note[];
  activeNoteId: string | null;
}

interface AppToast {
  id: string;
  message: string;
  level: "success" | "error" | "info";
  closing: boolean;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface LatestReleaseResponse {
  body?: string;
  assets?: ReleaseAsset[];
}

interface OpiumwareVersionJson {
  CurrentVersion?: string;
  SupportedRobloxVersion?: string;
  Changelog?: string;
}

interface UpdateVersionJson {
  uiVersion?: string;
  latestUiVersion?: string;
  version?: string;
  changelog?: string;
  updateLogs?: string;
  notes?: string;
  dmgUrl?: string;
  releaseDmgUrl?: string;
  downloadUrl?: string;
}

type Action =
  | { type: "LOAD_NOTES"; notes: Note[] }
  | { type: "CREATE_FILE"; body?: string; title?: string }
  | { type: "IMPORT_FILES"; notes: Note[] }
  | { type: "SELECT_NOTE"; id: string }
  | { type: "CLOSE_NOTE"; id: string }
  | { type: "UPDATE_NOTE"; id: string; body: string }
  | { type: "RENAME_NOTE"; id: string; name: string }
  | { type: "DUPLICATE_NOTE"; id: string }
  | { type: "DELETE_NOTE"; id: string }
  | { type: "MOVE_NOTE_TO"; sourceId: string; targetId: string };

const initialState: AppState = {
  notes: [],
  trashedNotes: [],
  activeNoteId: null,
};

const defaultEditorSettings: EditorSettings = {
  wordWrap: false,
  smoothTyping: true,
  showMinimap: false,
  showLineNumbers: true,
  relativeLineNumbers: false,
  spellCheck: false,
  autosaveOnBlur: true,
  autoAttach: false,
  softTabs: true,
  trimTrailingWhitespaceOnSave: false,
  confirmBeforeDelete: true,
  showStatusBar: true,
  tabSize: 2,
  fontSize: 14,
  lineHeight: 1.55,
  editorPadding: 14,
  fontFamily: "mono",
  autosaveMs: 300,
};
const fallbackPorts = [8392, 8393, 8394, 8395, 8396, 8397];
const UPDATE_REPO = (import.meta.env.VITE_UPDATE_REPO as string | undefined) ?? "zyit0000/aaaaaaaaaaa";
const UPDATE_BRANCH = (import.meta.env.VITE_UPDATE_BRANCH as string | undefined) ?? "main";
const RAW_BASE = `https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_BRANCH}`;
const REMOTE_UPDATE_JSON_URL = `${RAW_BASE}/updateversion.json`;
const RELEASE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const OPIUMWARE_VERSION_JSON_URL =
  "https://raw.githubusercontent.com/norbyv1/OpiumwareInstall/main/version.json";
const SCRIPT_PAGE_SIZE = 250;

function toFileName(title: string, index: number): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/\-]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || `file-${index + 1}.txt`;
}

function normalizeVersion(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^v/, "")
    .replace(/\s+/g, "");
}

function sortByUpdatedAt(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y", "on", "enabled", "required"].includes(normalized);
  }
  return false;
}

function hasTag(value: unknown, name: string): boolean {
  if (!Array.isArray(value)) return false;
  const needle = name.toLowerCase();
  return value.some((entry) => {
    if (typeof entry === "string") return entry.toLowerCase().includes(needle);
    const record = toRecord(entry);
    if (!record) return false;
    return Object.values(record).some(
      (part) => typeof part === "string" && part.toLowerCase().includes(needle)
    );
  });
}

function matchesScriptFilters(
  script: ScriptEntry,
  filters: {
    mode: "all" | "free" | "paid";
    verifiedOnly: boolean;
    keySystem: "all" | "yes" | "no";
  }
): boolean {
  if (filters.mode === "free" && !script.free) return false;
  if (filters.mode === "paid" && !script.paid) return false;
  if (filters.verifiedOnly && !script.verified) return false;
  if (filters.keySystem === "yes" && !script.keySystem) return false;
  if (filters.keySystem === "no" && script.keySystem) return false;
  return true;
}

function getScriptItemsFromResponse(payload: unknown): Array<Record<string, unknown>> {
  const root = toRecord(payload);
  if (!root) return [];
  const result = toRecord(root.result);
  const directCandidates: unknown[] = [
    result?.scripts,
    root.scripts,
    result?.data,
    root.data,
    result?.items,
    root.items,
    result?.results,
    root.results,
    root.result,
  ];
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is Record<string, unknown> => !!toRecord(entry));
    }
  }
  return [];
}

function pickIntelDmgAssetUrl(assets: ReleaseAsset[]): string | null {
  const intel = assets.find((asset) => /(x64|x86_64|amd64|intel).*\.dmg$/i.test(asset.name));
  if (intel) return intel.browser_download_url;
  const anyDmg = assets.find((asset) => /\.dmg$/i.test(asset.name));
  if (anyDmg) return anyDmg.browser_download_url;
  const macArchive = assets.find(
    (asset) =>
      !/\.sig$/i.test(asset.name) &&
      /(darwin|mac|osx|x64|x86_64|amd64|intel|universal).*\.(zip|app\.tar\.gz)$/i.test(
        asset.name
      )
  );
  if (macArchive) return macArchive.browser_download_url;
  const firstUsable = assets.find((asset) => !/\.sig$/i.test(asset.name));
  return firstUsable?.browser_download_url ?? null;
}

function triggerTextDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD_NOTES": {
      const prepared = sortByUpdatedAt(action.notes).map((note, index) => ({
        ...note,
        title: toFileName(note.title || note.body.split("\n").find(Boolean) || "", index),
      }));
      return { notes: prepared, trashedNotes: [], activeNoteId: prepared[0]?.id ?? null };
    }
    case "CREATE_FILE": {
      const now = new Date().toISOString();
      const note: Note = {
        id: generateId(),
        title: toFileName(action.title || "untitled.txt", state.notes.length),
        body: action.body || "",
        createdAt: now,
        updatedAt: now,
      };
      return { ...state, notes: [note, ...state.notes], activeNoteId: note.id };
    }
    case "IMPORT_FILES": {
      if (action.notes.length === 0) return state;
      const notes = sortByUpdatedAt([...action.notes, ...state.notes]);
      return { ...state, notes, activeNoteId: notes[0]?.id ?? null };
    }
    case "SELECT_NOTE":
      return { ...state, activeNoteId: action.id };
    case "CLOSE_NOTE":
      return state.activeNoteId === action.id ? { ...state, activeNoteId: null } : state;
    case "UPDATE_NOTE": {
      const updated = sortByUpdatedAt(
        state.notes.map((note) =>
          note.id === action.id
            ? {
                ...note,
                body: action.body,
                updatedAt: new Date().toISOString(),
              }
            : note
        )
      );
      return { ...state, notes: updated };
    }
    case "RENAME_NOTE": {
      return {
        ...state,
        notes: state.notes.map((note, index) =>
          note.id === action.id ? { ...note, title: toFileName(action.name, index) } : note
        ),
      };
    }
    case "DUPLICATE_NOTE": {
      const source = state.notes.find((note) => note.id === action.id);
      if (!source) return state;
      const now = new Date().toISOString();
      const copy: Note = {
        ...source,
        id: generateId(),
        title: toFileName(source.title.replace(/(\.[a-z0-9]+)?$/, ".copy$1"), state.notes.length),
        createdAt: now,
        updatedAt: now,
      };
      return { ...state, notes: [copy, ...state.notes], activeNoteId: copy.id };
    }
    case "MOVE_NOTE_TO": {
      const list = [...state.notes];
      const from = list.findIndex((n) => n.id === action.sourceId);
      const to = list.findIndex((n) => n.id === action.targetId);
      if (from < 0 || to < 0 || from === to) return state;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return { ...state, notes: list };
    }
    case "DELETE_NOTE": {
      const target = state.notes.find((note) => note.id === action.id) ?? null;
      const notes = state.notes.filter((note) => note.id !== action.id);
      const activeNoteId =
        state.activeNoteId === action.id ? notes[0]?.id ?? null : state.activeNoteId;
      return {
        ...state,
        notes,
        trashedNotes: target ? [target, ...state.trashedNotes] : state.trashedNotes,
        activeNoteId,
      };
    }
    default:
      return state;
  }
}

const fallbackNotes = (): Note[] => {
  const now = new Date().toISOString();
  return [
    {
      id: generateId(),
      title: "src/main.ts",
      body: "function opiumware() {\n  console.log('Hello from Opiumware');\n}\n\nopiumware();\n",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      title: "config/theme.config.ts",
      body: "export const theme = {\n  mode: 'dracula',\n  accent: '#7c5cff'\n};\n",
      createdAt: now,
      updatedAt: now,
    },
  ];
};

async function fileToNote(file: File): Promise<Note> {
  const body = await file.text();
  const now = new Date().toISOString();
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  return {
    id: generateId(),
    title: toFileName(path, 0),
    body,
    createdAt: now,
    updatedAt: now,
  };
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [activeTab, setActiveTab] = useState<AppTab>("code");
  const [primaryCollapsed, setPrimaryCollapsed] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("editor");
  const [accountSection, setAccountSection] = useState<AccountSection>("accounts");
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(defaultEditorSettings);
  const [scriptQuery, setScriptQuery] = useState("");
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [scriptPage, setScriptPage] = useState(1);
  const [hasMoreScripts, setHasMoreScripts] = useState(true);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [closedNoteIds, setClosedNoteIds] = useState<string[]>([]);
  const [localVersion, setLocalVersion] = useState("0.1.0");
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [updateNotes, setUpdateNotes] = useState("");
  const [opiumwareVersion, setOpiumwareVersion] = useState("unknown");
  const [opiumwareRobloxVersion, setOpiumwareRobloxVersion] = useState("unknown");
  const [opiumwareChangelog, setOpiumwareChangelog] = useState("");
  const [downloadsVersion, setDownloadsVersion] = useState<string | null>(null);
  const [hasLocalVersionFile, setHasLocalVersionFile] = useState(true);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [updateModeOpen, setUpdateModeOpen] = useState(false);
  const [missingVersionPromptOpen, setMissingVersionPromptOpen] = useState(false);
  const [missingVersionNoWarning, setMissingVersionNoWarning] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [updateProgressOpen, setUpdateProgressOpen] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatusText, setUpdateStatusText] = useState("Preparing update...");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [manualUpdatePromptOpen, setManualUpdatePromptOpen] = useState(false);
  const [remoteDmgUrl, setRemoteDmgUrl] = useState<string | null>(null);
  const [ports, setPorts] = useState<number[]>(fallbackPorts);
  const [selectedPort, setSelectedPort] = useState<number>(fallbackPorts[0]);
  const [attachedPorts, setAttachedPorts] = useState<number[]>([]);
  const [attachMode, setAttachMode] = useState<"selected" | "available">("selected");
  const [portStatus, setPortStatus] = useState("Detached");
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [scriptFilters, setScriptFilters] = useState<{
    mode: "all" | "free" | "paid";
    verifiedOnly: boolean;
    keySystem: "all" | "yes" | "no";
  }>({
    mode: "all",
    verifiedOnly: false,
    keySystem: "all",
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [secondaryWidth, setSecondaryWidth] = useState(180);
  const draggingResizerRef = useRef(false);
  const loadingScriptsRef = useRef(false);
  const fileHandleByNoteIdRef = useRef<Map<string, FileSystemFileHandle>>(new Map());
  const filterPrefetchingRef = useRef(false);
  const contributionCollapseMemoryRef = useRef<{
    pendingRestore: boolean;
    restoreCollapsed: boolean;
  }>({ pendingRestore: false, restoreCollapsed: false });
  const prevTabRef = useRef<AppTab>(activeTab);
  const manualInstallCommand = `curl -fsSL "https://raw.githubusercontent.com/${UPDATE_REPO}/main/install.sh" | bash`;

  useEffect(() => {
    const staleThemeClasses: string[] = [];
    document.body.classList.forEach((cls) => {
      if (cls.startsWith("ow-theme-")) staleThemeClasses.push(cls);
    });
    if (staleThemeClasses.length) {
      document.body.classList.remove(...staleThemeClasses);
    }
    document.body.classList.add(`ow-theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    const raw = localStorage.getItem("opiumware/settings/editor");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<EditorSettings> & { theme?: AppTheme };
      setEditorSettings((prev) => ({ ...prev, ...parsed }));
      if (parsed.theme) setTheme(parsed.theme);
    } catch {
      // ignore invalid settings
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "opiumware/settings/editor",
      JSON.stringify({ ...editorSettings, theme })
    );
  }, [editorSettings, theme]);

  useEffect(() => {
    const auto = localStorage.getItem("opiumware/update/auto");
    setAutoUpdateEnabled(auto === "1");
    void fetch("/version.txt")
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!text.trim()) {
          setMissingVersionPromptOpen(true);
          const savedVersion = localStorage.getItem("opiumware/version/current");
          if (savedVersion) setLocalVersion(savedVersion);
          return;
        }
        const parsed = text.trim();
        setLocalVersion(parsed);
        localStorage.setItem("opiumware/version/current", parsed);
      })
      .catch(() => {
        setMissingVersionPromptOpen(true);
        const savedVersion = localStorage.getItem("opiumware/version/current");
        if (savedVersion) setLocalVersion(savedVersion);
      });
  }, []);

  useEffect(() => {
    invoke<string | null>("get_downloads_version")
      .then((value) => {
        const parsed = (value || "").trim();
        if (!parsed) {
          setHasLocalVersionFile(false);
          setDownloadsVersion(null);
          return;
        }
        setHasLocalVersionFile(true);
        setDownloadsVersion(parsed);
        setLocalVersion(parsed);
        localStorage.setItem("opiumware/version/current", parsed);
      })
      .catch(() => {
        setHasLocalVersionFile(false);
        setDownloadsVersion(null);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem("opiumware/update/auto", autoUpdateEnabled ? "1" : "0");
  }, [autoUpdateEnabled]);

  useEffect(() => {
    void fetch(OPIUMWARE_VERSION_JSON_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const json = (data ?? {}) as OpiumwareVersionJson;
        if (json.CurrentVersion) setOpiumwareVersion(json.CurrentVersion);
        if (json.SupportedRobloxVersion) {
          setOpiumwareRobloxVersion(json.SupportedRobloxVersion);
        }
        if (json.Changelog) setOpiumwareChangelog(json.Changelog);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetch("/opiumwareapi.js")
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!text) return;
        const arrayMatch = text.match(/DEFAULT_PORTS\s*=\s*\[([^\]]+)\]/);
        if (!arrayMatch?.[1]) return;
        const found = arrayMatch[1]
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((port) => Number.isInteger(port) && port > 0);
        if (found.length === 0) return;
        setPorts(found);
        setSelectedPort((prev) => (found.includes(prev) ? prev : found[0]));
      })
      .catch(() => {
        setPorts(fallbackPorts);
        setSelectedPort((prev) => (fallbackPorts.includes(prev) ? prev : fallbackPorts[0]));
      });
  }, []);

  useEffect(() => {
    if (!ports.includes(selectedPort)) {
      setSelectedPort(ports[0] ?? 8392);
    }
  }, [ports, selectedPort]);

  useEffect(() => {
    const prevTab = prevTabRef.current;
    if (activeTab === "contribution" && prevTab !== activeTab) {
      contributionCollapseMemoryRef.current = {
        pendingRestore: true,
        restoreCollapsed: primaryCollapsed,
      };
      setPrimaryCollapsed(true);
    }
    if (
      prevTab === "contribution" &&
      activeTab !== prevTab &&
      contributionCollapseMemoryRef.current.pendingRestore
    ) {
      setPrimaryCollapsed(contributionCollapseMemoryRef.current.restoreCollapsed);
      contributionCollapseMemoryRef.current.pendingRestore = false;
    }
    prevTabRef.current = activeTab;
  }, [activeTab, primaryCollapsed]);

  const pushToast = useCallback((message: string, level: AppToast["level"]) => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, level, closing: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((item) => (item.id === id ? { ...item, closing: true } : item))
      );
    }, 9700);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 10050);
  }, []);

  const writeDownloadsVersion = useCallback(async (version: string) => {
    try {
      await invoke("write_downloads_version", { version });
      return true;
    } catch {
      return false;
    }
  }, []);

  const startUpdateDownload = useCallback(async (targetVersion: string, preferredAssetUrl?: string | null) => {
    setUpdateProgressOpen(true);
    setUpdateProgress(0);
    setUpdateError(null);
    setUpdateStatusText("Fetching latest release...");

    try {
      let assetUrl = preferredAssetUrl?.trim() || "";
      if (!assetUrl) {
        const releaseRes = await fetch(RELEASE_API_URL);
        if (!releaseRes.ok) throw new Error("Failed to fetch latest release.");
        const releaseData = (await releaseRes.json()) as LatestReleaseResponse;
        assetUrl = pickIntelDmgAssetUrl(releaseData.assets ?? []) ?? "";
        const notesFromRelease = String(releaseData.body ?? "").trim();
        if (notesFromRelease) setUpdateNotes(notesFromRelease);
      }
      if (!assetUrl) throw new Error("No downloadable macOS asset found. Set `dmgUrl` in updateversion.json.");

      setUpdateStatusText("Downloading update...");
      const response = await fetch(assetUrl);
      if (!response.ok) throw new Error("Failed to download update asset.");
      const total = Number(response.headers.get("content-length") || 0);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Browser does not support streamed downloads.");

      const bytes: number[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        bytes.push(...value);
        received += value.length;
        if (total > 0) {
          setUpdateProgress(Math.max(2, Math.min(100, Math.round((received / total) * 100))));
        }
      }

      const lowerUrl = assetUrl.toLowerCase();
      const mime = lowerUrl.endsWith(".dmg")
        ? "application/x-apple-diskimage"
        : "application/octet-stream";
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      const downloadUrl = URL.createObjectURL(blob);
      let fileName = "Opiumware-latest.dmg";
      try {
        const url = new URL(assetUrl);
        fileName = url.pathname.split("/").pop() || fileName;
      } catch {
        fileName = assetUrl.split("/").pop() || fileName;
      }
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(downloadUrl);

      const written = await writeDownloadsVersion(targetVersion);
      if (!written) {
        triggerTextDownload("version.txt", `${targetVersion}\n`);
      }
      setHasLocalVersionFile(true);
      setDownloadsVersion(targetVersion);
      localStorage.setItem("opiumware/version/current", targetVersion);
      setLocalVersion(targetVersion);
      setUpdateProgress(100);
      setUpdateStatusText("Update downloaded. Open the DMG to install.");
      pushToast("Update downloaded", "success");
    } catch (error) {
      const message = String((error as Error)?.message || "Update failed.");
      setUpdateStatusText("Update failed. Trying install.sh fallback...");
      try {
        const fallbackResult = await invoke<string>("run_install_script", { repo: UPDATE_REPO });
        const fallbackMsg = String(fallbackResult || "").trim();
        setUpdateError(null);
        setUpdateProgress(100);
        setUpdateStatusText(
          fallbackMsg || "Update installed via install.sh. Restart app to finish."
        );
        pushToast("Update installed via install.sh. Restart app.", "success");
      } catch {
        setUpdateError(message);
        setUpdateStatusText("Update failed.");
        setManualUpdatePromptOpen(true);
        pushToast("Update failed", "error");
      }
    }
  }, [pushToast, writeDownloadsVersion, manualInstallCommand]);

  const checkForUpdates = useCallback(async (manual = false) => {
    setIsCheckingUpdates(true);
    try {
      if (manual && !hasLocalVersionFile) {
        setMissingVersionNoWarning(false);
        setMissingVersionPromptOpen(true);
        return;
      }
      let meta: UpdateVersionJson | null = null;
      try {
        const text = await invoke<string>("fetch_url_text", { url: REMOTE_UPDATE_JSON_URL });
        meta = JSON.parse(text) as UpdateVersionJson;
      } catch {
        const localMetaRes = await fetch("/updateversion.json").catch(() => null);
        if (localMetaRes && localMetaRes.ok) {
          meta = (await localMetaRes.json()) as UpdateVersionJson;
        }
      }
      if (!meta) return;
      const remote = String(
        meta.latestUiVersion ?? meta.uiVersion ?? meta.version ?? ""
      ).trim();
      if (!remote) return;
      setRemoteVersion(remote);
      const notes = String(meta.updateLogs ?? meta.changelog ?? meta.notes ?? "").trim();
      if (notes) setUpdateNotes(notes);
      const dmg = String(meta.dmgUrl ?? meta.releaseDmgUrl ?? meta.downloadUrl ?? "").trim();
      setRemoteDmgUrl(dmg || null);
      const currentKnownVersion = downloadsVersion || localVersion;
      if (normalizeVersion(remote) === normalizeVersion(currentKnownVersion)) {
        if (manual) pushToast("You are on the latest UI version.", "info");
        return;
      }
      if (autoUpdateEnabled) {
        void startUpdateDownload(remote, dmg || null);
        return;
      }
      setUpdatePromptOpen(true);
    } catch {
      // ignore update check errors
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [
    autoUpdateEnabled,
    downloadsVersion,
    hasLocalVersionFile,
    localVersion,
    pushToast,
    startUpdateDownload,
  ]);

  useEffect(() => {
    if (!localVersion) return;
    void checkForUpdates();
  }, [localVersion, checkForUpdates]);

  const callPortApi = useCallback(
    async (port: number, action: "attach" | "execute", script: string) => {
      try {
        const result = await invoke<string>("OpiumwareExecution", {
          code: action === "attach" ? "NULL" : script,
          port: String(port),
        });
        const normalized = result.toLowerCase();
        if (action === "attach") {
          return (
            normalized.includes("successfully attached") ||
            normalized.includes("successfully connected")
          );
        }
        return (
          normalized.includes("successfully executed") ||
          normalized.includes("script sent")
        );
      } catch {
        return false;
      }
    },
    []
  );

  const attachToPort = useCallback(
    async (port: number) => {
      const ok = await callPortApi(port, "attach", "");
      if (ok) {
        setAttachedPorts((prev) => (prev.includes(port) ? prev : [...prev, port]));
        setPortStatus(`Attached ${port}`);
        pushToast(`Attached to ${port}`, "success");
        return true;
      }
      setPortStatus(`Attach failed ${port}`);
      pushToast(`Attach failed on ${port}`, "error");
      return false;
    },
    [callPortApi, pushToast]
  );

  const attachToAvailable = useCallback(async () => {
    const attached: number[] = [];
    for (const port of ports) {
      const ok = await callPortApi(port, "attach", "");
      if (ok) attached.push(port);
    }
    setAttachedPorts(attached);
    if (attached.length > 0) {
      setPortStatus(`Attached ${attached.length} ports`);
      pushToast(`Attached ${attached.length} available ports`, "success");
      return attached;
    }
    setPortStatus("Attach failed on available ports");
    pushToast("Attach failed on available ports", "error");
    return [];
  }, [ports, callPortApi, pushToast]);

  useEffect(() => {
    if (attachedPorts.length === 0) return;
    const timer = setInterval(() => {
      void (async () => {
        const checks = await Promise.all(
          attachedPorts.map(async (port) => ({
            port,
            ok: await callPortApi(port, "attach", ""),
          }))
        );
        const alive = checks.filter((entry) => entry.ok).map((entry) => entry.port);
        if (alive.length === attachedPorts.length) return;
        const dropped = attachedPorts.filter((port) => !alive.includes(port));
        setAttachedPorts(alive);
        setPortStatus(`Detached ${dropped.join(", ")}`);
        pushToast(`Port closed: ${dropped.join(", ")}`, "error");
      })();
    }, 2000);
    return () => clearInterval(timer);
  }, [attachedPorts, callPortApi, pushToast]);

  const executeScriptToTargets = useCallback(
    async (script: string) => {
      const trimmedScript = script.trim();
      if (!trimmedScript) {
        setPortStatus("Script is empty");
        pushToast("Script is empty", "error");
        return;
      }

      let targets =
        attachMode === "available"
          ? [...attachedPorts]
          : attachedPorts.includes(selectedPort)
            ? [selectedPort]
            : [];

      if (targets.length === 0 && editorSettings.autoAttach) {
        if (attachMode === "available") {
          targets = await attachToAvailable();
        } else {
          const okAttach = await attachToPort(selectedPort);
          if (okAttach) targets = [selectedPort];
        }
      }

      if (targets.length === 0) {
        setPortStatus("No attached ports");
        pushToast("No attached ports", "error");
        return;
      }

      const results = await Promise.all(
        targets.map(async (port) => ({
          port,
          ok: await callPortApi(port, "execute", trimmedScript),
        }))
      );
      const success = results.filter((item) => item.ok).map((item) => item.port);
      const failed = results.filter((item) => !item.ok).map((item) => item.port);

      if (failed.length > 0) {
        setAttachedPorts((prev) => prev.filter((port) => !failed.includes(port)));
      }

      if (success.length > 0 && failed.length === 0) {
        setPortStatus(`Executed ${success.length} port(s)`);
        pushToast(`Executed on ${success.join(", ")}`, "success");
        return;
      }
      if (success.length > 0) {
        setPortStatus(`Executed ${success.length}, failed ${failed.length}`);
        pushToast(`Executed: ${success.join(", ")} | Failed: ${failed.join(", ")}`, "info");
        return;
      }
      setPortStatus(`Execute failed on ${failed.join(", ")}`);
      pushToast(`Execute failed on ${failed.join(", ")}`, "error");
    },
    [
      attachMode,
      attachedPorts,
      selectedPort,
      editorSettings.autoAttach,
      attachToAvailable,
      attachToPort,
      callPortApi,
      pushToast,
    ]
  );

  const executeScriptToPort = useCallback(
    async (port: number, script: string) => {
      const trimmedScript = script.trim();
      if (!trimmedScript) {
        pushToast("Script is empty", "error");
        return false;
      }
      const ok = await callPortApi(port, "execute", trimmedScript);
      if (ok) {
        setPortStatus(`Executed on ${port}`);
        pushToast(`Executed on ${port}`, "success");
        return true;
      }
      setAttachedPorts((prev) => prev.filter((item) => item !== port));
      setPortStatus(`Execute failed on ${port}`);
      pushToast(`Execute failed on ${port}`, "error");
      return false;
    },
    [callPortApi, pushToast]
  );

  const focusInstanceWindow = useCallback(
    async (port: number) => {
      const ok = await callPortApi(port, "execute", "OpiumwareSetting FocusWindow true");
      if (!ok) {
        setAttachedPorts((prev) => prev.filter((item) => item !== port));
        pushToast(`Could not focus window on ${port}`, "error");
        return false;
      }
      pushToast(`Focused Roblox window on ${port}`, "success");
      return true;
    },
    [callPortApi, pushToast]
  );

  const closeInstanceWindow = useCallback(
    async (port: number) => {
      const ok = await callPortApi(port, "execute", "OpiumwareSetting CloseWindow true");
      if (!ok) {
        setAttachedPorts((prev) => prev.filter((item) => item !== port));
        pushToast(`Could not close window on ${port}`, "error");
        return false;
      }
      setAttachedPorts((prev) => prev.filter((item) => item !== port));
      pushToast(`Closed Roblox window on ${port}`, "info");
      return true;
    },
    [callPortApi, pushToast]
  );

  const fetchScriptPage = useCallback(
    async (page: number, replace: boolean) => {
      if (loadingScriptsRef.current) return;
      loadingScriptsRef.current = true;
      setLoadingScripts(true);
      try {
        const query = scriptQuery.trim();
        const endpoints = query
          ? [
              `https://scriptblox.com/api/script/search?q=${encodeURIComponent(
                query
              )}&max=${SCRIPT_PAGE_SIZE}&mode=all&page=${page}`,
              `https://scriptblox.com/api/script/search?q=${encodeURIComponent(
                query
              )}&max=${SCRIPT_PAGE_SIZE}&mode=all`,
              `https://scriptblox.com/api/script/search?q=${encodeURIComponent(query)}`,
            ]
          : [
              `https://scriptblox.com/api/script/fetch?max=${SCRIPT_PAGE_SIZE}&page=${page}`,
              `https://scriptblox.com/api/script/fetch?page=${page}`,
              `https://scriptblox.com/api/script/search?q=&max=${SCRIPT_PAGE_SIZE}&mode=all&page=${page}`,
            ];

        let rawScripts: Array<Record<string, unknown>> = [];
        for (const endpoint of endpoints) {
          const response = await fetch(endpoint, { method: "GET" });
          if (!response.ok) continue;
          const data = (await response.json()) as unknown;
          rawScripts = getScriptItemsFromResponse(data);
          if (rawScripts.length > 0 || endpoint === endpoints[endpoints.length - 1]) {
            break;
          }
        }
      const mappedAll: ScriptEntry[] = rawScripts.map((item, index) => {
            const game = toRecord(item.game);
            const key = toRecord(item.key);
            const verified =
              toBool(item.verified) ||
              toBool(item.isVerified) ||
              toBool(item.verifiedScript) ||
              hasTag(item.tags, "verified");
            const paid =
              toBool(item.paid) ||
              toBool(item.isPaid) ||
              toBool(item.premium) ||
              toBool(item.price) ||
              toBool(item.isPremium) ||
              hasTag(item.tags, "paid") ||
              hasTag(item.tags, "premium");
            const keySystem =
              toBool(item.keySystem) ||
              toBool(item.keysystem) ||
              toBool(item.keyRequired) ||
              toBool(item.hasKeySystem) ||
              toBool(key?.system) ||
              hasTag(item.tags, "key");
            const imageUrl =
              String(
                item.image ??
                  item.imageUrl ??
                  item.thumbnail ??
                  game?.image ??
                  game?.imageUrl ??
                  ""
              ) || null;
            const bannerUrl =
              String(
                item.banner ??
                  item.bannerUrl ??
                  game?.banner ??
                  game?.bannerUrl ??
                  item.thumbnail ??
                  ""
              ) || null;

            return {
              id: String(item._id ?? item.slug ?? `script-${page}-${index}`),
              title: String(item.title ?? item.name ?? "Untitled Script"),
              game: String(game?.name ?? item.gameName ?? item.game_title ?? "Unknown"),
              views: Number(item.views ?? item.viewCount ?? 0),
              verified,
              paid,
              keySystem,
              free: !paid,
              imageUrl,
              bannerUrl,
              script: String(item.script ?? item.content ?? ""),
            };
          });

        setScripts((prev) => {
          if (replace) return mappedAll;
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of mappedAll) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });
        setHasMoreScripts(mappedAll.length >= SCRIPT_PAGE_SIZE);
        setScriptPage(page);
        if (replace) {
          setSelectedScriptId((prev) =>
            mappedAll.some((script) => script.id === prev) ? prev : mappedAll[0]?.id ?? null
          );
        }
      } catch {
        if (replace) {
          setScripts([]);
          setSelectedScriptId(null);
          setHasMoreScripts(false);
        }
      } finally {
        loadingScriptsRef.current = false;
        setLoadingScripts(false);
      }
    },
    [scriptQuery]
  );

  const refreshScripts = useCallback(async () => {
    setScriptPage(1);
    setHasMoreScripts(true);
    await fetchScriptPage(1, true);
  }, [fetchScriptPage]);

  const loadMoreScripts = useCallback(async () => {
    if (!hasMoreScripts || loadingScripts) return;
    await fetchScriptPage(scriptPage + 1, false);
  }, [fetchScriptPage, hasMoreScripts, loadingScripts, scriptPage]);

  useEffect(() => {
    if (activeTab !== "library") return;
    const timer = setTimeout(() => {
      void refreshScripts();
    }, 220);
    return () => clearTimeout(timer);
  }, [activeTab, scriptQuery, refreshScripts]);

  useEffect(() => {
    if (activeTab !== "library") return;
    const filterEnabled =
      scriptFilters.mode !== "all" ||
      scriptFilters.verifiedOnly ||
      scriptFilters.keySystem !== "all";
    if (!filterEnabled) return;
    if (filterPrefetchingRef.current) return;
    if (loadingScriptsRef.current) return;
    if (!hasMoreScripts) return;

    const matchedCount = scripts.filter((script) =>
      matchesScriptFilters(script, scriptFilters)
    ).length;
    const needsMore = scripts.length < 1250 && matchedCount < 200;
    if (!needsMore) return;

    filterPrefetchingRef.current = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let page = scriptPage;
          let total = scripts.length;
          let rounds = 0;
          while (rounds < 8 && total < 1250 && hasMoreScripts) {
            rounds += 1;
            await fetchScriptPage(page + 1, false);
            page += 1;
            total += SCRIPT_PAGE_SIZE;
          }
        } finally {
          filterPrefetchingRef.current = false;
        }
      })();
    }, 120);
    return () => {
      clearTimeout(timer);
      filterPrefetchingRef.current = false;
    };
  }, [
    activeTab,
    scripts,
    scriptFilters,
    hasMoreScripts,
    scriptPage,
    fetchScriptPage,
  ]);

  useEffect(() => {
    if (!editorSettings.autoAttach) return;
    if (attachMode === "available") {
      if (attachedPorts.length > 0) return;
      void attachToAvailable();
      return;
    }
    if (attachedPorts.includes(selectedPort)) return;
    void attachToPort(selectedPort);
  }, [editorSettings.autoAttach, attachMode, attachedPorts, selectedPort, attachToPort, attachToAvailable]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (attachedPorts.length === 0) return;
      const shouldClosePorts = window.confirm(
        "Close all Opiumware ports before exit?\n\nOK = close ports\nCancel = leave them attached"
      );
      if (!shouldClosePorts) return;
      const targets = Array.from(new Set([...attachedPorts, ...ports]));
      const detachPaths = ["/detach", "/close", "/api/detach", "/api/close", "/v1/detach", "/v1/close"];
      for (const port of targets) {
        for (const path of detachPaths) {
          void fetch(`http://127.0.0.1:${port}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [attachedPorts, ports]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingResizerRef.current) return;
      const min = 180;
      const max = 520;
      setSecondaryWidth(Math.max(min, Math.min(max, event.clientX - 76)));
    };
    const onMouseUp = () => {
      draggingResizerRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const json = await invoke<string>("load_notes");
        if (!mounted) return;
        const parsed = JSON.parse(json) as Note[];
        dispatch({ type: "LOAD_NOTES", notes: Array.isArray(parsed) ? parsed : [] });
      } catch {
        if (mounted) {
          const local = localStorage.getItem("opiumware/autosave/default/files.json");
          if (local) {
            try {
              const parsedLocal = JSON.parse(local) as Note[];
              dispatch({
                type: "LOAD_NOTES",
                notes: Array.isArray(parsedLocal) ? parsedLocal : fallbackNotes(),
              });
              return;
            } catch {
              // ignore and fallback
            }
          }
          dispatch({ type: "LOAD_NOTES", notes: fallbackNotes() });
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const persistNotesNow = useCallback((notes: Note[]) => {
    const output = editorSettings.trimTrailingWhitespaceOnSave
      ? notes.map((note) => ({
          ...note,
          body: note.body
            .split("\n")
            .map((line) => line.replace(/[ \t]+$/g, ""))
            .join("\n"),
        }))
      : notes;
    const payload = JSON.stringify(output);
    try {
      localStorage.setItem("opiumware/autosave/default/files.json", payload);
    } catch {
      // ignore storage quota/errors
    }
    invoke("save_notes", { notesJson: payload }).catch(() => {
      // no-op in non-tauri contexts
    });
  }, [editorSettings.trimTrailingWhitespaceOnSave]);

  const persistNotes = useCallback(
    (notes: Note[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        persistNotesNow(notes);
      }, editorSettings.autosaveMs);
    },
    [editorSettings.autosaveMs, persistNotesNow]
  );

  useEffect(() => {
    if (state.notes.length > 0) persistNotes(state.notes);
  }, [state.notes, persistNotes]);

  useEffect(() => {
    setClosedNoteIds((prev) => prev.filter((id) => state.notes.some((note) => note.id === id)));
  }, [state.notes]);

  const visibleNotes = useMemo(
    () => state.notes.filter((note) => !closedNoteIds.includes(note.id)),
    [state.notes, closedNoteIds]
  );
  const activeNote = useMemo(
    () => visibleNotes.find((note) => note.id === state.activeNoteId) ?? null,
    [visibleNotes, state.activeNoteId]
  );
  const saveActiveNoteToFile = useCallback(async () => {
    if (!activeNote) return;
    persistNotesNow(state.notes);
    const extension = activeNote.title.includes(".")
      ? activeNote.title.slice(activeNote.title.lastIndexOf("."))
      : ".txt";

    try {
      let handle = fileHandleByNoteIdRef.current.get(activeNote.id);
      if (!handle && "showSaveFilePicker" in window) {
        handle = await (window as unknown as {
          showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: activeNote.title || "untitled.txt",
          types: [
            {
              description: "Code Files",
              accept: { "text/plain": [extension || ".txt", ".txt", ".ts", ".tsx", ".js", ".lua"] },
            },
          ],
        });
        fileHandleByNoteIdRef.current.set(activeNote.id, handle);
      }

      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(activeNote.body);
        await writable.close();
        pushToast(`Saved ${activeNote.title}`, "success");
        return;
      }
    } catch (error) {
      const message = String((error as Error)?.message || "");
      if (message.toLowerCase().includes("abort")) return;
    }

    const blob = new Blob([activeNote.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeNote.title || "untitled.txt";
    link.click();
    URL.revokeObjectURL(url);
    pushToast(`Downloaded ${activeNote.title}`, "info");
  }, [activeNote, persistNotesNow, pushToast, state.notes]);
  const filteredScripts = useMemo(
    () => scripts.filter((script) => matchesScriptFilters(script, scriptFilters)),
    [scripts, scriptFilters]
  );
  useEffect(() => {
    setSelectedScriptId((prev) =>
      filteredScripts.some((script) => script.id === prev) ? prev : filteredScripts[0]?.id ?? null
    );
  }, [filteredScripts]);
  const selectedScript = useMemo(
    () => filteredScripts.find((script) => script.id === selectedScriptId) ?? null,
    [filteredScripts, selectedScriptId]
  );

  const activeTabMeta = useMemo(() => {
    if (activeTab === "library") {
      return { label: "Script Library", icon: <BookMarked size={13} /> };
    }
    if (activeTab === "account") {
      return {
        label: accountSection === "instances" ? "Instance Manager" : "Account Manager",
        icon: accountSection === "instances" ? <Users size={13} /> : <User size={13} />,
      };
    }
    if (activeTab === "contribution") {
      return { label: "Contribution", icon: <Users size={13} /> };
    }
    if (activeTab === "settings") {
      return { label: "Settings", icon: <Settings2 size={13} /> };
    }
    return { label: "Code Editor", icon: <Code2 size={13} /> };
  }, [activeTab, accountSection]);

  const handleWindowDragMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("button, input, textarea, select, a, [role='button']")) return;
    void getCurrentWindow().startDragging().catch(() => {});
  }, []);

  return (
    <div className="ow-shell">
      <header
        className="ow-topbar"
        data-tauri-drag-region
        onMouseDown={handleWindowDragMouseDown}
      >
        <div className="ow-topbar-left" data-tauri-drag-region />
        <div className="ow-topbar-center">
          {activeTabMeta.icon}
          <span>{activeTabMeta.label}</span>
        </div>
        <div className="ow-topbar-right" data-tauri-drag-region />
      </header>
      <div
        className={`ow-app ${primaryCollapsed ? "primary-collapsed" : ""}`}
        style={
          {
            "--ow-secondary-width": `${secondaryWidth}px`,
          } as CSSProperties
        }
      >
        <Sidebar
          activeTab={activeTab}
          collapsed={primaryCollapsed}
          collapseLocked={activeTab === "contribution"}
          onToggleCollapsed={() => setPrimaryCollapsed((v) => !v)}
          onLockedToggleAttempt={() =>
            pushToast("Sidebar is locked while on Contribution tab.", "info")
          }
          onSelectTab={setActiveTab}
          onStartDrag={handleWindowDragMouseDown}
        />

        <NoteList
          activeTab={activeTab}
          notes={visibleNotes}
          activeNoteId={state.activeNoteId}
          activeSettingsSection={settingsSection}
          activeAccountSection={accountSection}
          confirmBeforeDelete={editorSettings.confirmBeforeDelete}
          onSetConfirmBeforeDelete={(value) =>
            setEditorSettings((prev) => ({ ...prev, confirmBeforeDelete: value }))
          }
          onSelectSettingsSection={setSettingsSection}
          onSelectAccountSection={setAccountSection}
          onSelectNote={(id) => dispatch({ type: "SELECT_NOTE", id })}
          onCloseNote={(id) => {
            setClosedNoteIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
            dispatch({ type: "CLOSE_NOTE", id });
          }}
          onDeleteNote={(id) => {
            setClosedNoteIds((prev) => prev.filter((noteId) => noteId !== id));
            dispatch({ type: "DELETE_NOTE", id });
          }}
          onRenameNote={(id) => {
            const note = visibleNotes.find((n) => n.id === id);
            const nextName = window.prompt("Rename file", note?.title || "untitled.txt");
            if (!nextName) return;
            dispatch({ type: "RENAME_NOTE", id, name: nextName });
          }}
          onDuplicateNote={(id) => dispatch({ type: "DUPLICATE_NOTE", id })}
          onReorderNote={(sourceId, targetId) =>
            dispatch({ type: "MOVE_NOTE_TO", sourceId, targetId })
          }
          onCreateFile={() => dispatch({ type: "CREATE_FILE" })}
          onCreateFromClipboard={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (!text) return;
              dispatch({ type: "CREATE_FILE", body: text, title: "pasted.txt" });
            } catch {
              // ignore clipboard permission issues
            }
          }}
          onCopyFilePath={(id) => {
            const note = visibleNotes.find((n) => n.id === id);
            if (!note) return;
            void navigator.clipboard
              .writeText(note.title)
              .then(() => pushToast("File path copied", "success"))
              .catch(() => pushToast("Copy failed", "error"));
          }}
          onImportFiles={(files) => {
            if (!files || files.length === 0) return;
            void Promise.all(Array.from(files).map(fileToNote)).then((notes) => {
              setClosedNoteIds((prev) =>
                prev.filter((id) => !notes.some((note) => note.id === id))
              );
              dispatch({ type: "IMPORT_FILES", notes });
            });
          }}
          scripts={filteredScripts}
          scriptQuery={scriptQuery}
          onScriptQueryChange={setScriptQuery}
          scriptFilters={scriptFilters}
          onScriptFiltersChange={(next) => setScriptFilters((prev) => ({ ...prev, ...next }))}
          onRefreshScripts={() => void refreshScripts()}
          onLoadMoreScripts={() => void loadMoreScripts()}
          hasMoreScripts={hasMoreScripts}
          loadingScripts={loadingScripts}
          onSelectScript={setSelectedScriptId}
          selectedScriptId={selectedScriptId}
        />
        <div
          className="ow-resizer"
          onMouseDown={() => {
            if (primaryCollapsed) return;
            draggingResizerRef.current = true;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
          }}
        />

        <Editor
          activeTab={activeTab}
          note={activeNote}
          settingsSection={settingsSection}
          accountSection={accountSection}
          theme={theme}
          settings={editorSettings}
          onThemeChange={setTheme}
          onSettingsChange={(next) => setEditorSettings((prev) => ({ ...prev, ...next }))}
          onSaveNow={() => void saveActiveNoteToFile()}
          onAutosave={() => persistNotesNow(state.notes)}
          opiumwareVersion={opiumwareVersion}
          opiumwareRobloxVersion={opiumwareRobloxVersion}
          opiumwareChangelog={opiumwareChangelog}
          uiVersion={localVersion}
          uiLatestVersion={remoteVersion ?? localVersion}
          uiDownloadsVersion={downloadsVersion ?? ""}
          uiUpdateLogs={updateNotes}
          isCheckingUpdates={isCheckingUpdates}
          onCheckForUpdates={() => void checkForUpdates(true)}
          onChange={(body) => {
            if (!state.activeNoteId) return;
            dispatch({ type: "UPDATE_NOTE", id: state.activeNoteId, body });
          }}
          ports={ports}
          selectedPort={selectedPort}
          attachedPorts={attachedPorts}
          portStatus={portStatus}
          attachMode={attachMode}
          onSelectPort={setSelectedPort}
          onAttachModeChange={setAttachMode}
          onAttachPort={async () => {
            if (attachMode === "available") {
              await attachToAvailable();
              return;
            }
            await attachToPort(selectedPort);
          }}
          onExecuteScript={async (script) => {
            await executeScriptToTargets(script);
          }}
          onExecuteScriptToPort={async (port, script) => {
            await executeScriptToPort(port, script);
          }}
          onOpenInstanceWindow={async (port) => {
            await focusInstanceWindow(port);
          }}
          onCloseInstanceWindow={async (port) => {
            await closeInstanceWindow(port);
          }}
          onClearCurrent={() => {
            setPortStatus("Cleared editor");
            pushToast("Editor cleared", "info");
          }}
          selectedScript={selectedScript}
          onCreateFileFromScript={(script) => {
            dispatch({ type: "CREATE_FILE", title: `${script.title}.lua`, body: script.script });
            setActiveTab("code");
            pushToast("Script copied to code editor", "success");
          }}
          onExecuteSelectedScript={(script) => {
            void (async () => {
              await executeScriptToTargets(script.script);
            })();
          }}
          onCopySelectedScript={(script) => {
            void navigator.clipboard
              .writeText(script.script)
              .then(() => pushToast("Script copied", "success"))
              .catch(() => pushToast("Copy failed", "error"));
          }}
        />
      </div>

      {missingVersionPromptOpen && (
        <div className="ow-missing-version-overlay">
          <div className="ow-missing-version-card">
            <h3>version.txt not found</h3>
            <p>Create and download a local `version.txt` now?</p>
            {missingVersionNoWarning && (
              <p className="ow-missing-version-warning">
                Without `version.txt`, update checks may be inaccurate. Press Later again to continue.
              </p>
            )}
            <div className="ow-missing-version-actions">
              <button
                type="button"
                className="ow-toolbar-btn ow-confirm-yes"
                onClick={() => {
                  void (async () => {
                    const written = await writeDownloadsVersion(localVersion);
                    if (!written) {
                      triggerTextDownload("version.txt", `${localVersion}\n`);
                    }
                    setHasLocalVersionFile(true);
                    setDownloadsVersion(localVersion);
                    setMissingVersionNoWarning(false);
                    setMissingVersionPromptOpen(false);
                  })();
                }}
              >
                Create
              </button>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => {
                  if (!missingVersionNoWarning) {
                    setMissingVersionNoWarning(true);
                    return;
                  }
                  setMissingVersionPromptOpen(false);
                  setMissingVersionNoWarning(false);
                }}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {updatePromptOpen && (
        <div
          className="ow-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUpdatePromptOpen(false);
          }}
        >
          <div className="ow-modal-card ow-update-card">
            <h3>
              <Download size={16} />
              Update Available
            </h3>
            <p>
              Current: <strong>{localVersion}</strong>
            </p>
            <p>
              Latest: <strong>{remoteVersion ?? "unknown"}</strong>
            </p>
            <div className="ow-modal-actions">
              <button
                type="button"
                className="ow-toolbar-btn ow-confirm-yes"
                onClick={() => {
                  setUpdateModeOpen(true);
                }}
              >
                Update
              </button>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => setUpdatePromptOpen(false)}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {updateModeOpen && (
        <div
          className="ow-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUpdateModeOpen(false);
          }}
        >
          <div className="ow-modal-card ow-update-card">
            <h3>
              <Settings2 size={16} />
              Update Mode
            </h3>
            <p>Choose how updates should run.</p>
            <label className="ow-confirm-toggle-row">
              <span>Enable auto update</span>
              <input
                className="ow-setting-toggle"
                type="checkbox"
                checked={autoUpdateEnabled}
                onChange={(event) => setAutoUpdateEnabled(event.target.checked)}
              />
            </label>
            <div className="ow-modal-actions">
              <button
                type="button"
                className="ow-toolbar-btn ow-confirm-yes"
                onClick={() => {
                  if (remoteVersion) void startUpdateDownload(remoteVersion, remoteDmgUrl);
                }}
              >
                Continue
              </button>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => setUpdateModeOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {updateProgressOpen && (
        <div
          className="ow-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUpdateProgressOpen(false);
          }}
        >
          <div className="ow-modal-card ow-update-progress-card">
            <div className="ow-update-progress-left">
              <h3>
                <LoaderCircle size={16} />
                Update Progress
              </h3>
              <p>{updateStatusText}</p>
              <div className="ow-update-notes">
                <strong>Update changes</strong>
                <pre>{updateNotes || "No notes available."}</pre>
              </div>
              {updateError && <p className="ow-update-error">{updateError}</p>}
            </div>
            <div className="ow-update-progress-right">
              <div
                className="ow-update-ring"
                style={{ "--ow-progress": `${updateProgress}` } as CSSProperties}
              >
                <span>{updateProgress}%</span>
              </div>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => setUpdateProgressOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {manualUpdatePromptOpen && (
        <div
          className="ow-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setManualUpdatePromptOpen(false);
          }}
        >
          <div className="ow-modal-card ow-update-card">
            <h3>
              <Download size={16} />
              Update failed
            </h3>
            <p>Update failed! Try it manually with this code:</p>
            <pre className="ow-script-preview">{manualInstallCommand}</pre>
            <div className="ow-modal-actions ow-three">
              <button
                type="button"
                className="ow-toolbar-btn ow-confirm-yes"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(manualInstallCommand)
                    .then(() => pushToast("Copied install command", "success"))
                    .catch(() => pushToast("Copy failed", "error"));
                }}
              >
                <Copy size={13} />
                Copy
              </button>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => {
                  void invoke("open_terminal")
                    .then(() => pushToast("Terminal opened", "info"))
                    .catch(() => pushToast("Could not open terminal", "error"));
                }}
              >
                <TerminalSquare size={13} />
                Open Terminal
              </button>
              <button
                type="button"
                className="ow-toolbar-btn"
                onClick={() => setManualUpdatePromptOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ow-toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ow-toast ${toast.level} ${toast.closing ? "closing" : "enter"}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
