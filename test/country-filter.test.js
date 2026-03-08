/**
 * Unit tests for country filter logic.
 * Run with: node --test test/country-filter.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  coordinateKey,
  getCountryGroupKey,
  getCountryInfoForPhoto,
  buildCountryCounts,
  filterPhotosByCountry,
  filterRecordsByCountry,
  getPhotoCoordinates,
  UNKNOWN_COUNTRY_LABEL
} = require('../lib/country-filter.js');

describe('coordinateKey', () => {
  it('formats coordinates with no space after comma (dictionary format)', () => {
    assert.strictEqual(coordinateKey(51.46, -0.31), '51.46,-0.31');
    assert.strictEqual(coordinateKey(0, 0), '0.00,0.00');
  });
  it('rounds to 2 decimal places', () => {
    assert.strictEqual(coordinateKey(51.458, -0.307), '51.46,-0.31');
  });
});

describe('getCountryGroupKey', () => {
  it('uses cc: prefix for valid 2-letter country code', () => {
    assert.strictEqual(getCountryGroupKey('United Kingdom', 'GB'), 'cc:GB');
  });
  it('uses nm: prefix when no code or invalid code', () => {
    assert.strictEqual(getCountryGroupKey('United Kingdom', ''), 'nm:united kingdom');
  });
});

describe('getPhotoCoordinates', () => {
  it('extracts latitude/longitude from location object', () => {
    const photo = { location: { latitude: 51.46, longitude: -0.31 } };
    assert.deepStrictEqual(getPhotoCoordinates(photo), { lat: 51.46, lon: -0.31 });
  });
  it('supports Firestore _latitude/_longitude format', () => {
    const photo = { location: { _latitude: 51.46, _longitude: -0.31 } };
    assert.deepStrictEqual(getPhotoCoordinates(photo), { lat: 51.46, lon: -0.31 });
  });
  it('returns null for missing or invalid coords', () => {
    assert.strictEqual(getPhotoCoordinates({}), null);
    assert.strictEqual(getPhotoCoordinates({ location: {} }), null);
    assert.strictEqual(getPhotoCoordinates({ location: { latitude: 0, longitude: 0 } }), null);
  });
});

describe('getCountryInfoForPhoto', () => {
  it('looks up country from dictionary using coordinateKey format', () => {
    const photo = { id: '1', location: { latitude: 51.46, longitude: -0.31 } };
    const dictionary = {
      '51.46,-0.31': { country: 'United Kingdom', countryCode: 'GB', constituency: 'London' }
    };
    const info = getCountryInfoForPhoto(photo, dictionary);
    assert.strictEqual(info.country, 'United Kingdom');
    assert.strictEqual(info.countryKey, 'cc:GB');
  });
  it('returns Unknown country when coords not in dictionary', () => {
    const photo = { location: { latitude: 48.86, longitude: 2.35 } };
    const dictionary = { '51.46,-0.31': { country: 'United Kingdom', countryCode: 'GB' } };
    const info = getCountryInfoForPhoto(photo, dictionary);
    assert.strictEqual(info.country, UNKNOWN_COUNTRY_LABEL);
  });
  it('returns Unknown when photo has no coords', () => {
    const info = getCountryInfoForPhoto({}, {});
    assert.strictEqual(info.country, UNKNOWN_COUNTRY_LABEL);
  });
});

describe('buildCountryCounts', () => {
  it('returns empty array for no photos', () => {
    assert.deepStrictEqual(buildCountryCounts({}, {}), []);
  });
  it('aggregates photos by country from dictionary', () => {
    const photos = {
      a: { location: { latitude: 51.46, longitude: -0.31 } },
      b: { location: { latitude: 51.46, longitude: -0.31 } },
      c: { location: { latitude: 48.86, longitude: 2.35 } }
    };
    const dictionary = {
      '51.46,-0.31': { country: 'United Kingdom', countryCode: 'GB' },
      '48.86,2.35': { country: 'France', countryCode: 'FR' }
    };
    const counts = buildCountryCounts(photos, dictionary);
    assert.strictEqual(counts.length, 2);
    const uk = counts.find((c) => c.country === 'United Kingdom');
    const fr = counts.find((c) => c.country === 'France');
    assert.ok(uk, 'UK should be in counts');
    assert.ok(fr, 'France should be in counts');
    assert.strictEqual(uk.count, 2);
    assert.strictEqual(fr.count, 1);
  });
  it('excludes photos with Unknown country', () => {
    const photos = {
      a: { location: { latitude: 99, longitude: 99 } }
    };
    const dictionary = {};
    const counts = buildCountryCounts(photos, dictionary);
    assert.deepStrictEqual(counts, []);
  });
});

describe('filterPhotosByCountry', () => {
  it('returns all photos when no country selected', () => {
    const photos = { a: { id: 'a' }, b: { id: 'b' } };
    assert.strictEqual(Object.keys(filterPhotosByCountry(photos, {}, '')).length, 2);
    assert.strictEqual(Object.keys(filterPhotosByCountry(photos, {}, null)).length, 2);
  });
  it('filters to matching country', () => {
    const photos = {
      a: { location: { latitude: 51.46, longitude: -0.31 } },
      b: { location: { latitude: 48.86, longitude: 2.35 } }
    };
    const dictionary = {
      '51.46,-0.31': { country: 'United Kingdom', countryCode: 'GB' },
      '48.86,2.35': { country: 'France', countryCode: 'FR' }
    };
    const filtered = filterPhotosByCountry(photos, dictionary, 'cc:GB');
    assert.strictEqual(Object.keys(filtered).length, 1);
    assert.strictEqual(filtered.a.location.latitude, 51.46);
  });
});

describe('filterRecordsByCountry', () => {
  it('returns all records when no country selected', () => {
    const records = { a: { id: 'a' } };
    assert.deepStrictEqual(filterRecordsByCountry(records, {}, ''), records);
  });
  it('returns empty when records is null/undefined', () => {
    assert.deepStrictEqual(filterRecordsByCountry(null, {}, 'cc:GB'), {});
  });
  it('filters water test records by country', () => {
    const records = {
      r1: { location: { latitude: 51.46, longitude: -0.31 } },
      r2: { location: { latitude: 48.86, longitude: 2.35 } }
    };
    const dictionary = {
      '51.46,-0.31': { country: 'United Kingdom', countryCode: 'GB' },
      '48.86,2.35': { country: 'France', countryCode: 'FR' }
    };
    const filtered = filterRecordsByCountry(records, dictionary, 'cc:FR');
    assert.strictEqual(Object.keys(filtered).length, 1);
    assert.strictEqual(filtered.r2.location.latitude, 48.86);
  });
});
