/**
 * GPS & Geolocation helper utility for high-accuracy tracking and error recovery.
 */

export const BANNED_GPS_LAT = -25.3273;
export const BANNED_GPS_LNG = 28.9422; // Gemsbokspruit fake location
export const EXACT_HOUSE_ACCURACY_THRESHOLD = 25; // meters: 100% free precise house threshold

export function isBannedLocation(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  return Math.abs(lat - BANNED_GPS_LAT) < 0.005 && Math.abs(lng - BANNED_GPS_LNG) < 0.005;
}

export function isExactAccuracy(accuracy: number | null | undefined): boolean {
  return typeof accuracy === 'number' && accuracy < EXACT_HOUSE_ACCURACY_THRESHOLD;
}

export function formatGeolocationError(err: any): string {
  if (!err) return 'GPS signal unavailable. Please ensure location is enabled.';
  const code = err.code;
  if (code === 1) {
    return 'Location permission denied. Please allow location in browser settings or open in a new tab.';
  }
  if (code === 2) {
    return 'Position unavailable. Please step outside under an open sky for satellite lock.';
  }
  if (code === 3) {
    return 'GPS request timed out. Please step outside or drag the pin on the map.';
  }
  return err.message || 'GPS signal unavailable.';
}
