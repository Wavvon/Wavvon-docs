import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AllianceDetail,
  AllianceInfo,
  AllianceInvite,
  AllianceSharedChannel,
  Channel,
  PendingAllianceInvite,
} from "../types";

type AllianceTab = "members" | "channels" | "invite";

export function AlliancesSection({
  channels,
  ownHubUrl,
}: {
  channels: Channel[];
  ownHubUrl: string;
}) {
  const [alliances, setAlliances] = useState<AllianceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AllianceDetail | null>(null);
  const [shared, setShared] = useState<AllianceSharedChannel[]>([]);
  const [invite, setInvite] = useState<AllianceInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<AllianceTab>("members");

  const [pendingInvites, setPendingInvites] = useState<PendingAllianceInvite[]>([]);
  const [pushTargetUrl, setPushTargetUrl] = useState("");
  const [pushSending, setPushSending] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) createInputRef.current?.focus();
  }, [isCreating]);

  async function refresh() {
    try {
      const list = await invoke<AllianceInfo[]>("list_alliances");
      setAlliances(list);
      if (selectedId && !list.find((a) => a.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
        setShared([]);
      }
      const pending = await invoke<PendingAllianceInvite[]>("list_pending_alliance_invites");
      setPendingInvites(pending);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshDetail(id: string) {
    try {
      const d = await invoke<AllianceDetail>("get_alliance", { allianceId: id });
      const sh = await invoke<AllianceSharedChannel[]>(
        "list_alliance_shared_channels",
        { allianceId: id },
      );
      setDetail(d);
      setShared(sh);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) refreshDetail(selectedId);
  }, [selectedId]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await invoke<AllianceInfo>("create_alliance", { name });
      setNewName("");
      setIsCreating(false);
      await refresh();
      setSelectedId(created.id);
      setTab("invite");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGenerateInvite() {
    if (!selectedId) return;
    try {
      const inv = await invoke<AllianceInvite>("create_alliance_invite", {
        allianceId: selectedId,
      });
      setInvite(inv);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleJoin() {
    const code = joinCode.trim();
    if (!code) return;
    let u: string, a: string, t: string;
    try {
      const parsed = JSON.parse(atob(code));
      u = parsed.u; a = parsed.a; t = parsed.t;
      if (!u || !a || !t) throw new Error("invalid");
    } catch {
      setError("Invalid share code — make sure you pasted it completely.");
      return;
    }
    try {
      await invoke("join_alliance", {
        inviterHubUrl: u,
        allianceId: a,
        inviteToken: t,
        ownHubPublicUrl: ownHubUrl || u,
      });
      setJoinCode("");
      await refresh();
      setSelectedId(a);
      setTab("members");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleLeave() {
    if (!selectedId) return;
    if (!confirm("Leave this alliance? Your hub stops sharing channels with it.")) return;
    try {
      await invoke("leave_alliance", { allianceId: selectedId });
      setSelectedId(null);
      setDetail(null);
      setShared([]);
      setInvite(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleToggleShare(channelId: string, currentlyShared: boolean) {
    if (!selectedId) return;
    try {
      if (currentlyShared) {
        await invoke("unshare_channel_from_alliance", { allianceId: selectedId, channelId });
      } else {
        await invoke("share_channel_with_alliance", { allianceId: selectedId, channelId });
      }
      await refreshDetail(selectedId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSendPushInvite() {
    if (!selectedId || !pushTargetUrl.trim()) return;
    setPushSending(true);
    try {
      await invoke("send_alliance_push_invite", {
        allianceId: selectedId,
        targetHubUrl: pushTargetUrl.trim(),
        ownHubUrl: ownHubUrl,
      });
      setPushTargetUrl("");
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setPushSending(false);
    }
  }

  async function handleRespondInvite(inviteId: string, accept: boolean) {
    try {
      await invoke("respond_to_alliance_invite", { inviteId, accept });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  const sharedChannelIds = new Set(shared.map((s) => s.channel_id));

  const rootItems = channels
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.display_order - b.display_order);

  function getChildren(parentId: string) {
    return channels
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => a.display_order - b.display_order);
  }

  function categorySharedState(catId: string): "all" | "some" | "none" {
    const children = getChildren(catId).filter((c) => !c.is_category);
    if (children.length === 0) return "none";
    const sharedCount = children.filter((c) => sharedChannelIds.has(c.id)).length;
    if (sharedCount === children.length) return "all";
    if (sharedCount > 0) return "some";
    return "none";
  }

  async function handleToggleCategoryShare(catId: string) {
    if (!selectedId) return;
    const children = getChildren(catId).filter((c) => !c.is_category);
    const state = categorySharedState(catId);
    const shouldShare = state === "none";
    for (const ch of children) {
      const isShared = sharedChannelIds.has(ch.id);
      if (shouldShare && !isShared) {
        await invoke("share_channel_with_alliance", { allianceId: selectedId, channelId: ch.id });
      } else if (!shouldShare && isShared) {
        await invoke("unshare_channel_from_alliance", { allianceId: selectedId, channelId: ch.id });
      }
    }
    await refreshDetail(selectedId);
  }

  return (
    <section>
      <h1>Alliances</h1>
      <p className="muted">
        Group your hub with other hubs to share channels and voice. A hub can
        be in multiple alliances.
      </p>

      <div className="alliances-layout">
        {/* ── Left: list + inline create ── */}
        <div className="alliances-list-panel">
          <div className="alliances-list">
            {pendingInvites.length > 0 && (
              <div className="alliance-pending-section">
                <div className="alliance-pending-header">
                  Pending invites
                  <span className="alliance-pending-badge">{pendingInvites.length}</span>
                </div>
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="alliance-pending-item">
                    <div className="alliance-pending-name">{inv.alliance_name}</div>
                    <div className="alliance-pending-from muted">{inv.from_hub_name}</div>
                    <div className="alliance-pending-actions">
                      <button onClick={() => handleRespondInvite(inv.id, true)}>Accept</button>
                      <button className="btn-secondary" onClick={() => handleRespondInvite(inv.id, false)}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {alliances.length === 0 && !isCreating && (
              <p className="alliances-empty-hint muted">No alliances yet</p>
            )}
            {alliances.map((a) => (
              <button
                key={a.id}
                className={`alliance-list-item${selectedId === a.id ? " active" : ""}`}
                onClick={() => { setSelectedId(a.id); setIsCreating(false); }}
              >
                {a.name}
              </button>
            ))}
            {isCreating && (
              <div className="alliance-create-inline">
                <input
                  ref={createInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Alliance name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setIsCreating(false); setNewName(""); }
                  }}
                />
                <div className="alliance-create-inline-actions">
                  <button onClick={handleCreate} disabled={!newName.trim()}>Create</button>
                  <button
                    className="btn-secondary"
                    onClick={() => { setIsCreating(false); setNewName(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {!isCreating && (
            <button
              className="alliance-list-add"
              onClick={() => setIsCreating(true)}
              title="New alliance"
            >
              + New alliance
            </button>
          )}
        </div>

        {/* ── Right: detail panel ── */}
        <div className="alliances-detail-panel">
          {error && (
            <div className="error-banner alliances-error">
              {error}
              <button className="btn-icon-small" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {selectedId && detail ? (
            <>
              <div className="alliances-detail-header">
                <h2 className="alliances-detail-name">{detail.name}</h2>
                <button className="btn-secondary-small" onClick={handleLeave}>
                  Leave
                </button>
              </div>

              <div className="alliances-tab-bar">
                {(["members", "channels", "invite"] as AllianceTab[]).map((t) => (
                  <button
                    key={t}
                    className={`alliances-tab${tab === t ? " active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              <div className="alliances-tab-content">
                {tab === "members" && (
                  <ul className="alliance-members">
                    {detail.members.map((m) => (
                      <li key={m.hub_public_key}>
                        <strong>{m.hub_name}</strong>
                        <span className="muted"> — {m.hub_url}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "channels" && (
                  <>
                    <p className="muted" style={{ marginBottom: "var(--space-3)" }}>
                      Toggle which of your local channels are visible to other
                      members of this alliance.
                    </p>
                    {rootItems.length === 0 ? (
                      <p className="muted">No channels to share yet.</p>
                    ) : (
                      <div className="alliance-channel-tree">
                        {rootItems.map((item) => {
                          if (item.is_category) {
                            const catState = categorySharedState(item.id);
                            const collapsed = collapsedCats.has(item.id);
                            const children = getChildren(item.id).filter((c) => !c.is_category);
                            return (
                              <div key={item.id} className="act-category">
                                <div className="act-category-header">
                                  <button
                                    className="act-collapse-btn"
                                    onClick={() => setCollapsedCats((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                      return next;
                                    })}
                                  >
                                    {collapsed ? "▸" : "▾"}
                                  </button>
                                  <label className="checkbox-label act-category-label">
                                    <input
                                      type="checkbox"
                                      checked={catState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = catState === "some"; }}
                                      onChange={() => handleToggleCategoryShare(item.id)}
                                    />
                                    <strong>{item.name.toUpperCase()}</strong>
                                  </label>
                                </div>
                                {!collapsed && children.length > 0 && (
                                  <div className="act-children">
                                    {children.map((ch) => {
                                      const isShared = sharedChannelIds.has(ch.id);
                                      return (
                                        <label key={ch.id} className="checkbox-label act-channel">
                                          <input
                                            type="checkbox"
                                            checked={isShared}
                                            onChange={() => handleToggleShare(ch.id, isShared)}
                                          />
                                          # {ch.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            const isShared = sharedChannelIds.has(item.id);
                            return (
                              <label key={item.id} className="checkbox-label act-channel act-toplevel">
                                <input
                                  type="checkbox"
                                  checked={isShared}
                                  onChange={() => handleToggleShare(item.id, isShared)}
                                />
                                # {item.name}
                              </label>
                            );
                          }
                        })}
                      </div>
                    )}
                  </>
                )}

                {tab === "invite" && (
                  <div className="alliance-invite-tab">
                    <div className="alliance-invite-section">
                      <label className="settings-label">Send invite directly</label>
                      <p className="muted">
                        Enter another hub's URL to send them an invite request. They'll see
                        it in their Alliances section and can accept or decline.
                      </p>
                      <div className="alliance-join-row">
                        <input
                          type="text"
                          value={pushTargetUrl}
                          onChange={(e) => setPushTargetUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSendPushInvite(); }}
                          placeholder="https://other-hub.example.com"
                          disabled={pushSending}
                        />
                        <button
                          onClick={handleSendPushInvite}
                          disabled={!pushTargetUrl.trim() || pushSending}
                        >
                          {pushSending ? "Sending…" : "Send invite"}
                        </button>
                      </div>
                    </div>

                    <div className="alliance-invite-section">
                      <label className="settings-label">Invite another hub</label>
                      <p className="muted">
                        Generate a share code and send it to the other hub's admin.
                      </p>
                      <button className="btn-secondary" onClick={handleGenerateInvite}>
                        {invite && invite.alliance_id === selectedId
                          ? "Regenerate share code"
                          : "Generate share code"}
                      </button>
                      {invite && invite.alliance_id === selectedId && (() => {
                        const shareCode = btoa(JSON.stringify({
                          u: ownHubUrl,
                          a: invite.alliance_id,
                          t: invite.token,
                        }));
                        return (
                          <div className="alliance-share-code-block">
                            <p className="muted">Share this code with the other hub's admin:</p>
                            <div className="alliance-share-code-row">
                              <code className="alliance-share-code">{shareCode}</code>
                              <button
                                className="btn-secondary"
                                onClick={() => navigator.clipboard.writeText(shareCode).catch(() => {})}
                                title="Copy to clipboard"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="alliance-invite-section">
                      <label className="settings-label">Join via share code</label>
                      <p className="muted">
                        Paste the share code you received from another hub's admin.
                      </p>
                      <div className="alliance-join-row">
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                          placeholder="Paste share code…"
                        />
                        <button onClick={handleJoin} disabled={!joinCode.trim()}>
                          Join
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="alliances-no-selection">
              <p className="muted">
                Select an alliance from the list to see its details, or create
                a new one with the + button.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
