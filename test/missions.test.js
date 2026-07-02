const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadMissions() {
  const missionsSrc = fs.readFileSync(path.join(__dirname, '../js/missions.js'), 'utf8');
  const photoHelpersSrc = fs.readFileSync(path.join(__dirname, '../js/photo-helpers.js'), 'utf8');
  const filterRulesSrc = fs.readFileSync(path.join(__dirname, '../js/filter-rules.js'), 'utf8');
  const statsSrc = fs.readFileSync(path.join(__dirname, '../js/stats.js'), 'utf8');
  const context = { module: {}, exports: {} };
  vm.createContext(context);
  vm.runInContext(photoHelpersSrc, context);
  vm.runInContext(statsSrc, context);
  vm.runInContext(filterRulesSrc, context);
  vm.runInContext(missionsSrc, context);
  return context;
}

test('Sky Cares Mission 2026 appears as its own filter option', () => {
  const ctx = loadMissions();
  const missions = {
    '0xB4Mksz1fAzVXD5MVPO': { name: 'Sky Cares Mission 2026', totalPieces: 789, hidden: false },
    '9NSVnyZp3WmpPolH1CkL': { name: 'Sky Cares Mission 2024', totalPieces: 3232, hidden: false }
  };
  const options = ctx.buildMissionFilterOptions({}, missions);
  const sky2026 = options.find((item) => item.key === '0xB4Mksz1fAzVXD5MVPO');
  assert.ok(sky2026, 'expected Sky Cares Mission 2026 in mission filter options');
  assert.equal(sky2026.name, 'Sky Cares Mission 2026');
  assert.equal(sky2026.pieces, 789);
});

test('mission filter keys are unique per mission id', () => {
  const ctx = loadMissions();
  const missions = {
    a: { name: 'Sky Cares Mission 2024', totalPieces: 100, hidden: false },
    b: { name: 'Sky Cares Mission 2025', totalPieces: 200, hidden: false }
  };
  const options = ctx.buildMissionFilterOptions({}, missions);
  assert.equal(options.length, 2);
  assert.notEqual(options[0].key, options[1].key);
});

test('official mission total is used when only mission filter is active', () => {
  const ctx = loadMissions();
  const missionId = '0xB4Mksz1fAzVXD5MVPO';
  const missions = {
    [missionId]: { name: 'Sky Cares Mission 2026', totalPieces: 789, hidden: false }
  };
  const photos = {
    p1: { missions: [missionId], pieces: 500 },
    p2: { missions: [missionId], pieces: 311 }
  };
  const filters = { mission: missionId };
  assert.equal(ctx.getFilteredPiecesDisplayTotal(photos, filters, missions), 789);
  const leaderboard = ctx.topMissionTotals(missions, photos, 20, { useScopedCounts: false });
  const row = leaderboard.find((item) => item.name === 'Sky Cares Mission 2026');
  assert.equal(row?.count, 789);
});

test('category and time-series counts scale to official mission total', () => {
  const ctx = loadMissions();
  const missionId = 'mission-a';
  const missions = { [missionId]: { name: 'Test Mission', totalPieces: 100, hidden: false } };
  const filters = { mission: missionId };
  const photos = {
    p1: { missions: [missionId], categories: [{ brand: 'A', number: 60 }, { label: 'X', number: 60 }] },
    p2: { missions: [missionId], categories: [{ brand: 'B', number: 40 }, { label: 'Y', number: 40 }] }
  };
  const brands = ctx.topCategoryTotalsForDisplay(photos, 'brand', 10, filters, missions);
  assert.equal(brands.reduce((sum, row) => sum + row.count, 0), 100);
  const points = ctx.scaleTimeSeriesPointsToOfficialTotal(
    [{ key: '2026', pieces: 60, photos: 1 }, { key: '2027', pieces: 40, photos: 1 }],
    100
  );
  assert.equal(points.reduce((sum, row) => sum + row.pieces, 0), 100);
});

test('duplicate mission names are disambiguated with official counts', () => {
  const ctx = loadMissions();
  const missions = {
    a: { name: 'The Big Jet2 Clean Up', totalPieces: 6054, hidden: false },
    b: { name: 'The Big Jet2 Clean Up', totalPieces: 5757, hidden: false }
  };
  const options = ctx.buildMissionFilterOptions({}, missions);
  assert.equal(options.length, 2);
  const names = options.map((item) => item.name).join(' | ');
  assert.match(names, /5,?757/);
  assert.match(names, /6,?054/);
});
