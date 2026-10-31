/** Begin freshness checking while a server snapshot is being restored. Callers
 * can publish the snapshot during loadSnapshot, before this promise resolves. */
export async function prepareSource({ force, hasData, revision, loadSnapshot }: {
  force: boolean;
  hasData: () => boolean;
  revision: () => Promise<string | null>;
  loadSnapshot: () => Promise<void>;
}): Promise<string | null> {
  const revisionJob = revision();
  if (!force && !hasData()) await loadSnapshot();
  // A cold source must be fetched regardless; do not wait for metadata.
  return hasData() || force ? await revisionJob : null;
}
