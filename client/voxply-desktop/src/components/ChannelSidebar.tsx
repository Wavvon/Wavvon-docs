import React from "react";
import {
  DndContext,
  DragEndEvent,
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
  InstalledGame,
  Conversation,
} from "../types";
import { colorForKey } from "../utils/format";
import { PhoneIcon, PhoneOffIcon } from "./Icons";
import { SortableCategoryItem, SortableChannelItem } from "./SortableItems";

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
  channelTree: { node: Channel; children: Channel[] }[];
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
  onSetShowInstallGame, onDragEnd,
}: Props) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);
  const myDisplayName = users.find((u) => u.public_key === publicKey)?.display_name;
  const activePing = activeHubId ? pingByHub[activeHubId] : undefined;
  const voiceChannelName = channels.find((c) => c.id === voiceChannelId)?.name;

  return (
    <div className="sidebar">
      {view === "channels" && (
        <div className="hub-header">
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
              {activeHubId && (() => {
                const cur = hubNotifyMode[activeHubId] ?? "all";
                const items: { mode: NotifyMode; label: string }[] = [
                  { mode: "all", label: "Notify on all messages" },
                  { mode: "mentions", label: "Notify on @mentions only" },
                  { mode: "silent", label: "Silence this hub" },
                ];
                return items.map(({ mode, label }) => (
                  <button
                    key={mode}
                    className="hub-dropdown-item"
                    onClick={() => {
                      onHubDropdownOpenChange(false);
                      onSetHubMode(activeHubId, mode);
                    }}
                  >
                    {cur === mode ? "✓ " : ""}
                    {label}
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
                        # {c.name}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}

            {/* Channels */}
            <div className="sidebar-header">
              <h3>Channels</h3>
              <button
                className="btn-icon"
                onClick={() => onOpenCreateChannel(null, false)}
                title="Create channel"
              >
                +
              </button>
            </div>
            <DndContext sensors={dndSensors} onDragEnd={onDragEnd}>
              <SortableContext
                items={channelTree.map(({ node }) => node.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="channel-list">
                  {channelTree.map(({ node, children }) =>
                    node.is_category ? (
                      <SortableCategoryItem
                        key={node.id}
                        channel={node}
                        collapsed={!!activeHubId && !!collapsedCategories[activeHubId]?.[node.id]}
                        childCount={children.length}
                        onToggleCollapsed={() => {
                          if (activeHubId) onToggleCategoryCollapsed(activeHubId, node.id);
                        }}
                        onContextMenu={(e) => onChannelContextMenu(e, node)}
                        onAddChannel={() => onOpenCreateChannel(node.id, false)}
                      >
                        <SortableContext
                          items={children.map((c) => c.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul className="channel-sublist">
                            {children.map((c) => (
                              <SortableChannelItem
                                key={c.id}
                                channel={c}
                                selected={selectedChannel?.id === c.id}
                                unread={!!activeHubId && !!unreadByChannel[activeHubId]?.[c.id]}
                                muted={!!activeHubId && effectiveNotifyMode(activeHubId, c.id) === "silent"}
                                participants={voicePartByChannel[c.id] ?? []}
                                isCurrentVoiceChannel={voiceChannelId === c.id}
                                onClick={() => onSelectChannel(c)}
                                onDoubleClick={() => { if (voiceChannelId !== c.id) onVoiceJoin(c); }}
                                onContextMenu={(e) => onChannelContextMenu(e, c)}
                              />
                            ))}
                          </ul>
                        </SortableContext>
                      </SortableCategoryItem>
                    ) : (
                      <SortableChannelItem
                        key={node.id}
                        channel={node}
                        selected={selectedChannel?.id === node.id}
                        unread={!!activeHubId && !!unreadByChannel[activeHubId]?.[node.id]}
                        muted={!!activeHubId && effectiveNotifyMode(activeHubId, node.id) === "silent"}
                        participants={voicePartByChannel[node.id] ?? []}
                        isCurrentVoiceChannel={voiceChannelId === node.id}
                        onClick={() => onSelectChannel(node)}
                        onDoubleClick={() => { if (voiceChannelId !== node.id) onVoiceJoin(node); }}
                        onContextMenu={(e) => onChannelContextMenu(e, node)}
                      />
                    )
                  )}
                </ul>
              </SortableContext>
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
  );
}
