const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** @param {number} n */
const pad = (n) => String(n).padStart(2, "0");

/** Time as "HH:MM". */
/** @param {Date} d */
export function formatHM(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Three-letter month, e.g. "Jul". */
/** @param {Date} d */
export function formatMonth(d) {
  return MONTHS[d.getMonth()];
}

/** Three-letter weekday, e.g. "Sat". */
/** @param {Date} d */
export function formatWeekday(d) {
  return DAYS[d.getDay()];
}

/** Day of the month, e.g. "8". */
/** @param {Date} d */
export function formatDay(d) {
  return String(d.getDate());
}
