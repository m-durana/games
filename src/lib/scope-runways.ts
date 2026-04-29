// Convert a real airport's runway list into radarscope `Runway` objects
// (scope-local nm coords). Used by all three radarscope-powered modes so they
// can render *every* runway at the airport, not just the active one.

import { geoToScope, type RealAirport } from 'radarscope/data';
import type { Runway } from 'radarscope';

const FT_PER_NM = 6076.12;

export function airportRunwaysToScope(airport: RealAirport): Runway[] {
  const center = { lat: airport.lat, lon: airport.lon };
  return airport.runways
    .filter((rw) => !rw.closed)
    .map((rw) => ({
      threshold: geoToScope(center, rw.le),
      heading: rw.le.headingDegT,
      lengthNm: rw.lengthFt / FT_PER_NM,
    }));
}
