# PlanetPatrol

Dashboard for Plastic Patrol litter data.

## Data loading

The dashboard loads Firestore data through the local server endpoint (`/api/photos`).
This ensures unmoderated records are included.

The frontend expects API responses in this format:

```json
{
  "photos": {
    "<docId>": { "...": "..." }
  }
}
```

If the API returns any other shape, the app shows an error message.

## Structure

```
js/
├── config.js          # URLs and DOM_IDS
├── dom.js             # getElement, getElements, hasRequiredElements
├── photo-helpers.js   # getPieces, isModerated, getPhotoDate
├── date-utils.js      # matchesYear, matchesMonth
├── stats.js           # sumTotalPieces, countModerated, countUnmoderated
├── filter-rules.js      # passesStatusFilter, passesPiecesFilter, passesDateFilter
├── api.js             # fetchData and API payload validation
├── render.js          # renderCards
├── filters.js         # filterPhotos, getFilterValues, populateYearOptions, applyFilters
└── app.js             # init, showLoading, showDashboard, showError, bindFilterButton
```

## Run

```bash
npm install
npm start
```

Then open `http://localhost:8787`.