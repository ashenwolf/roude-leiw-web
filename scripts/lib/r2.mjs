/**
 * Cloudflare R2 REST helpers. Shared by sync-audio (download inventory) and
 * prune-audio. Listing via REST is one HTTP call; wrangler CLI boots per object.
 */
const API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Classify one download candidate without touching the network.
 * `remoteHas` is `null` when the bucket inventory is unavailable (probe via get).
 *
 * @returns {"have" | "absent" | "fetch"}
 */
export const classifyAudioDownload = ({ force, localExists, remoteHas }) => {
  if (!force && localExists) return "have";
  if (remoteHas === false) return "absent";
  return "fetch";
};

/** List every object key in the bucket, following pagination cursors. */
export const listR2Keys = async ({ accountId, token, bucket, cursor, acc = [] }) => {
  const params = new URLSearchParams({ per_page: "1000", ...(cursor ? { cursor } : {}) });
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`R2 list failed: HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`R2 list failed: ${JSON.stringify(payload.errors)}`);
  }
  const keys = [...acc, ...payload.result.map((obj) => obj.key)];
  return payload.result_info?.is_truncated
    ? listR2Keys({ accountId, token, bucket, cursor: payload.result_info.cursor, acc: keys })
    : keys;
};
