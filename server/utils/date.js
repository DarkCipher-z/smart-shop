// server/utils/date.js
// All timestamps and date calculations strictly use Asia/Kolkata timezone (IST, UTC+05:30)

const TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current timestamp in IST as ISO-8601 string with +05:30 offset
 * Example: "2026-10-15T14:30:00+05:30"
 */
function getISTTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  
  // Format parts in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+05:30`;
}

/**
 * Returns current date in IST as YYYY-MM-DD
 * Example: "2026-10-15"
 */
function getISTDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Returns current time in IST as HH:mm
 * Example: "14:30"
 */
function getISTTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatter.format(d);
}

/**
 * Returns a compact YYYYMMDD date string for invoice numbering
 * Example: "20261015"
 */
function getISTCompactDate(date = new Date()) {
  return getISTDate(date).replace(/-/g, '');
}

/**
 * Formats a number to Indian Rupee representation (e.g. ₹ 1,23,456.75)
 */
function formatINR(amount) {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val);
}

module.exports = {
  TIMEZONE,
  getISTTimestamp,
  getISTDate,
  getISTTime,
  getISTCompactDate,
  formatINR
};
