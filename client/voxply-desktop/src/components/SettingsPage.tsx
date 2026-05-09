import type { NamedProfile } from "../types";
import { formatPubkey } from "../utils/format";
import { MicLevelMeter } from "./MicLevelMeter";
import { PttKeyBinder } from "./PttKeyBinder";
import { ThemePicker } from "./ThemePicker";
import { ProfileTab } from "./ProfileTab";
import { RestoreIdentitySection } from "./RestoreIdentitySection";

export type SettingsTab =
  | "profile"
  | "account"
  | "appearance"
  | "voice"
  | "security"
  | "about";

export interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  // Profile system: multiple named profiles with one marked default.
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  onCreateProfile: () => void;
  onUpdateProfile: (
    id: string,
    patch: Partial<Omit<NamedProfile, "id">>,
  ) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;

  theme: "calm" | "classic" | "linear" | "light";
  onThemeChange: (t: "calm" | "classic" | "linear" | "light") => void;
  hasActiveHub: boolean;
  publicKey: string | null;
  copiedKey: boolean;
  onCopyKey: () => void;
  audioInputs: string[];
  audioOutputs: string[];
  voiceInputDevice: string;
  voiceOutputDevice: string;
  onInputDeviceChange: (v: string) => void;
  onOutputDeviceChange: (v: string) => void;
  vadThreshold: number;
  onVadChange: (v: number) => void;
  voiceMode: "vad" | "ptt";
  onVoiceModeChange: (m: "vad" | "ptt") => void;
  pttKey: string;
  onPttKeyChange: (k: string) => void;
  mentionPingEnabled: boolean;
  onMentionPingChange: (v: boolean) => void;
  micLevel: number;
  micTesting: boolean;
  onToggleMicTest: () => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  onRecoverIdentity: (phrase: string) => Promise<void>;
  onClearLocalData: () => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "account", label: "Account" },
    { id: "appearance", label: "Appearance" },
    { id: "voice", label: "Voice & Video" },
    { id: "security", label: "Security" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Settings</h2>
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
        {props.tab === "profile" && (
          <ProfileTab
            hasActiveHub={props.hasActiveHub}
            profiles={props.profiles}
            defaultProfileId={props.defaultProfileId}
            onCreateProfile={props.onCreateProfile}
            onUpdateProfile={props.onUpdateProfile}
            onDeleteProfile={props.onDeleteProfile}
            onSetDefaultProfile={props.onSetDefaultProfile}
            onApplyProfileToHub={props.onApplyProfileToHub}
          />
        )}
        {props.tab === "account" && (
          <section>
            <h1>Account</h1>
            <div className="settings-section">
              <label className="settings-label">Your public key</label>
              <p className="muted">
                Your unique identity. Share this with someone to send you a
                friend request. Same key works on every hub.
              </p>
              <div className="settings-row">
                <code className="pubkey-display" title={props.publicKey ?? ""}>
                  {formatPubkey(props.publicKey)}
                </code>
                <button onClick={props.onCopyKey}>
                  {props.copiedKey ? "Copied" : "Copy full key"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Local data</label>
              <p className="muted">
                Wipes per-device preferences (unread, mutes, pins, voice
                settings, recents). Your identity and the list of saved hubs
                are kept — use Restore from recovery phrase or Leave hub for
                those.
              </p>
              <button
                className="btn-secondary"
                onClick={props.onClearLocalData}
              >
                Clear local data…
              </button>
            </div>
          </section>
        )}
        {props.tab === "appearance" && (
          <section>
            <h1>Appearance</h1>
            <div className="settings-section">
              <label className="settings-label">Theme</label>
              <p className="muted">
                How Voxply looks. Pick whichever feels right — you can change
                it any time.
              </p>
              <ThemePicker value={props.theme} onChange={props.onThemeChange} />
            </div>
          </section>
        )}
        {props.tab === "voice" && (
          <section>
            <h1>Voice & Video</h1>
            <div className="settings-section">
              <label className="settings-label">Microphone</label>
              <select
                value={props.voiceInputDevice}
                onChange={(e) => props.onInputDeviceChange(e.target.value)}
              >
                <option value="">System default</option>
                {props.audioInputs.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-section">
              <label className="settings-label">Speaker</label>
              <select
                value={props.voiceOutputDevice}
                onChange={(e) => props.onOutputDeviceChange(e.target.value)}
              >
                <option value="">System default</option>
                {props.audioOutputs.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-section">
              <label className="settings-label">
                Mic sensitivity — threshold {props.vadThreshold.toFixed(3)}
              </label>
              <p className="muted">
                Drag the marker. Voice is detected when the green bar crosses
                it. Fill animates only while you're in voice or running a mic
                test. Changes apply on the next voice channel you join.
              </p>
              <MicLevelMeter
                level={props.micLevel}
                threshold={props.vadThreshold}
                onChange={props.onVadChange}
              />
            </div>
            <div className="settings-section">
              <label className="settings-label">Activation mode</label>
              <p className="muted">
                Voice activity (VAD) opens the mic when it detects speech.
                Push-to-talk keeps it muted until you hold the bound key.
              </p>
              <div className="settings-row">
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="voice-mode"
                    checked={props.voiceMode === "vad"}
                    onChange={() => props.onVoiceModeChange("vad")}
                  />
                  Voice activity (VAD)
                </label>
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="voice-mode"
                    checked={props.voiceMode === "ptt"}
                    onChange={() => props.onVoiceModeChange("ptt")}
                  />
                  Push-to-talk
                </label>
              </div>
              {props.voiceMode === "ptt" && (
                <PttKeyBinder
                  value={props.pttKey}
                  onChange={props.onPttKeyChange}
                />
              )}
            </div>
            <div className="settings-section">
              <label className="settings-label">Microphone test</label>
              <p className="muted">
                Plays your mic back through your speaker. Use headphones to
                avoid feedback.
              </p>
              <button onClick={props.onToggleMicTest} className="btn-secondary">
                {props.micTesting ? "Stop test" : "Start mic test"}
              </button>
            </div>
            <div className="settings-section">
              <label className="settings-label">Mention ping</label>
              <p className="muted">
                Plays a short two-tone sound when someone @-mentions you in
                a non-focused channel. OS notifications are independent.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={props.mentionPingEnabled}
                  onChange={(e) => props.onMentionPingChange(e.target.checked)}
                />
                Play mention ping
              </label>
            </div>
          </section>
        )}
        {props.tab === "security" && (
          <section>
            <h1>Security</h1>
            <div className="settings-section">
              <label className="settings-label">Recovery phrase</label>
              <p className="muted">
                24 words you can use to restore your identity. Write them down
                and keep them safe — anyone with these words can impersonate
                you.
              </p>
              {props.recoveryPhrase ? (
                <div className="recovery-phrase">{props.recoveryPhrase}</div>
              ) : (
                <button onClick={props.onShowRecovery} className="btn-secondary">
                  Reveal recovery phrase
                </button>
              )}
            </div>
            <RestoreIdentitySection onRestore={props.onRecoverIdentity} />
          </section>
        )}
        {props.tab === "about" && (
          <section>
            <h1>About</h1>
            <p className="muted">
              Voxply — decentralized voice chat + community platform.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
