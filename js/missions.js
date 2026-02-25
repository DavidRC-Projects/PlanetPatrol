/** Mission helpers and leaderboard aggregation. */

function normalizeMissionName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function missionGroupKey(rawName) {
  const normalized = normalizeMissionName(rawName);
  // Amalgamate Sky Care missions across different years/variants.
  // Examples seen: "Sky Care 2022", "Sky Care Mission 2024", "Sky Care 2023", etc.
  if (normalized.startsWith('sky care')) return 'sky care';
  return normalized || 'undefined';
}

function getMissionPieces(mission) {
  // Firestore uses `totalPieces` (as seen in the console). Fallbacks included just in case.
  const raw =
    mission?.totalPieces ??
    mission?.pieces ??
    mission?.piecesCollected ??
    mission?.collectedPieces ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function isMissionHidden(mission) {
  return mission?.hidden === true;
}

/** Returns [{ name, count }] for top missions by pieces, grouped by mission name. */
function topMissionTotals(missions, limit = 20) {
  missions = missions || {};
  const byName = new Map(); // normalizedName -> { name, count }

  for (const id of Object.keys(missions)) {
    const mission = missions[id];
    if (!mission || isMissionHidden(mission)) continue;
    const rawName = String(mission?.name || '').trim();
    const key = missionGroupKey(rawName);
    const pieces = getMissionPieces(mission);
    const defaultName = key === 'sky care' ? 'Sky Care' : (rawName || 'Unnamed mission');
    const current = byName.get(key) || { name: defaultName, count: 0 };
    current.count += pieces;
    // Prefer a non-empty display name if we only had a placeholder.
    if (key !== 'sky care' && (current.name === 'Unnamed mission' || current.name === 'undefined') && rawName) {
      current.name = rawName;
    }
    byName.set(key, current);
  }

  return [...byName.values()]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit | 0));
}

