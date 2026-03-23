import data from "@emoji-mart/data";

type EmojiData = {
  emojis: Record<string, { skins: Array<{ native: string }> }>;
  aliases: Record<string, string>;
};

const emojiData = data as unknown as EmojiData;

let shortcodeMap: Map<string, string> | null = null;

function getShortcodeMap(): Map<string, string> {
  if (shortcodeMap) return shortcodeMap;

  shortcodeMap = new Map<string, string>();

  for (const [id, emoji] of Object.entries(emojiData.emojis)) {
    const native = emoji.skins[0]?.native;
    if (native) {
      shortcodeMap.set(id, native);
    }
  }

  for (const [alias, targetId] of Object.entries(emojiData.aliases)) {
    const emoji = emojiData.emojis[targetId];
    const native = emoji?.skins[0]?.native;
    if (native) {
      shortcodeMap.set(alias, native);
    }
  }

  return shortcodeMap;
}

const SHORTCODE_RE = /:([a-zA-Z0-9_+\-]+):/g;

export function replaceEmojiShortcodes(text: string): string {
  const map = getShortcodeMap();
  return text.replace(SHORTCODE_RE, (match, code: string) => {
    return map.get(code) ?? match;
  });
}

export function hasEmojiShortcodes(text: string): boolean {
  return SHORTCODE_RE.test(text);
}
