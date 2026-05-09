import { useEffect, useState } from "react";
import type { NamedProfile } from "../types";
import { Avatar } from "./Avatar";
import { AvatarEditor } from "./AvatarEditor";

/**
 * Profile tab — multiple named profiles. One is marked as default and gets
 * auto-applied to new hubs. The user can create as many as they like, edit
 * each, and apply any one of them to the currently active hub.
 *
 * Avatar sits to the LEFT of the display name in the editor, which reads
 * more like a profile card.
 */
export function ProfileTab({
  hasActiveHub,
  profiles,
  defaultProfileId,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onSetDefaultProfile,
  onApplyProfileToHub,
}: {
  hasActiveHub: boolean;
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  onCreateProfile: () => void;
  onUpdateProfile: (id: string, patch: Partial<Omit<NamedProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultProfileId ?? profiles[0]?.id ?? null,
  );

  // Keep selection valid as profiles list changes.
  useEffect(() => {
    if (profiles.length === 0) {
      setSelectedId(null);
    } else if (!profiles.find((p) => p.id === selectedId)) {
      setSelectedId(defaultProfileId ?? profiles[0].id);
    }
  }, [profiles, defaultProfileId, selectedId]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <section>
      <h1>Profile</h1>
      <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
        Create as many profiles as you like — say, one for friends and one
        for work. The one marked Default is what new hubs use automatically.
        Use <strong>Apply to this hub</strong> to switch profiles on the
        hub you're currently viewing.
      </p>

      <div className="profile-cards">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`profile-card ${selectedId === p.id ? "active" : ""}`}
            onClick={() => setSelectedId(p.id)}
            type="button"
          >
            {defaultProfileId === p.id && (
              <span className="profile-card-default">Default</span>
            )}
            <Avatar src={p.avatar} name={p.display_name || p.label} size={48} />
            <div className="profile-card-text">
              <div className="profile-card-label">{p.label}</div>
              <div className="profile-card-name">
                {p.display_name || (
                  <span className="muted">no display name</span>
                )}
              </div>
            </div>
          </button>
        ))}
        <button
          className="profile-card profile-card-add"
          onClick={onCreateProfile}
          type="button"
        >
          <div className="profile-card-add-plus">+</div>
          <div className="profile-card-text">
            <div className="profile-card-label">New profile</div>
          </div>
        </button>
      </div>

      {selected && (
        <div className="settings-section profile-editor">
          <div className="profile-editor-row">
            <AvatarEditor
              value={selected.avatar ?? ""}
              onChange={(v) =>
                onUpdateProfile(selected.id, { avatar: v || null })
              }
              fallbackName={selected.display_name || selected.label}
            />
            <div className="profile-editor-fields">
              <label className="settings-label">Display name</label>
              <input
                type="text"
                value={selected.display_name}
                onChange={(e) =>
                  onUpdateProfile(selected.id, { display_name: e.target.value })
                }
                placeholder="e.g. Antonio"
              />
              <label
                className="settings-label"
                style={{ marginTop: "var(--space-3)" }}
              >
                Profile label
              </label>
              <input
                type="text"
                value={selected.label}
                onChange={(e) =>
                  onUpdateProfile(selected.id, { label: e.target.value })
                }
                placeholder="e.g. Friends, Work, Gaming"
              />
            </div>
          </div>

          <div className="profile-editor-actions">
            {defaultProfileId !== selected.id && (
              <button
                className="btn-secondary"
                onClick={() => onSetDefaultProfile(selected.id)}
              >
                ★ Set as default
              </button>
            )}
            <button
              onClick={() => onApplyProfileToHub(selected.id)}
              disabled={!hasActiveHub}
              title={hasActiveHub ? "" : "Join a hub first"}
            >
              Apply to this hub
            </button>
            <button
              className="btn-secondary"
              onClick={() => onDeleteProfile(selected.id)}
              disabled={profiles.length <= 1}
              title={
                profiles.length <= 1 ? "You need at least one profile" : ""
              }
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {profiles.length === 0 && (
        <p className="muted">
          No profiles yet — click <strong>+ New profile</strong> above to
          create one.
        </p>
      )}
    </section>
  );
}
