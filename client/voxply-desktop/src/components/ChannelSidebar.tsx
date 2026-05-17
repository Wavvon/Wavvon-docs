import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type {
  Channel,
  Hub,
  NotifyMode,
  VoiceParticipant,
  User,
  AllianceInfo,
  AllianceSharedChannel,
  Conversation,
} from "../types";
import type { TreeNode, FlatNode } from "../utils/channels";
import { colorForKey } from "../utils/format";
import { PhoneIcon, PhoneOffIcon, ChannelIcon } from "./Icons";
import { SortableCategoryItem, SortableChannelItem } from "./SortableItems";

const CHANNEL_INDENT_PX = 16;

interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

interface Props {
  view: "channels" | "dms" | "game";
  activeHubId: string | null;
  hubs: Hub[];
  channels: Channel[];
  selectedChannel: Channel | null;
  pinnedChannels: Record<string, Record<string, boolean>>;
  unreadByChannel: Record<string, Record<string, boolean>>;
  collapsedCategories: Record<string, Record<string, boolean>>;
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  voiceChannelId: string | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  users: User[];
  publicKey: string | null;
  pingByHub: Record<string, number | null>;
  isAdmin: boolean;
  hubNotifyMode: Record<string, NotifyMode>;
  hubDropdownOpen: boolean;
  userAlliances: AllianceInfo[];
  allianceChannels: Record<string, AllianceSharedChannel[]>;
  selectedAllianceChannel: SelectedAllianceChannel | null;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  unreadDms: Record<string, boolean>;
  installedGames: InstalledGame[];
  selectedGame: InstalledGame | null;
  canManageGames: boolean;
  channelTree: TreeNode[];
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onToggleCategoryCollapsed: (hubId: string, categoryId: string) => void;
  onHubDropdownOpenChange: (v: boolean) => void;
  onSetHubMode: (hubId: string, mode: NotifyMode) => void;
  onClearHubUnread: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
  onOpenHubAdmin: () => void;
  onOpenHubAdminInvites: () => void;
  onOpenCreateChannel: (parentId: string | null, isCategory: boolean) => void;
  onSelectChannel: (channel: Channel) => void;
  onChannelContextMenu: (e: React.MouseEvent, channel: Channel) => void;
  onVoiceJoin: (channel?: Channel) => void;
  onVoiceLeave: () => void;
  onLaunchGame: (game: InstalledGame) => void;
  onOpenEditGame: (game: InstalledGame) => void;
  onSelectAllianceChannel: (alliance: AllianceInfo, channel: AllianceSharedChannel) => void;
  onSelectConversation: (conv: Conversation) => void;
  onOpenFriends: () => void;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onOpenSettings: () => void;
  onSetShowInstallGame: (v: boolean) => void;
  onDragEnd: (event: DragEndEvent) => void;
  sharing: boolean;
  onScreenShare: () => void;
}

export function ChannelSidebar({
  view, activeHubId, hubs, channels, selectedChannel,
  pinnedChannels, unreadByChannel, collapsedCategories,
  voicePartByChannel, voiceChannelId, selfMuted, selfDeafened,
  users, publicKey, pingByHub, isAdmin, hubNotifyMode, hubDropdownOpen,
  userAlliances, allianceChannels, selectedAllianceChannel,
  conversations, selectedConversation, unreadDms,
  installedGames, selectedGame, canManageGames,
  channelTree, effectiveNotifyMode, onToggleCategoryCollapsed,
  onHubDropdownOpenChange, onSetHubMode, onClearHubUnread, onRemoveHub,
  onOpenHubAdmin, onOpenHubAdminInvites, onOpenCreateChannel,
  onSelectChannel, onChannelContextMenu, onVoiceJoin, onVoiceLeave,
  onLaunchGame, onOpenEditGame, onSelectAllianceChannel, onSelectConversation,
  onOpenFriends, onToggleSelfMute, onToggleSelfDeafen, onOpenSettings,
  onSetShowInstallGame, onDragEnd, sharing, onScreenShare,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notifySubmenuOpen, setNotifySubmenuOpen] = useState(false);
  const hubHeaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hubDropdownOpen) setNotifySubmenuOpen(false);
  }, [hubDropdownOpen]);

  useEffect(() => {
    if (!hubDropdownOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (hubHeaderRef.current && !hubHeaderRef.current.contains(e.target as Node)) {
        onHubDropdownOpenChange(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [hubDropdownOpen, onHubDropdownOpenChange]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // DFS-flatten the tree, skipping children of collapsed categories.
  const flatVisible = useMemo((): FlatNode[] => {
    const result: FlatNode[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        result.push({
          node: n.node,
          depth: n.depth,
          parentId: n.node.parent_id,
          childrenCount: n.children.length,
        });
        const collapsed = !!(activeHubId && collapsedCategories[activeHubId]?.[n.node.id]);
        if (!collapsed) walk(n.children);
      }
    }
    walk(channelTree);
    return result;
  }, [channelTree, activeHubId, collapsedCategories]);

  const activeNode = activeId ? flatVisible.find((n) => n.node.id === activeId) : null;

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);
  const myDisplayName = users.find((u) => u.public_key === publicKey)?.display_name;
  const activePing = activeHubId ? pingByHub[activeHubId] : undefined;
  const voiceChannelName = channels.find((c) => c.id === voiceChannelId)?.name;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEndWrapped(event: DragEndEvent) {
    setActiveId(null);
    onDragEnd(event);
  }

  return (
    <div className="sidebar">
      {view === "channels" && (
        <div className="hub-header" ref={hubHeaderRef}>
          <button
            className="hub-header-button"
            onClick={() => onHubDropdownOpenChange(!hubDropdownOpen)}
          >
            <span className="hub-header-name">{activeHub?.hub_name ?? "Hub"}</span>
            <span className="hub-header-chevron">{hubDropdownOpen ? "▴" : "▾"}</span>
          </button>
          {hubDropdownOpen && (
            <div className="hub-dropdown">
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={onOpenHubAdminInvites}>
                  Invite people
                </button>
              )}
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={onOpenHubAdmin}>
                  Hub settings
                </button>
              )}
              <button
                className="hub-dropdown-item hub-dropdown-submenu-trigger"
                onClick={() => setNotifySubmenuOpen((v) => !v)}
              >
                Notifications {notifySubmenuOpen ? "▴" : "▸"}
              </button>
              {notifySubmenuOpen && activeHubId && (() => {
                const cur = hubNotifyMode[activeHubId] ?? "all";
                const items: { mode: NotifyMode; label: string }[] = [
                  { mode: "all",      label: "All messages" },
                  { mode: "mentions", label: "@mentions only" },
                  { mode: "silent",   label: "Silence" },
                ];
                return items.map(({ mode, label }) => (
                  <button
                    key={mode}
                    className="hub-dropdown-item hub-dropdown-subitem"
                    onClick={() => {
                      onHubDropdownOpenChange(false);
                      onSetHubMode(activeHubId, mode);
                    }}
                  >
                    {cur === mode ? "✓ " : "   "}{label}
                  </button>
                ));
              })()}
              {activeHubId && Object.keys(unreadByChannel[activeHubId] ?? {}).length > 0 && (
                <button
                  className="hub-dropdown-item"
                  onClick={() => {
                    onHubDropdownOpenChange(false);
                    onClearHubUnread(activeHubId);
                  }}
                >
                  Mark all as read
                </button>
              )}
              <button
                className="hub-dropdown-item danger"
                onClick={() => {
                  onHubDropdownOpenChange(false);
                  if (activeHubId) onRemoveHub(activeHubId);
                }}
              >
                Leave hub
              </button>
            </div>
          )}
        </div>
      )}

      <div className="sidebar-scroll">
        {view !== "dms" ? (
          <>
            {/* Pinned channels */}
            {(() => {
              const pinned = activeHubId
                ? channels.filter((c) => !c.is_category && pinnedChannels[activeHubId]?.[c.id])
                : [];
              if (pinned.length === 0) return null;
              return (
                <>
                  <div className="sidebar-header"><h3>📌 Pinned</h3></div>
                  <ul className="channel-list">
                    {pinned.map((c) => (
                      <li
                        key={c.id}
                        className={`channel-item ${selectedChannel?.id === c.id ? "selected" : ""} ${
                          activeHubId && unreadByChannel[activeHubId]?.[c.id] ? "unread" : ""
                        }`}
                        onClick={() => onSelectChannel(c)}
                        onContextMenu={(e) => onChannelContextMenu(e, c)}
                      >
                        <ChannelIcon icon={c.icon} customIconSvg={c.custom_icon_svg} />{" "}{c.name}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}

            {/* Channels — single flat SortableContext, DFS order */}
            <div className="sidebar-header">
              <button
                className="btn-icon"
                onClick={() => onOpenCreateChannel(null, false)}
                title="Create channel"
              >
                +
              </button>
            </div>
            <DndContext
              sensors={dndSensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEndWrapped}
            >
              <SortableContext
                items={flatVisible.map((n) => n.node.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="channel-list">
                  {flatVisible.map((n) =>
                    n.node.is_category ? (
                      <SortableCategoryItem
                        key={n.node.id}
                        channel={n.node}
                        collapsed={!!activeHubId && !!collapsedCategories[activeHubId]?.[n.node.id]}
                        childCount={n.childrenCount}
                        style={{ paddingLeft: n.depth * CHANNEL_INDENT_PX }}
                        onToggleCollapsed={() => {
                          if (activeHubId) onToggleCategoryCollapsed(activeHubId, n.node.id);
                        }}
                        onContextMenu={(e) => onChannelContextMenu(e, n.node)}
                        onAddChannel={() => onOpenCreateChannel(n.node.id, false)}
                        onAddSubcategory={() => onOpenCreateChannel(n.node.id, true)}
                      />
                    ) : (
                      <SortableChannelItem
                        key={n.node.id}
                        channel={n.node}
                        selected={selectedChannel?.id === n.node.id}
                        unread={!!activeHubId && !!unreadByChannel[activeHubId]?.[n.node.id]}
                        muted={!!activeHubId && effectiveNotifyMode(activeHubId, n.node.id) === "silent"}
                        participants={voicePartByChannel[n.node.id] ?? []}
                        isCurrentVoiceChannel={voiceChannelId === n.node.id}
                        style={{ paddingLeft: n.depth * CHANNEL_INDENT_PX }}
                        onClick={() => onSelectChannel(n.node)}
                        onDoubleClick={() => { if (voiceChannelId !== n.node.id) onVoiceJoin(n.node); }}
                        onContextMenu={(e) => onChannelContextMenu(e, n.node)}
                        onSettings={isAdmin ? (e) => onChannelContextMenu(e, n.node) : undefined}
                      />
                    )
                  )}
                </ul>
              </SortableContext>
              <DragOverlay>
                {activeNode && (
                  <div
                    className={`channel-drag-ghost ${activeNode.node.is_category ? "is-category" : ""}`}
                    style={{ paddingLeft: activeNode.depth * CHANNEL_INDENT_PX }}
                  >
                    {activeNode.node.is_category
                      ? `▾ ${activeNode.node.name.toUpperCase()}`
                      : <><ChannelIcon icon={activeNode.node.icon} customIconSvg={activeNode.node.custom_icon_svg} />{" "}{activeNode.node.name}</>}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
            {channels.length === 0 && <p className="muted">No channels yet</p>}

            {/* Alliances */}
            {userAlliances.length > 0 && (
              <div className="sidebar-alliances">
                {userAlliances.map((a) => {
                  const allChans = allianceChannels[a.id] ?? [];
                  const remoteOnly = allChans.filter(
                    (c) => !channels.find((local) => local.id === c.channel_id)
                  );
                  if (remoteOnly.length === 0) return null;
                  return (
                    <div key={a.id} className="sidebar-alliance-group">
                      <div className="sidebar-header sidebar-header-alliance">
                        <h3>🤝 {a.name}</h3>
                      </div>
                      <ul className="channel-list">
                        {remoteOnly.map((c) => {
                          const isSelected =
                            selectedAllianceChannel?.alliance_id === a.id &&
                            selectedAllianceChannel.channel.channel_id === c.channel_id;
                          return (
                            <li
                              key={c.channel_id}
                              className={`channel-item ${isSelected ? "selected" : ""}`}
                              onClick={() => onSelectAllianceChannel(a, c)}
                              title={`Hosted on ${c.hub_name}`}
                            >
                              # {c.channel_name}
                              <span className="alliance-channel-host">{c.hub_name}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Games */}
            <div className="sidebar-header sidebar-header-games">
              <h3>Games</h3>
              {canManageGames && (
                <button
                  className="btn-icon"
                  onClick={() => onSetShowInstallGame(true)}
                  title="Install game"
                >
                  +
                </button>
              )}
            </div>
            <ul className="channel-list">
              {installedGames.map((g) => (
                <li
                  key={g.id}
                  className={`channel-item game-item ${
                    view === "game" && selectedGame?.id === g.id ? "selected" : ""
                  }`}
                  onClick={() => onLaunchGame(g)}
                  title={g.description ?? ""}
                >
                  <span className="game-item-label">🎮 {g.name}</span>
                  {canManageGames && (
                    <button
                      className="game-item-gear"
                      onClick={(e) => { e.stopPropagation(); onOpenEditGame(g); }}
                      title="Game settings"
                      aria-label={`Settings for ${g.name}`}
                    >
                      ⚙
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {installedGames.length === 0 && (
              <p className="muted">
                {canManageGames ? "No games yet — click + to install." : "No games yet."}
              </p>
            )}
          </>
        ) : (
          <>
            {/* DM conversations */}
            <div className="sidebar-header">
              <h3>Direct Messages</h3>
              <button className="btn-icon" onClick={onOpenFriends} title="Friends">
                👥
              </button>
            </div>
            <ul className="channel-list">
              {[...conversations]
                .sort((a, b) => (b.last_activity_at ?? b.created_at) - (a.last_activity_at ?? a.created_at))
                .map((c) => {
                  const others = c.members.filter((m) => m !== publicKey);
                  const label = others
                    .map((k) => {
                      const u = users.find((u) => u.public_key === k);
                      return u?.display_name || k.slice(0, 12);
                    })
                    .join(", ");
                  const unread = !!unreadDms[c.id];
                  return (
                    <li
                      key={c.id}
                      className={`channel-item ${selectedConversation?.id === c.id ? "selected" : ""} ${unread ? "unread" : ""}`}
                      onClick={() => onSelectConversation(c)}
                    >
                      {unread && <span className="channel-unread-dot" />}
                      @ {label || "(empty)"}
                    </li>
                  );
                })}
            </ul>
            {conversations.length === 0 && (
              <p className="muted">No conversations. Start one from your friends list.</p>
            )}
          </>
        )}
      </div>

      {/* User footer */}
      <div className="user-info">
        {voiceChannelId && (
          <div className="voice-status">
            <span className="status-dot online" />
            <span className="voice-status-label">In voice: #{voiceChannelName}</span>
            {activePing !== undefined && (
              <span
                className={`voice-ping ${
                  activePing === null
                    ? "offline"
                    : activePing < 150
                    ? "good"
                    : activePing < 400
                    ? "okay"
                    : "bad"
                }`}
              >
                {activePing === null ? "offline" : `${activePing}ms`}
              </span>
            )}
          </div>
        )}
        <div className="user-footer">
          <span className="user-footer-name" title={publicKey ?? undefined}>
            {myDisplayName || publicKey?.slice(0, 12) || "You"}
          </span>
          <div className="user-footer-actions">
            {voiceChannelId && (
              <>
                <button
                  onClick={onToggleSelfMute}
                  className={`btn-icon-gear ${selfMuted ? "active" : ""}`}
                  title={selfMuted ? "Unmute mic" : "Mute mic"}
                >
                  {selfMuted ? "🚫🎙️" : "🎙️"}
                </button>
                <button
                  onClick={onToggleSelfDeafen}
                  className={`btn-icon-gear ${selfDeafened ? "active" : ""}`}
                  title={selfDeafened ? "Undeafen" : "Deafen"}
                >
                  {selfDeafened ? "🚫🔊" : "🔊"}
                </button>
                <button
                  onClick={onScreenShare}
                  className={`btn-icon-gear ${sharing ? "active" : ""}`}
                  title={sharing ? "Stop sharing" : "Share screen"}
                >
                  {sharing ? "⏹" : "🖥"}
                </button>
              </>
            )}
            {voiceChannelId ? (
              <button
                onClick={onVoiceLeave}
                className="btn-icon-gear voice-call-btn end"
                title="Leave voice"
                aria-label="Leave voice"
              >
                <PhoneOffIcon />
              </button>
            ) : (
              <button
                onClick={() => onVoiceJoin()}
                className="btn-icon-gear voice-call-btn start"
                disabled={!selectedChannel || selectedChannel.is_category}
                title={
                  !selectedChannel || selectedChannel.is_category
                    ? "Select a channel first to join voice"
                    : `Join voice on #${selectedChannel.name}`
                }
                aria-label="Join voice"
              >
                <PhoneIcon />
              </button>
            )}
            <button onClick={onOpenSettings} className="btn-icon-gear" title="Settings">
              ⚙
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
