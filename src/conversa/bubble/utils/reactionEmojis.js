export const WA_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏"];
export const WA_REACTION_MORE_EMOJIS = ["😍", "🔥", "🎉", "✅", "🤔", "😡"];

export function getReactionEmojiOptions(expanded) {
  return expanded ? [...WA_REACTION_EMOJIS, ...WA_REACTION_MORE_EMOJIS] : WA_REACTION_EMOJIS;
}
