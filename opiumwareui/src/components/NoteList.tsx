import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  BookMarked,
  DollarSign,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  KeyRound,
  Keyboard,
  LockOpen,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AppTab, Note, ScriptEntry, SettingsSection } from "../types";
import { formatNoteDate } from "../utils";

interface NoteListProps {
  activeTab: AppTab;
  notes: Note[];
  activeNoteId: string | null;
  activeSettingsSection: SettingsSection;
  onSelectNote: (id: string) => void;
  onCloseNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onRenameNote: (id: string) => void;
  onDuplicateNote: (id: string) => void;
  onReorderNote: (sourceId: string, targetId: string) => void;
  onCopyFilePath: (id: string) => void;
  onCreateFromClipboard: () => void;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onCreateFile: () => void;
  onImportFiles: (files: FileList | null) => void;
  scripts: ScriptEntry[];
  scriptQuery: string;
  onScriptQueryChange: (query: string) => void;
  scriptFilters: {
    mode: "all" | "free" | "paid";
    verifiedOnly: boolean;
    keySystem: "all" | "yes" | "no";
  };
  onScriptFiltersChange: (next: {
    mode?: "all" | "free" | "paid";
    verifiedOnly?: boolean;
    keySystem?: "all" | "yes" | "no";
  }) => void;
  onRefreshScripts: () => void;
  onLoadMoreScripts: () => void;
  hasMoreScripts: boolean;
  loadingScripts: boolean;
  onSelectScript: (id: string) => void;
  selectedScriptId: string | null;
}

const settingsSections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "editor", label: "Editor", icon: <Settings2 size={14} /> },
  { id: "theme", label: "Theme", icon: <Palette size={14} /> },
  { id: "files", label: "Files", icon: <FileCode2 size={14} /> },
  { id: "keybinds", label: "Keybinds", icon: <Keyboard size={14} /> },
  { id: "opiumware", label: "Opiumware", icon: <Plug size={14} /> },
];

interface ContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

export default function NoteList({
  activeTab,
  notes,
  activeNoteId,
  activeSettingsSection,
  onSelectNote,
  onCloseNote,
  onDeleteNote,
  onRenameNote,
  onDuplicateNote,
  onReorderNote,
  onCopyFilePath,
  onCreateFromClipboard,
  onSelectSettingsSection,
  onCreateFile,
  onImportFiles,
  scripts,
  scriptQuery,
  onScriptQueryChange,
  scriptFilters,
  onScriptFiltersChange,
  onRefreshScripts,
  onLoadMoreScripts,
  hasMoreScripts,
  loadingScripts,
  onSelectScript,
  selectedScriptId,
}: NoteListProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const folderInput = folderInputRef.current;
    if (folderInput) {
      folderInput.setAttribute("webkitdirectory", "");
      folderInput.setAttribute("directory", "");
    }
  }, []);

  useEffect(() => {
    const onWindowClick = () => setContextMenu(null);
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  if (activeTab === "settings") {
    return (
      <aside className="ow-secondary">
        <header className="ow-secondary-header">
          <h2>
            <SlidersHorizontal size={14} />
            Settings
          </h2>
        </header>
        <div className="ow-secondary-content">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              className={`ow-secondary-row ${activeSettingsSection === section.id ? "active" : ""}`}
              onClick={() => onSelectSettingsSection(section.id)}
              type="button"
            >
              {section.icon}
              <span>{section.label}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  if (activeTab === "library") {
    return (
      <aside className="ow-secondary">
        <header className="ow-secondary-header">
          <h2>
            <BookMarked size={14} />
            Script Library
          </h2>
          <div className="ow-secondary-actions">
            <button onClick={onRefreshScripts} type="button" title="Refresh scripts">
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setFiltersOpen(true)}
              type="button"
              title="Open filters"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        </header>
        <div className="ow-secondary-content ow-library-layout">
          <label className="ow-library-label">
            Search ScriptBlox
            <input
              className="ow-library-input"
              value={scriptQuery}
              onChange={(event) => onScriptQueryChange(event.target.value)}
              placeholder="e.g. blox fruits"
            />
          </label>

          <div className="ow-library-list">
            <div
              className="ow-library-scroll-area"
              onScroll={(event) => {
                const el = event.currentTarget;
                const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
                if (nearBottom && hasMoreScripts && !loadingScripts) onLoadMoreScripts();
              }}
            >
              {scripts.map((script) => (
                <button
                  key={script.id}
                  type="button"
                  className={`ow-secondary-row ${selectedScriptId === script.id ? "active" : ""}`}
                  onClick={() => onSelectScript(script.id)}
                >
                  <span className="ow-script-row">
                    {script.imageUrl ? (
                      <img
                        className="ow-script-thumb"
                        src={script.imageUrl}
                        alt={`${script.title} thumbnail`}
                      />
                    ) : (
                      <span className="ow-script-thumb ow-script-thumb-empty">
                        <FileCode2 size={14} />
                      </span>
                    )}
                    <span className="ow-script-text">
                      <span className="ow-script-title">{script.title}</span>
                      <span className="ow-script-meta">
                        {script.game} - {script.views.toLocaleString()} views
                      </span>
                      <span className="ow-script-badges">
                        {script.verified && (
                          <span className="ow-badge verified">
                            <BadgeCheck size={12} />
                            Verified
                          </span>
                        )}
                        {script.paid ? (
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
                        {script.keySystem && (
                          <span className="ow-badge keysystem">
                            <KeyRound size={12} />
                            KeySys
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              {loadingScripts && <div className="ow-library-more">Loading more...</div>}
              {!hasMoreScripts && scripts.length > 0 && (
                <div className="ow-library-more">No more scripts</div>
              )}
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div
            className="ow-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setFiltersOpen(false);
            }}
          >
            <div className="ow-modal-card">
              <button
                className="ow-modal-close"
                onClick={() => setFiltersOpen(false)}
                type="button"
                aria-label="Close filters"
              >
                <X size={14} />
              </button>
              <h3>
                <SlidersHorizontal size={14} />
                Filters
              </h3>
              <div className="ow-filter-grid">
                <label>
                  Mode
                  <select
                    value={scriptFilters.mode}
                    onChange={(event) =>
                      onScriptFiltersChange({
                        mode: event.target.value as "all" | "free" | "paid",
                      })
                    }
                  >
                    <option value="all">All</option>
                    <option value="free">Free only</option>
                    <option value="paid">Paid only</option>
                  </select>
                </label>
                <label>
                  Key System
                  <select
                    value={scriptFilters.keySystem}
                    onChange={(event) =>
                      onScriptFiltersChange({
                        keySystem: event.target.value as "all" | "yes" | "no",
                      })
                    }
                  >
                    <option value="all">Any</option>
                    <option value="yes">Required</option>
                    <option value="no">No key system</option>
                  </select>
                </label>
              </div>
              <label className="ow-library-verified">
                <input
                  type="checkbox"
                  checked={scriptFilters.verifiedOnly}
                  onChange={(event) =>
                    onScriptFiltersChange({ verifiedOnly: event.target.checked })
                  }
                />
                Verified only
              </label>
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="ow-secondary">
      <header className="ow-secondary-header">
        <h2>
          <FileCode2 size={14} />
          Files
        </h2>
        <div className="ow-secondary-actions">
          <button onClick={onCreateFile} type="button" title="New file">
            <Plus size={14} />
          </button>
          <label className="ow-import-label" title="Open files">
            <FilePlus2 size={14} />
            <input
              type="file"
              multiple
              accept=".txt,.md,.js,.ts,.tsx,.jsx,.json,.html,.css,.rs,.py,.java,.c,.cpp"
              onChange={(event) => onImportFiles(event.target.files)}
            />
          </label>
          <label className="ow-import-label" title="Open folder">
            <FolderOpen size={14} />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              onChange={(event) => onImportFiles(event.target.files)}
            />
          </label>
        </div>
      </header>
      <div className="ow-secondary-content">
        {notes.length === 0 && (
          <button className="ow-secondary-row file" type="button" onClick={onCreateFile}>
            <span className="ow-file-meta">
              <FilePlus2 size={14} />
              <span className="ow-file-name">Create first file</span>
            </span>
          </button>
        )}
        {notes.map((note) => {
          const active = note.id === activeNoteId;
          return (
            <button
              key={note.id}
              className={`ow-secondary-row file ${active ? "active" : ""} ${
                draggingId === note.id ? "dragging" : ""
              } ${dragOverId === note.id ? "drag-over" : ""}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", note.id);
                setDraggingId(note.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOverId !== note.id) setDragOverId(note.id);
              }}
              onDragLeave={() => setDragOverId((prev) => (prev === note.id ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
                if (!sourceId || sourceId === note.id) return;
                onReorderNote(sourceId, note.id);
                setDragOverId(null);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ noteId: note.id, x: event.clientX, y: event.clientY });
              }}
              onClick={() => onSelectNote(note.id)}
              type="button"
            >
              <span className="ow-file-meta">
                <FileText size={14} />
                <span className="ow-file-name">{note.title || "untitled.ts"}</span>
              </span>
              <span className="ow-file-time">{formatNoteDate(note.updatedAt)}</span>
            </button>
          );
        })}
      </div>

      {contextMenu && (
        <div className="ow-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => onRenameNote(contextMenu.noteId)}>
            Rename
          </button>
          <button type="button" onClick={() => onDuplicateNote(contextMenu.noteId)}>
            Duplicate
          </button>
          <button type="button" onClick={() => onCopyFilePath(contextMenu.noteId)}>
            Copy Path
          </button>
          <button type="button" onClick={onCreateFromClipboard}>
            Paste as New File
          </button>
          <button type="button" onClick={() => onCloseNote(contextMenu.noteId)}>
            Close
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => onDeleteNote(contextMenu.noteId)}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}
