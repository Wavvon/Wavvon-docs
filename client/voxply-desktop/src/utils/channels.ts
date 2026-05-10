// Pure channel-tree helpers. No React, no Tauri.
import type { Channel } from "../types";

/**
 * Build the sorted, nested channel tree for a sidebar render pass.
 * Pinned channels are excluded so they render in their own section.
 */
export function buildChannelTree(
  channels: Channel[],
  pinnedSet: Record<string, boolean>,
): { node: Channel; children: Channel[] }[] {
  const sorted = [...channels]
    .sort((a, b) => a.display_order - b.display_order)
    .filter((c) => !pinnedSet[c.id]);
  const tree: { node: Channel; children: Channel[] }[] = [];
  for (const ch of sorted.filter((c) => !c.parent_id)) {
    tree.push({ node: ch, children: sorted.filter((c) => c.parent_id === ch.id) });
  }
  return tree;
}
