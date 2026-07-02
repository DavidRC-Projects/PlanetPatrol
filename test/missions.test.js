const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadMissions() {
  const missionsSrc = fs.readFileSync(path.join(__dirname, '../js/missions.js'), 'utf8');
  const photoHelpersSrc = fs.readFileSync(path.join(__dirname, '../js/photo-helpers.js'), 'utf8');
  const context = { module: {}, exports: {} };
  vm.createContext(context);
  vm.runInContext(photoHelpersSrc, context);
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
