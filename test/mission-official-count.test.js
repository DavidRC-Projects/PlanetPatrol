const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadFilterRules() {
  const context = { module: {}, exports: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/photo-helpers.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/filter-rules.js'), 'utf8'), context);
  return context;
}

test('mission official count excludes moderated but unpublished photos', () => {
  const ctx = loadFilterRules();
  const pending = { moderated: null, published: false, pieces: 100 };
  const published = { moderated: '2026-01-01', published: true, pieces: 50 };
  const rejected = { moderated: '2026-01-01', published: false, pieces: 22 };

  assert.equal(ctx.passesMissionOfficialCountFilter(pending), true);
  assert.equal(ctx.passesMissionOfficialCountFilter(published), true);
  assert.equal(ctx.passesMissionOfficialCountFilter(rejected), false);
  assert.equal(
    ctx.shouldApplyMissionOfficialCountFilter('mission-id', { 'mission-id': { totalPieces: 789 } }, 'all', '', '', '', '', '', ''),
    true
  );
  assert.equal(
    ctx.shouldApplyMissionOfficialCountFilter('mission-id', { 'mission-id': { totalPieces: 789 } }, 'moderated', '', '', '', '', '', ''),
    false
  );
});
