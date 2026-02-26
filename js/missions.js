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
function topMissionTotals(missions, photos, limit = 20) {
  missions = missions || {};
  photos = photos || {};
  const byName = new Map(); // normalizedName -> { name, count, missionPieces, photoPieces }

  for (const id of Object.keys(missions)) {
    const mission = missions[id];
    if (!mission || isMissionHidden(mission)) continue;
    const rawName = String(mission?.name || '').trim();
    const key = missionGroupKey(rawName);
    const pieces = getMissionPieces(mission);
    const defaultName = key === 'sky care' ? 'Sky Care' : (rawName || 'Unnamed mission');
    const current = byName.get(key) || { name: defaultName, missionPieces: 0, photoPieces: 0 };
    current.missionPieces += pieces;
    // Prefer a non-empty display name if we only had a placeholder.
    if (key !== 'sky care' && (current.name === 'Unnamed mission' || current.name === 'undefined') && rawName) {
      current.name = rawName;
    }
    byName.set(key, current);
  }

  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const missionIds = getPhotoMissionIds(photo);
    if (!missionIds.length) continue;
    const pieces = getPieces(photo);
    const seen = new Set();
    for (const missionId of missionIds) {
      const meta = getMissionFilterMeta(missionId, missions);
      if (seen.has(meta.key)) continue;
      seen.add(meta.key);
      const key = meta.key;
      const defaultName = key === 'sky care' ? 'Sky Care' : (meta.name || 'Unnamed mission');
      const current = byName.get(key) || { name: defaultName, missionPieces: 0, photoPieces: 0 };
      current.photoPieces += pieces;
      if (key !== 'sky care' && (current.name === 'Unnamed mission' || current.name === 'undefined') && meta.name) {
        current.name = meta.name;
      }
      byName.set(key, current);
    }
  }

  return [...byName.values()]
    .map((row) => ({ name: row.name, count: Math.max(row.missionPieces, row.photoPieces) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit | 0));
}

function getPhotoMissionIds(photo) {
  if (!Array.isArray(photo?.missions)) return [];
  return photo.missions
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function getMissionFilterMeta(missionId, missions) {
  const mission = missions?.[missionId] || {};
  const rawName = String(mission?.name || '').trim();
  if (rawName) {
    const key = missionGroupKey(rawName);
    const name = key === 'sky care' ? 'Sky Care' : rawName;
    return { key, name };
  }
  return { key: `id:${missionId}`, name: `Mission ${String(missionId).slice(0, 8)}` };
}

function buildMissionFilterOptions(photos, missions) {
  photos = photos || {};
  missions = missions || {};
  const totals = new Map();

  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const missionIds = getPhotoMissionIds(photo);
    if (!missionIds.length) continue;
    const pieces = getPieces(photo);
    const seen = new Set();
    for (const missionId of missionIds) {
      const meta = getMissionFilterMeta(missionId, missions);
      if (seen.has(meta.key)) continue;
      seen.add(meta.key);
      const current = totals.get(meta.key) || { key: meta.key, name: meta.name, pieces: 0, photos: 0 };
      current.pieces += pieces;
      current.photos += 1;
      totals.set(meta.key, current);
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name));
}

function photoMatchesMissionKey(photo, selectedMissionKey, missions) {
  if (!selectedMissionKey) return true;
  const missionIds = getPhotoMissionIds(photo);
  for (const missionId of missionIds) {
    const meta = getMissionFilterMeta(missionId, missions);
    if (meta.key === selectedMissionKey) return true;
  }
  return false;
}

function getMissionNameByFilterKey(missions, selectedMissionKey) {
  if (!selectedMissionKey) return 'All missions';
  const meta = buildMissionFilterOptions({}, missions).find((item) => item.key === selectedMissionKey);
  if (meta?.name) return meta.name;
  for (const id of Object.keys(missions || {})) {
    const candidate = getMissionFilterMeta(id, missions);
    if (candidate.key === selectedMissionKey) return candidate.name;
  }
  return 'Selected mission';
}
