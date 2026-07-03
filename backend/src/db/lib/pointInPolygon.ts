/**
 * Ray-casting point-in-polygon test.
 * Boundary format: [lat, lng][] (this codebase's convention throughout —
 * NOT GeoJSON [lng, lat] order).
 */
export function pointInPolygon(lat: number, lng: number, boundary: number[][]): boolean {
  let inside = false;
  const n = boundary.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = boundary[i][0], yi = boundary[i][1];
    const xj = boundary[j][0], yj = boundary[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
