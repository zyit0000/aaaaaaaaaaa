import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookMarked, Code2, Settings2 } from "lucide-react";

import Editor from "./components/Editor";
import NoteList from "./components/NoteList";
import Sidebar from "./components/Sidebar";
import type { AppTab, AppTheme, EditorSettings, Note, SettingsSection } from "./types";
import type { ScriptEntry } from "./types";
import { generateId } from "./utils";

interface AppState {
  notes: Note[];
  activeNoteId: string | null;
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
  activeNoteId: null,
};

const defaultEditorSettings: EditorSettings = {
  wordWrap: false,
  showLineNumbers: true,
  relativeLineNumbers: false,
  spellCheck: false,
  autosaveOnBlur: true,
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

function toFileName(title: string, index: number): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/\-]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || `file-${index + 1}.ts`;
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

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD_NOTES": {
      const prepared = sortByUpdatedAt(action.notes).map((note, index) => ({
        ...note,
        title: toFileName(note.title || note.body.split("\n").find(Boolean) || "", index),
      }));
      return { notes: prepared, activeNoteId: prepared[0]?.id ?? null };
    }
    case "CREATE_FILE": {
      const now = new Date().toISOString();
      const note: Note = {
        id: generateId(),
        title: toFileName(action.title || "untitled.ts", state.notes.length),
        body: action.body || "",
        createdAt: now,
        updatedAt: now,
      };
      return { notes: [note, ...state.notes], activeNoteId: note.id };
    }
    case "IMPORT_FILES": {
      if (action.notes.length === 0) return state;
      const notes = sortByUpdatedAt([...action.notes, ...state.notes]);
      return { notes, activeNoteId: notes[0]?.id ?? null };
    }
    case "SELECT_NOTE":
      return { ...state, activeNoteId: action.id };
    case "CLOSE_NOTE":
      return state.activeNoteId === action.id ? { ...state, activeNoteId: null } : state;
    case "UPDATE_NOTE": {
      const updated = sortByUpdatedAt(
        state.notes.map((note, index) =>
          note.id === action.id
            ? {
                ...note,
                body: action.body,
                title: toFileName(action.body.split("\n").find(Boolean) ?? note.title, index),
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
      return { notes: [copy, ...state.notes], activeNoteId: copy.id };
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
      const notes = state.notes.filter((note) => note.id !== action.id);
      const activeNoteId =
        state.activeNoteId === action.id ? notes[0]?.id ?? null : state.activeNoteId;
      return { ...state, notes, activeNoteId };
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
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(defaultEditorSettings);
  const [scriptQuery, setScriptQuery] = useState("");
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [scriptPage, setScriptPage] = useState(1);
  const [hasMoreScripts, setHasMoreScripts] = useState(true);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
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
  const [secondaryWidth, setSecondaryWidth] = useState(236);
  const draggingResizerRef = useRef(false);
  const loadingScriptsRef = useRef(false);

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

  const fetchScriptPage = useCallback(
    async (page: number, replace: boolean) => {
      if (loadingScriptsRef.current) return;
      loadingScriptsRef.current = true;
      setLoadingScripts(true);
      try {
        const query = scriptQuery.trim();
        let endpoint = query
          ? `https://scriptblox.com/api/script/search?q=${encodeURIComponent(
              query
            )}&max=40&mode=all&page=${page}`
          : `https://scriptblox.com/api/script/fetch?page=${page}`;
        let response = await fetch(endpoint, { method: "GET" });
        if (!response.ok && !query && page === 1) {
          endpoint = "https://scriptblox.com/api/script/search?q=&max=40&mode=all";
          response = await fetch(endpoint, { method: "GET" });
        }
        const data = (await response.json()) as {
          result?: { scripts?: Array<Record<string, unknown>> };
        };
        const mappedAll: ScriptEntry[] =
          data.result?.scripts?.map((item, index) => {
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
              hasTag(item.tags, "paid");
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
          }) ?? [];

        setScripts((prev) => {
          if (replace) return mappedAll;
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of mappedAll) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });
        setHasMoreScripts(mappedAll.length > 0);
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

  const activeNote = useMemo(
    () => state.notes.find((note) => note.id === state.activeNoteId) ?? null,
    [state.notes, state.activeNoteId]
  );
  const filteredScripts = useMemo(
    () =>
      scripts.filter((script) => {
        if (scriptFilters.mode === "free" && !script.free) return false;
        if (scriptFilters.mode === "paid" && !script.paid) return false;
        if (scriptFilters.verifiedOnly && !script.verified) return false;
        if (scriptFilters.keySystem === "yes" && !script.keySystem) return false;
        if (scriptFilters.keySystem === "no" && script.keySystem) return false;
        return true;
      }),
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
    if (activeTab === "settings") {
      return { label: "Settings", icon: <Settings2 size={13} /> };
    }
    return { label: "Code Editor", icon: <Code2 size={13} /> };
  }, [activeTab]);

  return (
    <div className="ow-shell">
      <header className="ow-topbar">
        <div className="ow-topbar-left">
          <span className="ow-dot red" />
          <span className="ow-dot yellow" />
          <span className="ow-dot green" />
        </div>
        <div className="ow-topbar-center">
          {activeTabMeta.icon}
          <span>{activeTabMeta.label}</span>
        </div>
        <div className="ow-topbar-right">Catalina+ / Windows</div>
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
          onToggleCollapsed={() => setPrimaryCollapsed((v) => !v)}
          onSelectTab={setActiveTab}
        />

        <NoteList
          activeTab={activeTab}
          notes={state.notes}
          activeNoteId={state.activeNoteId}
          activeSettingsSection={settingsSection}
          onSelectSettingsSection={setSettingsSection}
          onSelectNote={(id) => dispatch({ type: "SELECT_NOTE", id })}
          onCloseNote={(id) => dispatch({ type: "CLOSE_NOTE", id })}
          onDeleteNote={(id) => {
            if (editorSettings.confirmBeforeDelete) {
              const ok = window.confirm("Delete this file?");
              if (!ok) return;
            }
            dispatch({ type: "DELETE_NOTE", id });
          }}
          onRenameNote={(id) => {
            const note = state.notes.find((n) => n.id === id);
            const nextName = window.prompt("Rename file", note?.title || "untitled.ts");
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
            const note = state.notes.find((n) => n.id === id);
            if (!note) return;
            void navigator.clipboard.writeText(note.title).catch(() => {});
          }}
          onImportFiles={(files) => {
            if (!files || files.length === 0) return;
            void Promise.all(Array.from(files).map(fileToNote)).then((notes) => {
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
          theme={theme}
          settings={editorSettings}
          onThemeChange={setTheme}
          onSettingsChange={(next) => setEditorSettings((prev) => ({ ...prev, ...next }))}
          onSaveNow={() => persistNotesNow(state.notes)}
          onDownloadCurrentFile={() => {
            if (!activeNote) return;
            const blob = new Blob([activeNote.body], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = activeNote.title || "untitled.ts";
            link.click();
            URL.revokeObjectURL(url);
          }}
          onChange={(body) => {
            if (!state.activeNoteId) return;
            dispatch({ type: "UPDATE_NOTE", id: state.activeNoteId, body });
          }}
          selectedScript={selectedScript}
          onCreateFileFromScript={(script) => {
            dispatch({ type: "CREATE_FILE", title: `${script.title}.lua`, body: script.script });
            setActiveTab("code");
          }}
        />
      </div>
    </div>
  );
}
