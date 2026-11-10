export function normalizeForMatching(content: string) {
  return content
    .normalize('NFKC')
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '$1')
    .replace(/\s*([:：,，.。/／])\s*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}
