// Convert a real airport's runway list into radarscope `Runway` objects
// (scope-local nm coords). Used by all three radarscope-powered modes.

import { geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Runway } from 'radarscope';

const FT_PER_NM = 6076.12;

/** All runways at the airport, with the matching active runway flagged showFinal=true. */
export function airportRunwaysToScope(airport: RealAirport, activeRunway?: RealRunway): Runway[] {
  const center = { lat: airport.lat, lon: airport.lon };
  return airport.runways
    .filter((rw) => !rw.closed)
    .map((rw) => {
      const isActive = activeRunway != null && rw === activeRunway;
      return {
        // For the active runway, use the .he end as threshold (the landing
        // direction we treat as "current"). For inactive ones, .le is fine —
        // the strip renders the same regardless of which end is the threshold.
        threshold: geoToScope(center, isActive ? rw.he : rw.le),
        heading: isActive ? rw.he.headingDegT : rw.le.headingDegT,
        lengthNm: rw.lengthFt / FT_PER_NM,
        showFinal: isActive,
      };
    });
}
