// Shared type definitions for the Voxply desktop client.
//
// These map to the JSON shapes returned by Tauri commands and hub
// HTTP endpoints. Keep them in sync with the Rust side; a renamed
// field in src-tauri or server/voxply-hub means a rename here too.

export interface Channel {
  id: string;
  name: string;
  created_by: string;
  parent_id: string | null;
  is_category: boolean;
  display_order: number;
  description: string | null;
  icon: string | null;
  color: string | null;
  custom_icon_svg: string | null;
  created_at: number;
}

export interface HubIcon {
  id: string;
  name: string;
  svg_content: string;
  uploaded_by: string;
  created_at: number;
}

export interface Attachment {
  name: string;
  mime: string;
  data_b64: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ReplyContext {
  message_id: string;
  sender: string;
  sender_name: string | null;
  content_preview: string;
}

export interface Message {
  id: string;
  channel_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: number;
  edited_at: number | null;
  attachments?: Attachment[];
  reactions?: Reaction[];
  reply_to?: ReplyContext | null;
}

export type NotifyMode = "all" | "mentions" | "silent";

export interface User {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
  online: boolean;
  group_role: string | null;
  is_bot?: boolean;
}

export interface BotInfo {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  token?: string;
}

export interface VoiceParticipant {
  public_key: string;
  display_name: string | null;
}

export interface Hub {
  hub_id: string;
  hub_name: string;
  hub_url: string;
  hub_icon: string | null;
  is_active: boolean;
}

export interface RoleInfo {
  id: string;
  name: string;
  permissions: string[];
  priority: number;
  display_separately?: boolean;
}

export interface NamedProfile {
  id: string;
  label: string;
  display_name: string;
  avatar: string | null;
}

export interface MeInfo {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
  approval_status: "approved" | "pending";
  roles: RoleInfo[];
}

export interface MemberAdminInfo {
  public_key: string;
  display_name: string | null;
  online: boolean;
  first_seen_at: number;
  last_seen_at: number;
  roles: RoleInfo[];
}

export interface BanInfo {
  target_public_key: string;
  banned_by: string;
  reason: string | null;
  created_at: number;
}

export interface VoiceMuteInfo {
  target_public_key: string;
  muted_by: string;
  reason: string | null;
  created_at: number;
}

export interface InviteInfo {
  code: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: number | null;
  created_at: number;
}

export interface PendingUser {
  public_key: string;
  display_name: string | null;
  first_seen_at: number;
}

export interface Friend {
  public_key: string;
  display_name: string | null;
  /** When non-null, this friend lives on another hub. DMs to them will be
   *  routed to this hub via the federated DM outbox. */
  hub_url: string | null;
  since: number;
}

export interface Conversation {
  id: string;
  conv_type: string;
  members: string[];
  created_at: number;
  last_activity_at?: number;
}

export interface DmMessage {
  sender: string;
  sender_name: string | null;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  is_encrypted?: boolean;
  /** True when at least one outbox row for this message has bounced
   *  (retries exhausted). Renders a delivery-failed mark next to the
   *  message. False/missing for received messages and not-yet-bounced sends. */
  delivery_failed?: boolean;
}

export interface DmMessageFull {
  id: string;
  conversation_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: number;
  attachments?: Attachment[];
  is_encrypted?: boolean;
  delivery_failed?: boolean;
}

export interface AllianceInfo {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export interface AllianceMemberInfo {
  hub_public_key: string;
  hub_name: string;
  hub_url: string;
  joined_at: number;
}

export interface AllianceDetail {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
  members: AllianceMemberInfo[];
}

export interface AllianceInvite {
  token: string;
  alliance_id: string;
  alliance_name: string;
  hub_url: string;
}

export interface AllianceSharedChannel {
  channel_id: string;
  channel_name: string;
  hub_public_key: string;
  hub_name: string;
}

export interface PublicHubEntry {
  hub_url: string;
  hub_name: string;
  joined_at: number;
}

export interface PublicHubProfile {
  pubkey: string;
  display_name: string;
  avatar: string | null;
  public_hubs: PublicHubEntry[];
  issued_at: number;
  signature: string;
}

export interface WsScreenShareStarted {
  type: "screen_share_started";
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
  kind: "screen" | "webcam";
  mime: string;
  has_audio: boolean;
}

export interface WsScreenShareChunkOut {
  type: "screen_share_chunk";
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
  seq: number;
  is_init: boolean;
}

export interface WsScreenShareStopped {
  type: "screen_share_stopped";
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
}

export interface ActiveStream {
  stream_id: string;
  sharer_pubkey: string;
  kind: "screen" | "webcam";
  mime: string;
  has_audio: boolean;
}

export interface ScreenShareOpts {
  includeAudio: boolean;
  includeWebcam: boolean;
  webcamDeviceId: string;
}

export interface SyncResult {
  synced: boolean;
  error: string | null;
}

export interface PendingAllianceInvite {
  id: string;
  alliance_id: string;
  alliance_name: string;
  from_hub_url: string;
  from_hub_name: string;
  from_hub_public_key: string;
  invite_token: string;
  created_at: number;
}
