/** Mission helpers and leaderboard aggregation. */

function normalizeMissionName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
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

function clampMissionDisplayPieces(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getPhotoMissionIds(photo) {
  if (!Array.isArray(photo?.missions)) return [];
  return photo.missions
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function getMissionFilterMeta(missionId, missions) {
  const id = String(missionId || '').trim();
  const mission = missions?.[id] || {};
  const rawName = String(mission?.name || '').trim();
  return {
    key: id,
    name: rawName || `Mission ${id.slice(0, 8)}`
  };
}

/** Returns [{ name, count }] for top missions by pieces. */
function topMissionTotals(missions, photos, limit = 20, options = {}) {
  const useScopedCounts = options.useScopedCounts === true;
  missions = missions || {};
  photos = photos || {};
  const byId = new Map();

  for (const id of Object.keys(missions)) {
    const mission = missions[id];
    if (!mission || isMissionHidden(mission)) continue;
    const meta = getMissionFilterMeta(id, missions);
    const pieces = getMissionPieces(mission);
    const current = byId.get(meta.key) || { name: meta.name, missionPieces: 0, photoPieces: 0 };
    current.missionPieces += pieces;
    if (meta.name) current.name = meta.name;
    byId.set(meta.key, current);
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
      const current = byId.get(meta.key) || { name: meta.name, missionPieces: 0, photoPieces: 0 };
      current.photoPieces += pieces;
      if (meta.name) current.name = meta.name;
      byId.set(meta.key, current);
    }
  }

  return [...byId.values()]
    .map((row) => ({
      name: row.name,
      count: clampMissionDisplayPieces(
        useScopedCounts ? row.photoPieces : row.missionPieces > 0 ? row.missionPieces : row.photoPieces
      )
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit | 0));
}

function buildMissionFilterOptions(photos, missions) {
  photos = photos || {};
  missions = missions || {};
  const totals = new Map();

  for (const id of Object.keys(missions)) {
    const mission = missions[id];
    if (!mission || isMissionHidden(mission)) continue;
    const meta = getMissionFilterMeta(id, missions);
    const pieces = getMissionPieces(mission);
    const current = totals.get(meta.key) || {
      key: meta.key,
      name: meta.name,
      missionPieces: 0,
      photoPieces: 0,
      photos: 0
    };
    current.missionPieces += pieces;
    if (meta.name) current.name = meta.name;
    totals.set(meta.key, current);
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
      const current = totals.get(meta.key) || {
        key: meta.key,
        name: meta.name,
        missionPieces: 0,
        photoPieces: 0,
        photos: 0
      };
      current.photoPieces += pieces;
      current.photos += 1;
      if (meta.name) current.name = meta.name;
      totals.set(meta.key, current);
    }
  }

  return [...totals.values()]
    .map((item) => ({
      key: item.key,
      name: item.name,
      pieces: clampMissionDisplayPieces(item.missionPieces > 0 ? item.missionPieces : item.photoPieces),
      photos: item.photos
    }))
    .filter((item) => item.pieces > 0 || item.photos > 0)
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
  return getMissionFilterMeta(selectedMissionKey, missions).name || 'Selected mission';
}
