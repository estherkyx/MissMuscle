/** Keep provider/older report wording understandable beside a video player. */
export function videoFeedback(text: string, evidence: ReadonlyArray<{ frameIndex: number; timestampSec: number }> = []): string {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map(sentence => {
    // Sampling is controlled by the app, so asking users for denser images is not actionable.
    if (/\b(frames?|images?|sampling|snapshots?)\b/i.test(sentence) && /\b(sparse|spacing|spaced|sampling|clearer|higher.resolution|more images|more frames)\b/i.test(sentence)) {
      return 'This part of your form isn’t clear enough to assess from the video.';
    }
    return sentence
      .replace(/\bin(?= frames?\s+\d)/gi, match => match === 'In' ? 'At' : 'at')
      .replace(/\bframes?\s+(\d+(?:(?:\s*,\s*|\s+and\s+|\s*&\s*)\d+)*)/gi, (_match, indices: string) => {
        const times = indices.match(/\d+/g)!.map(index => evidence.find(item => item.frameIndex === Number(index))?.timestampSec);
        return times.every(time => time !== undefined) ? times.map(time => `${Number(time!.toFixed(2))}s`).join(' and ') : 'the reviewed moments';
      })
      .replace(/\bout of frame\b/gi, 'out of view')
      .replace(/\b(?:sampled |supplied |these |the )?(?:frames|images|snapshots)\b/gi, 'video moments');
  }).filter((sentence, index, all) => all.indexOf(sentence) === index).join(' ');
}
