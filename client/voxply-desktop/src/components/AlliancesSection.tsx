import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AllianceDetail,
  AllianceInfo,
  AllianceInvite,
  AllianceSharedChannel,
  Channel,
} from "../types";

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

  const [newName, setNewName] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [joinAllianceId, setJoinAllianceId] = useState("");
  const [joinToken, setJoinToken] = useState("");

  async function refresh() {
    try {
      const list = await invoke<AllianceInfo[]>("list_alliances");
      setAlliances(list);
      if (selectedId && !list.find((a) => a.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
        setShared([]);
      }
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
      await refresh();
      setSelectedId(created.id);
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
    const url = joinUrl.trim();
    const id = joinAllianceId.trim();
    const tok = joinToken.trim();
    if (!url || !id || !tok) return;
    try {
      await invoke("join_alliance", {
        inviterHubUrl: url,
        allianceId: id,
        inviteToken: tok,
        ownHubPublicUrl: ownHubUrl || url,
      });
      setJoinUrl("");
      setJoinAllianceId("");
      setJoinToken("");
      await refresh();
      setSelectedId(id);
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
        await invoke("unshare_channel_from_alliance", {
          allianceId: selectedId,
          channelId,
        });
      } else {
        await invoke("share_channel_with_alliance", {
          allianceId: selectedId,
          channelId,
        });
      }
      await refreshDetail(selectedId);
    } catch (e) {
      setError(String(e));
    }
  }

  const sharedChannelIds = new Set(shared.map((s) => s.channel_id));
  const localChannels = channels.filter((c) => !c.is_category);

  return (
    <section>
      <h1>Alliances</h1>
      <p className="muted">
        Group your hub with other hubs to share channels and voice. A hub can
        be in multiple alliances.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="settings-section">
        <label className="settings-label">Your alliances</label>
        {alliances.length === 0 ? (
          <p className="muted">Not in any alliance yet.</p>
        ) : (
          <ul className="alliance-list">
            {alliances.map((a) => (
              <li
                key={a.id}
                className={`alliance-item ${selectedId === a.id ? "active" : ""}`}
                onClick={() => setSelectedId(a.id)}
              >
                {a.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedId && detail && (
        <div className="alliance-detail">
          <div className="alliance-detail-header">
            <h2>{detail.name}</h2>
            <button className="btn-secondary-small" onClick={handleLeave}>
              Leave alliance
            </button>
          </div>

          <div className="settings-section">
            <label className="settings-label">Member hubs</label>
            <ul className="alliance-members">
              {detail.members.map((m) => (
                <li key={m.hub_public_key}>
                  <strong>{m.hub_name}</strong>
                  <span className="muted"> — {m.hub_url}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="settings-section">
            <label className="settings-label">Channels you share</label>
            <p className="muted">
              Toggle which of your local channels are visible to other members
              of this alliance.
            </p>
            {localChannels.length === 0 ? (
              <p className="muted">No channels to share yet.</p>
            ) : (
              <ul className="alliance-share-list">
                {localChannels.map((c) => {
                  const isShared = sharedChannelIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={isShared}
                          onChange={() => handleToggleShare(c.id, isShared)}
                        />
                        # {c.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="settings-section">
            <label className="settings-label">Invite another hub</label>
            <p className="muted">
              Generate an invite token and share it (along with this hub's URL
              and the alliance ID) with the other hub's admin.
            </p>
            <button className="btn-secondary" onClick={handleGenerateInvite}>
              {invite ? "Regenerate invite token" : "Generate invite token"}
            </button>
            {invite && invite.alliance_id === selectedId && (
              <div className="alliance-invite-block">
                <div className="alliance-invite-row">
                  <span className="muted">Alliance ID</span>
                  <code>{invite.alliance_id}</code>
                </div>
                <div className="alliance-invite-row">
                  <span className="muted">Inviter hub URL</span>
                  <code>{ownHubUrl}</code>
                </div>
                <div className="alliance-invite-row">
                  <span className="muted">Token</span>
                  <code className="alliance-token">{invite.token}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">Create a new alliance</label>
        <div className="settings-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Alliance name"
          />
          <button onClick={handleCreate} disabled={!newName.trim()}>
            Create
          </button>
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Join an alliance</label>
        <p className="muted">
          Paste the inviter hub's URL, the alliance ID, and the invite token
          you were given.
        </p>
        <div className="alliance-join-form">
          <input
            type="text"
            value={joinUrl}
            onChange={(e) => setJoinUrl(e.target.value)}
            placeholder="Inviter hub URL (https://...)"
          />
          <input
            type="text"
            value={joinAllianceId}
            onChange={(e) => setJoinAllianceId(e.target.value)}
            placeholder="Alliance ID"
          />
          <input
            type="text"
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
            placeholder="Invite token"
          />
          <button
            onClick={handleJoin}
            disabled={
              !joinUrl.trim() || !joinAllianceId.trim() || !joinToken.trim()
            }
          >
            Join
          </button>
        </div>
      </div>
    </section>
  );
}
