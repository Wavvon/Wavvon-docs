import React from "react";
import type { Channel, NotifyMode } from "../types";

interface Props {
  menu: { x: number; y: number; channel: Channel };
  activeHubId: string | null;
  channels: Channel[];
  pinnedChannels: Record<string, Record<string, boolean>>;
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onClose: () => void;
  onRename: (channel: Channel) => void;
  onEditDescription: (channel: Channel) => void;
  onSetTalkPower: (channelId: string) => void;
  onManageBans: (channelId: string, channelName: string) => void;
  onSetMode: (hubId: string, channelId: string, mode: NotifyMode) => void;
  onTogglePin: (hubId: string, channelId: string) => void;
  onMoveChannel: (channelId: string, parentId: string | null) => void;
  onEditAppearance: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
}

export function ChannelContextMenu({
  menu, activeHubId, channels, pinnedChannels, effectiveNotifyMode,
  onClose, onRename, onEditDescription, onSetTalkPower, onManageBans,
  onSetMode, onTogglePin, onMoveChannel, onEditAppearance, onDelete,
}: Props) {
  const { x, y, channel } = menu;

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
            {activeHubId && (() => {
              const cur = effectiveNotifyMode(activeHubId, channel.id);
              const items: { mode: NotifyMode; label: string }[] = [
                { mode: "all", label: "All messages" },
                { mode: "mentions", label: "Only @mentions" },
                { mode: "silent", label: "Silent" },
              ];
              return items.map(({ mode, label }) => (
                <button
                  key={mode}
                  className="context-menu-item"
                  onClick={() => { onClose(); onSetMode(activeHubId, channel.id, mode); }}
                >
                  {cur === mode ? "✓ " : ""}
                  {label}
                </button>
              ));
            })()}
            {activeHubId && (
              <button
                className="context-menu-item"
                onClick={() => { onClose(); onTogglePin(activeHubId, channel.id); }}
              >
                {pinnedChannels[activeHubId]?.[channel.id] ? "Unpin channel" : "Pin channel"}
              </button>
            )}
            {channel.parent_id && (
              <button
                className="context-menu-item"
                onClick={() => onMoveChannel(channel.id, null)}
              >
                Move to top level
              </button>
            )}
            {channels
              .filter((c) => c.is_category && c.id !== channel.parent_id)
              .map((cat) => (
                <button
                  key={cat.id}
                  className="context-menu-item"
                  onClick={() => onMoveChannel(channel.id, cat.id)}
                >
                  Move to {cat.name}
                </button>
              ))}
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
