import fs from 'node:fs';

const requiredFullFactFields = ['city', 'runways', 'terminals', 'paxYearlyM', 'hubAlliance', 'lat', 'wikipedia'];
const hubAlliances = new Set(['Star Alliance', 'SkyTeam', 'oneworld', 'Independent']);
const top50Passenger2024 = [
  'ATL', 'DXB', 'DFW', 'HND', 'LHR', 'DEN', 'IST', 'ORD', 'DEL', 'PVG',
  'LAX', 'CAN', 'ICN', 'CDG', 'SIN', 'PEK', 'AMS', 'MAD', 'JFK', 'BKK',
  'FRA', 'SZX', 'CLT', 'LAS', 'MCO', 'KUL', 'MIA', 'BCN', 'TFU', 'BOM',
  'CGK', 'HKG', 'DOH', 'SEA', 'PHX', 'SFO', 'MNL', 'PKX', 'JED', 'FCO',
  'EWR', 'CKG', 'IAH', 'HGH', 'SHA', 'KMG', 'XIY', 'YYZ', 'BOG', 'MEX',
];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const canonical = readJson('src/data/airports-canonical.json');
const photos = readJson('src/data/airport-photos.json');
const aerials = readJson('src/data/airport-aerials.json');
const reviewAirports = readJson('src/data/airport-review-airports.json');
const reviewState = readJson('src/data/airport-review-state.json');
const routes = readJson('src/data/airport-routes.json');

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

const codes = canonical.map((airport) => airport.iata);
const codeSet = new Set(codes);
const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
if (duplicates.length) fail(`duplicate canonical IATA codes: ${duplicates.join(', ')}`);

for (const airport of canonical) {
  if (!/^[A-Z]{3}$/.test(airport.iata ?? '')) fail(`bad canonical IATA: ${airport.iata}`);
  if (!airport.name) fail(`${airport.iata}: missing name`);
  if (!airport.country) fail(`${airport.iata}: missing country`);
}

const fullFactAirports = canonical.filter((airport) => requiredFullFactFields.every((field) => Object.hasOwn(airport, field)));
for (const airport of fullFactAirports) {
  if (typeof airport.city !== 'string' || airport.city.length < 2) fail(`${airport.iata}: bad city`);
  if (!Number.isFinite(airport.runways) || airport.runways < 1 || airport.runways > 8) fail(`${airport.iata}: bad runways ${airport.runways}`);
  if (!Number.isFinite(airport.terminals) || airport.terminals < 1 || airport.terminals > 9) fail(`${airport.iata}: bad terminals ${airport.terminals}`);
  if (!Number.isFinite(airport.paxYearlyM) || airport.paxYearlyM < 0.01 || airport.paxYearlyM > 130) fail(`${airport.iata}: bad paxYearlyM ${airport.paxYearlyM}`);
  if (!hubAlliances.has(airport.hubAlliance)) fail(`${airport.iata}: bad hubAlliance ${airport.hubAlliance}`);
  if (!Number.isFinite(airport.lat) || airport.lat < -90 || airport.lat > 90) fail(`${airport.iata}: bad lat ${airport.lat}`);
  if (typeof airport.wikipedia !== 'string' || airport.wikipedia.length < 3) fail(`${airport.iata}: bad wikipedia title`);
}

for (const code of top50Passenger2024) {
  if (!codeSet.has(code)) fail(`missing 2024 global top-50 passenger airport: ${code}`);
}

for (const code of Object.keys(photos)) {
  if (!/^[A-Z]{3}$/.test(code)) fail(`airport-photos has non-IATA key: ${code}`);
  if (!codeSet.has(code)) fail(`airport-photos key is not canonical: ${code}`);
}

for (const code of Object.keys(aerials)) {
  if (!/^[A-Z]{3}$/.test(code)) fail(`airport-aerials has non-IATA key: ${code}`);
  if (!codeSet.has(code)) fail(`airport-aerials key is not canonical: ${code}`);
}

const reviewed = reviewAirports.filter((airport) => {
  const state = reviewState[airport.iata];
  return Boolean(state?.aerial && state?.approved?.length);
});

for (const airport of reviewed) {
  if (!codeSet.has(airport.iata)) fail(`reviewed airport is not canonical: ${airport.iata}`);
}

for (const [origin, route] of Object.entries(routes)) {
  if (!codeSet.has(origin)) fail(`airport route origin is not canonical: ${origin}`);
  for (const dest of route.topDestinations ?? []) {
    if (!codeSet.has(dest)) fail(`airport route ${origin} destination is not canonical: ${dest}`);
    if (dest === origin) fail(`airport route ${origin} includes itself as destination`);
  }
  if (route.destinationRanked === true && (!Array.isArray(route.topDestinations) || route.topDestinations.length < 3)) {
    fail(`airport route ${origin} marked ranked without at least 3 destinations`);
  }
}

const labelOnlyOrPartial = canonical.filter((airport) => !requiredFullFactFields.every((field) => Object.hasOwn(airport, field)));
if (labelOnlyOrPartial.length) {
  warn(`${labelOnlyOrPartial.length} canonical airports are label-only/partial and are not playable in Airport Wordle/Identify`);
}

console.log(JSON.stringify({
  canonical: canonical.length,
  fullFactAirports: fullFactAirports.length,
  labelOnlyOrPartial: labelOnlyOrPartial.length,
  reviewedWithApprovedImagery: reviewed.length,
  airportPhotoKeys: Object.keys(photos).length,
  airportAerialKeys: Object.keys(aerials).length,
  warnings,
  failures,
}, null, 2));

if (failures.length) process.exit(1);
