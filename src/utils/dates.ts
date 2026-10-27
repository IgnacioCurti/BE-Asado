// Date convention: every date in this app is Argentina local time (UTC-3, no
// DST) stored as if it were UTC. An event at 21:00 in Buenos Aires is saved
// as 21:00Z, and the frontend shows the stored value without converting it.
// Anything comparing against "now" must use nowArgentina(), and anything
// building a wall-clock time must use the UTC setters (setUTCHours, ...), so
// the result doesn't depend on the server's time zone.

const ARGENTINA_UTC_OFFSET_MS: number = -3 * 60 * 60 * 1000;

export function nowArgentina(): Date {
  return new Date(Date.now() + ARGENTINA_UTC_OFFSET_MS);
}
