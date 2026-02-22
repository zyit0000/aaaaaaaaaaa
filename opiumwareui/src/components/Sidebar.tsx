import { BookMarked, Code2, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import type { AppTab } from "../types";

interface SidebarProps {
  activeTab: AppTab;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectTab: (tab: AppTab) => void;
}

export default function Sidebar({
  activeTab,
  collapsed,
  onToggleCollapsed,
  onSelectTab,
}: SidebarProps) {
  return (
    <aside className="ow-primary">
      <button className="ow-primary-toggle" onClick={onToggleCollapsed} type="button">
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
