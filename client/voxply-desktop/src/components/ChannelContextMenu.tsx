import React, { useState } from "react";
import type { Channel, NotifyMode } from "../types";

interface Props {
  menu: { x: number; y: number; channel: Channel };
  activeHubId: string | null;
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onClose: () => void;
  onRename: (channel: Channel) => void;
  onEditDescription: (channel: Channel) => void;
  onSetTalkPower: (channelId: string) => void;
  onManageBans: (channelId: string, channelName: string) => void;
  onSetMode: (hubId: string, channelId: string, mode: NotifyMode) => void;
  onOpenCreateChannel: (parentId: string | null, isCategory: boolean) => void;
  onEditAppearance: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
}

export function ChannelContextMenu({
  menu, activeHubId, effectiveNotifyMode,
  onClose, onRename, onEditDescription, onSetTalkPower, onManageBans,
  onSetMode, onOpenCreateChannel, onEditAppearance, onDelete,
}: Props) {
  const { x, y, channel } = menu;
  const [notifyOpen, setNotifyOpen] = useState(false);

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="context-menu"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        {!channel.is_category && (
          <>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onRename(channel); }}
            >
              Rename channel…
            </button>
            <button
              className="context-menu-item"
              onClick={() => onEditDescription(channel)}
            >
              Edit description
            </button>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onSetTalkPower(channel.id); }}
            >
              Set talk power…
            </button>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onManageBans(channel.id, channel.name); }}
            >
              Manage channel bans…
            </button>
          </>
        )}
        {activeHubId && (
          <>
            <button
              className="context-menu-item context-menu-submenu-trigger"
              onClick={() => setNotifyOpen(v => !v)}
            >
              Notifications {notifyOpen ? "▴" : "▸"}
            </button>
            {notifyOpen && (() => {
              const cur = effectiveNotifyMode(activeHubId, channel.id);
              const items: { mode: NotifyMode; label: string }[] = [
                { mode: "all",      label: "All messages" },
                { mode: "mentions", label: "Only @mentions" },
                { mode: "silent",   label: "Silent" },
              ];
              return items.map(({ mode, label }) => (
                <button
                  key={mode}
                  className="context-menu-item context-menu-subitem"
                  onClick={() => { onClose(); onSetMode(activeHubId, channel.id, mode); }}
                >
                  {cur === mode ? "✓ " : "   "}{label}
                </button>
              ));
            })()}
          </>
        )}
        {channel.is_category && (
          <>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onOpenCreateChannel(channel.id, false); }}
            >
              Create channel here…
            </button>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onOpenCreateChannel(channel.id, true); }}
            >
              Create subcategory here…
            </button>
          </>
        )}
        <button
          className="context-menu-item"
          onClick={() => { onClose(); onEditAppearance(channel); }}
        >
          Edit appearance…
        </button>
        <button
          className="context-menu-item danger"
          onClick={() => onDelete(channel.id)}
        >
          Delete {channel.is_category ? "category" : "channel"}
        </button>
      </div>
    </div>
  );
}
