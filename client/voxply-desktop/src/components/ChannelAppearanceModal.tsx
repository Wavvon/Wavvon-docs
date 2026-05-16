import React, { useRef, useState } from "react";
import type { Channel } from "../types";
import { ChannelIcon } from "./Icons";
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

const MAX_SVG_BYTES = 50 * 1024;

function sanitizeSvg(text: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const svgEl = doc.documentElement;
    if (svgEl.tagName.toLowerCase() !== "svg") return null;

    svgEl.querySelectorAll("script,foreignObject,iframe,use,image").forEach((el) => el.remove());

    function clean(el: Element) {
      const remove: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          remove.push(attr.name);
        } else if (
          (name === "href" || name === "xlink:href" || name === "src") &&
          attr.value &&
          !attr.value.startsWith("#") &&
          !attr.value.startsWith("data:")
        ) {
          remove.push(attr.name);
        }
      }
      remove.forEach((n) => el.removeAttribute(n));
      for (const child of Array.from(el.children)) clean(child);
    }
    clean(svgEl);

    const result = new XMLSerializer().serializeToString(svgEl);
    if (result.length > MAX_SVG_BYTES) return null;
    return result;
  } catch {
    return null;
  }
}

interface Props {
  channel: Channel;
  onSave: (icon: string | null, color: string | null, customIconSvg: string | null) => void;
  onClose: () => void;
}

export function ChannelAppearanceModal({ channel, onSave, onClose }: Props) {
  const [icon, setIcon] = useState<string | null>(channel.icon);
  const [color, setColor] = useState<string | null>(channel.color);
  const [customIconSvg, setCustomIconSvg] = useState<string | null>(channel.custom_icon_svg);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setUploadError("Only .svg files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const clean = sanitizeSvg(text);
      if (!clean) {
        setUploadError("Invalid or unsafe SVG — check the file and try again.");
      } else {
        setCustomIconSvg(clean);
        setUploadError(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal appearance-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          Edit appearance —{" "}
          {channel.is_category ? channel.name.toUpperCase() : `#${channel.name}`}
        </h3>

        <div className="settings-section">
          <label className="settings-label">Custom SVG icon</label>
          <p className="muted">
            Upload your own .svg file. Scripts and external references are
            stripped automatically.
          </p>
          <div className="custom-icon-upload-row">
            {customIconSvg && (
              <>
                <div className="custom-icon-preview">
                  <ChannelIcon icon={null} customIconSvg={customIconSvg} size={32} />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCustomIconSvg(null)}
                >
                  Remove
                </button>
              </>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
            >
              {customIconSvg ? "Replace SVG…" : "Upload SVG…"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>
          {uploadError && (
            <p style={{ color: "var(--color-error, red)", marginTop: "4px" }}>
              {uploadError}
            </p>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-label">
            Predefined icon{customIconSvg ? " (overridden by custom SVG)" : ""}
          </label>
          <div style={{ opacity: customIconSvg ? 0.4 : 1, pointerEvents: customIconSvg ? "none" : "auto" }}>
            <ChannelIconPicker value={icon} onChange={setIcon} />
          </div>
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
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button onClick={() => { onSave(icon, color, customIconSvg); onClose(); }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
