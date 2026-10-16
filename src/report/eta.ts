/**
 * Seconds left in a report run. The planned estimate counts down until a chapter has been
 * written; after that the observed pace of written chapters decides, since model latency,
 * repair calls and rate-limit waits vary far more than any fixed per-chapter guess.
 */
export function remainingSeconds({ estimatedSeconds, elapsed, pending, chapterSeconds }: {
  estimatedSeconds: number; elapsed: number; pending: number; chapterSeconds: number[];
}) {
  if (!pending) return 0;
  if (!chapterSeconds.length) return Math.max(0, estimatedSeconds - elapsed);
  const pace = chapterSeconds.reduce((sum, s) => sum + s, 0) / chapterSeconds.length;
  return Math.round(pace * pending);
}
