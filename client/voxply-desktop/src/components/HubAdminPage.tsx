import type {
  BanInfo,
  Channel,
  InviteInfo,
  MemberAdminInfo,
  PendingUser,
  RoleInfo,
} from "../types";
import { formatPubkey, formatRelative } from "../utils/format";
import { ImagePicker } from "./ImagePicker";
import { InvitesSection } from "./InvitesSection";
import { MemberRow } from "./MemberRow";
import { RoleCreator } from "./RoleCreator";
import { RoleEditor } from "./RoleEditor";
import { AlliancesSection } from "./AlliancesSection";

export type HubAdminTab =
  | "overview"
  | "roles"
  | "members"
  | "bans"
  | "invites"
  | "alliances";

export interface HubAdminPageProps {
  tab: HubAdminTab;
  onTab: (t: HubAdminTab) => void;
  onClose: () => void;
  hubName: string;
  onHubNameChange: (v: string) => void;
  hubDescription: string;
  onHubDescriptionChange: (v: string) => void;
  hubIcon: string;
  onHubIconChange: (v: string) => void;
  requireApproval: boolean;
  onRequireApprovalChange: (v: boolean) => void;
  onSave: () => void;
  pendingMembers: PendingUser[];
  onApproveMember: (publicKey: string) => void;
  roles: RoleInfo[];
  onCreateRole: (
    name: string,
    perms: string[],
    priority: number,
    displaySeparately: boolean,
  ) => void;
  onUpdateRole: (
    id: string,
    updates: {
      name?: string;
      permissions?: string[];
      priority?: number;
      display_separately?: boolean;
    },
  ) => void;
  onDeleteRole: (id: string) => void;
  members: MemberAdminInfo[];
  onKickMember: (publicKey: string) => void;
  onBanMember: (publicKey: string) => void;
  onMuteMember: (publicKey: string) => void;
  onTimeoutMember: (publicKey: string) => void;
  onVoiceMuteMember: (publicKey: string) => void;
  onVoiceUnmuteMember: (publicKey: string) => void;
  voiceMutedKeys: Set<string>;
  onToggleRoleAssignment: (
    publicKey: string,
    roleId: string,
    hasRole: boolean,
  ) => void;
  bans: BanInfo[];
  onUnban: (publicKey: string) => void;
  invites: InviteInfo[];
  activeHubUrl: string;
  onCreateInvite: (maxUses: number | null, expiresInSeconds: number | null) => void;
  onRevokeInvite: (code: string) => void;
  channels: Channel[];
}

export function HubAdminPage(props: HubAdminPageProps) {
  const tabs: { id: HubAdminTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "roles", label: "Roles" },
    { id: "members", label: "Members" },
    { id: "bans", label: "Bans" },
    { id: "invites", label: "Invites" },
    { id: "alliances", label: "Alliances" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Hub settings</h2>
        <ul>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                className={`settings-nav-item ${props.tab === t.id ? "active" : ""}`}
                onClick={() => props.onTab(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={props.onClose}>
          Close (ESC)
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title="Close">
          ×
        </button>
        {props.tab === "overview" && (
          <section>
            <h1>Overview</h1>
            <div className="settings-section">
              <label className="settings-label">Hub name</label>
              <input
                type="text"
                value={props.hubName}
                onChange={(e) => props.onHubNameChange(e.target.value)}
                placeholder="My Hub"
              />
            </div>
            <div className="settings-section">
              <label className="settings-label">Description</label>
              <p className="muted">Shown to visitors before they join.</p>
              <textarea
                rows={3}
                value={props.hubDescription}
                onChange={(e) => props.onHubDescriptionChange(e.target.value)}
                placeholder="What's this hub for?"
              />
            </div>
            <div className="settings-section">
              <label className="settings-label">Icon</label>
              <p className="muted">
                PNG or JPG, max 256 KB. Stored inline on the hub.
              </p>
              <div className="hub-icon-editor">
                {props.hubIcon ? (
                  <img
                    src={props.hubIcon}
                    alt="Hub icon"
                    className="hub-icon-preview"
                  />
                ) : (
                  <div className="hub-icon-preview placeholder">No icon</div>
                )}
                <ImagePicker
                  onPick={props.onHubIconChange}
                  onClear={() => props.onHubIconChange("")}
                  hasValue={!!props.hubIcon}
                  buttonLabel="Pick image"
                />
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Membership</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={props.requireApproval}
                  onChange={(e) =>
                    props.onRequireApprovalChange(e.target.checked)
                  }
                />
                Require admin approval before new members can participate
              </label>
              <p className="muted">
                When on, anyone who authenticates is marked pending. They can
                see their own status but nothing else until an admin approves
                them on the Members tab.
              </p>
            </div>
            <div className="settings-section">
              <button onClick={props.onSave}>Save changes</button>
            </div>
          </section>
        )}
        {props.tab === "roles" && (
          <section>
            <h1>Roles</h1>
            <p className="muted">
              Built-in roles (@everyone, Owner) can't be renamed or deleted but
              @everyone permissions can be tuned.
            </p>
            {props.roles
              .slice()
              .sort((a, b) => b.priority - a.priority)
              .map((role) => (
                <RoleEditor
                  key={role.id}
                  role={role}
                  onUpdate={(updates) => props.onUpdateRole(role.id, updates)}
                  onDelete={() => props.onDeleteRole(role.id)}
                />
              ))}
            <RoleCreator onCreate={props.onCreateRole} />
          </section>
        )}
        {props.tab === "members" && (
          <section>
            {props.pendingMembers.length > 0 && (
              <div className="pending-section">
                <h2>Pending approval — {props.pendingMembers.length}</h2>
                <table className="members-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Signed up</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.pendingMembers.map((p) => (
                      <tr key={p.public_key}>
                        <td>
                          <div className="member-name">
                            {p.display_name || "(no name)"}
                          </div>
                          <div className="member-pk" title={p.public_key}>
                            {formatPubkey(p.public_key)}
                          </div>
                        </td>
                        <td>{formatRelative(p.first_seen_at)}</td>
                        <td>
                          <button
                            className="btn-small"
                            onClick={() => props.onApproveMember(p.public_key)}
                          >
                            Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h1>Members — {props.members.length}</h1>
            <table className="members-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.members.map((m) => (
                  <MemberRow
                    key={m.public_key}
                    member={m}
                    allRoles={props.roles}
                    voiceMuted={props.voiceMutedKeys.has(m.public_key)}
                    onKick={() => props.onKickMember(m.public_key)}
                    onBan={() => props.onBanMember(m.public_key)}
                    onMute={() => props.onMuteMember(m.public_key)}
                    onTimeout={() => props.onTimeoutMember(m.public_key)}
                    onVoiceMute={() => props.onVoiceMuteMember(m.public_key)}
                    onVoiceUnmute={() => props.onVoiceUnmuteMember(m.public_key)}
                    onToggleRole={(roleId, has) =>
                      props.onToggleRoleAssignment(m.public_key, roleId, has)
                    }
                  />
                ))}
              </tbody>
            </table>
            {props.members.length === 0 && (
              <p className="muted">No members yet.</p>
            )}
          </section>
        )}
        {props.tab === "bans" && (
          <section>
            <h1>Bans — {props.bans.length}</h1>
            {props.bans.length === 0 ? (
              <p className="muted">No active bans.</p>
            ) : (
              <table className="members-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Reason</th>
                    <th>Banned by</th>
                    <th>When</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.bans.map((b) => (
                    <tr key={b.target_public_key}>
                      <td>
                        <div className="member-pk" title={b.target_public_key}>
                          {formatPubkey(b.target_public_key)}
                        </div>
                      </td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
                      <td>
                        <span className="member-pk" title={b.banned_by}>
                          {formatPubkey(b.banned_by)}
                        </span>
                      </td>
                      <td>{formatRelative(b.created_at)}</td>
                      <td>
                        <button
                          className="btn-small"
                          onClick={() => props.onUnban(b.target_public_key)}
                        >
                          Unban
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {props.tab === "invites" && (
          <InvitesSection
            invites={props.invites}
            hubUrl={props.activeHubUrl}
            onCreate={props.onCreateInvite}
            onRevoke={props.onRevokeInvite}
          />
        )}
        {props.tab === "alliances" && (
          <AlliancesSection
            channels={props.channels}
            ownHubUrl={props.activeHubUrl}
          />
        )}
      </main>
    </div>
  );
}
