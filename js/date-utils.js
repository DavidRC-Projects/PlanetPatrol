/** Returns true if date matches year filter. */
function matchesYear(d, year) {
  if (!year) return true;
  if (!d) return false;
  const y = parseInt(year, 10);
  return !isNaN(y) && d.getFullYear() === y;
}

/** Returns true if date matches month filter. */
function matchesMonth(d, month) {
  if (!month) return true;
  if (!d) return false;
  const m = parseInt(month, 10);
  if (isNaN(m)) return true;
  return d.getMonth() + 1 === m;
}
