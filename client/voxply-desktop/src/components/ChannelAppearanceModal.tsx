import React, { useState } from "react";
import type { Channel } from "../types";
import { ChannelIconPicker } from "./ChannelIconPicker";

const ACCENT_COLORS = [
  { id: "red",    hex: "#e74c3c" },
  { id: "orange", hex: "#e67e22" },
  { id: "yellow", hex: "#f39c12" },
  { id: "green",  hex: "#27ae60" },
  { id: "teal",   hex: "#16a085" },
  { id: "blue",   hex: "#2980b9" },
  { id: "purple", hex: "#8e44ad" },
  { id: "pink",   hex: "#e91e63" },
  { id: "gray",   hex: "#7f8c8d" },
];

interface Props {
  channel: Channel;
  onSave: (icon: string | null, color: string | null) => void;
  onClose: () => void;
}

export function ChannelAppearanceModal({ channel, onSave, onClose }: Props) {
  const [icon, setIcon] = useState<string | null>(channel.icon);
  const [color, setColor] = useState<string | null>(channel.color);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal appearance-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit appearance — {channel.is_category ? channel.name.toUpperCase() : `#${channel.name}`}</h3>

        <div className="settings-section">
          <label className="settings-label">Icon</label>
          <ChannelIconPicker value={icon} onChange={setIcon} />
        </div>

        {channel.is_category && (
          <div className="settings-section">
            <label className="settings-label">Accent color</label>
            <div className="color-swatch-row">
              <button
                type="button"
                className={`color-swatch color-swatch-none ${color === null ? "selected" : ""}`}
                onClick={() => setColor(null)}
                title="None"
              >
                ✕
              </button>
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`color-swatch ${color === c.hex ? "selected" : ""}`}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c.hex)}
                  title={c.id}
                />
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={() => { onSave(icon, color); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}
