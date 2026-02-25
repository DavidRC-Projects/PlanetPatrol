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

/** Returns true if date matches day-of-month filter. */
function matchesDay(d, day) {
  if (!day) return true;
  if (!d) return false;
  const parsed = parseInt(day, 10);
  if (isNaN(parsed)) return true;
  return d.getDate() === parsed;
}
