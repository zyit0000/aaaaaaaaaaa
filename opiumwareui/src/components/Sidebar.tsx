import { BookMarked, Code2, PanelLeftClose, PanelLeftOpen, Settings, User, Users } from "lucide-react";
import type { MouseEvent } from "react";
import type { AppTab } from "../types";

interface SidebarProps {
  activeTab: AppTab;
  collapsed: boolean;
  collapseLocked: boolean;
  onToggleCollapsed: () => void;
  onSelectTab: (tab: AppTab) => void;
  onStartDrag: (event: MouseEvent<HTMLElement>) => void;
}

export default function Sidebar({
  activeTab,
  collapsed,
  collapseLocked,
  onToggleCollapsed,
  onSelectTab,
  onStartDrag,
}: SidebarProps) {
  return (
    <aside className="ow-primary" onMouseDown={onStartDrag}>
      <button
        className="ow-primary-toggle"
        onClick={onToggleCollapsed}
        type="button"
        disabled={collapseLocked}
        title={collapseLocked ? "Sidebar is locked in Contribution" : "Toggle sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      <div className="ow-primary-divider" />

      <button
        className={`ow-primary-item ${activeTab === "code" ? "active" : ""}`}
        onClick={() => onSelectTab("code")}
        type="button"
      >
        <Code2 size={15} />
      </button>

      <button
        className={`ow-primary-item ${activeTab === "library" ? "active" : ""}`}
        onClick={() => onSelectTab("library")}
        type="button"
      >
        <BookMarked size={15} />
      </button>

      <button
        className={`ow-primary-item ${activeTab === "account" ? "active" : ""}`}
        onClick={() => onSelectTab("account")}
        type="button"
      >
        <User size={15} />
      </button>

      <button
        className={`ow-primary-item ${activeTab === "contribution" ? "active" : ""}`}
        onClick={() => onSelectTab("contribution")}
        type="button"
      >
        <Users size={15} />
      </button>

      <div className="ow-primary-spacer" />
      <div className="ow-primary-divider" />

      <button
        className={`ow-primary-item ${activeTab === "settings" ? "active" : ""}`}
        onClick={() => onSelectTab("settings")}
        type="button"
      >
        <Settings size={15} />
      </button>
    </aside>
  );
}
