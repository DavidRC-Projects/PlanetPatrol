/**
 * DOM helpers. Centralizes element lookup with null safety.
 */

/** Returns element by id, or null if not found. */
function getElement(id) {
  return document.getElementById(id);
}

/** Returns object of elements by ids. Missing elements are null. */
function getElements(ids) {
  const out = {};
  for (const id of ids) {
    out[id] = document.getElementById(id);
  }
  return out;
}

/** Returns true if all required elements exist. */
function hasRequiredElements(ids) {
  return ids.every((id) => getElement(id) != null);
}
