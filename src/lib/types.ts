export interface Airline {
  name: string;
  iata: string;
  country: string;
  group: string | null;
  alliance: string | null;
  hub: string;
}

export type Mode =
  | 'group'
  | 'alliance'
  | 'hub'
  | 'logo'
  | 'country'
  | 'reverseGroup'
  | 'tail'
  | 'airportAirline'
  | 'airlineDest'
  | 'airportConn'
  | 'code'
  | 'whereAmI'
  | 'hubOf'
  | 'aircraftWordle'
  | 'aircraftIdentify'
  | 'militaryWordle'
  | 'militaryIdentify'
  | 'airportWordle'
  | 'airportIdentify';

import type { AttributeFeedback } from './aircraft';
import type { AttributeFeedback as MilitaryAttributeFeedback } from './military-aircraft';
import type { AttributeFeedback as AirportAttributeFeedback } from './airports-game';

export interface AircraftWordleResult {
  type: 'wordle';
  aircraftId: string;
  aircraftName: string;
  guesses: { id: string; name: string; feedback: AttributeFeedback[] }[];
  solved: boolean;
  earned: number;
}

export interface MilitaryWordleResult {
  type: 'mil-wordle';
  aircraftId: string;
  aircraftName: string;
  guesses: { id: string; name: string; feedback: MilitaryAttributeFeedback[] }[];
  solved: boolean;
  earned: number;
}

export interface MilitaryIdentifyResult {
  type: 'mil-identify';
  aircraftId: string;
  aircraftName: string;
  picked: string | null;
  hintStage: number;
  correct: boolean;
  earned: number;
}

export type MilitaryRoundResult = MilitaryWordleResult | MilitaryIdentifyResult;

export interface AircraftIdentifyResult {
  type: 'identify';
  aircraftId: string;
  aircraftName: string;
  picked: string | null;
  hintStage: number;
  correct: boolean;
  earned: number;
}

export type AircraftRoundResult = AircraftWordleResult | AircraftIdentifyResult;

export interface AirportWordleResult {
  type: 'apt-wordle';
  airportIata: string;
  airportName: string;
  guesses: { iata: string; name: string; feedback: AirportAttributeFeedback[] }[];
  solved: boolean;
  earned: number;
}

export interface AirportIdentifyResult {
  type: 'apt-identify';
  airportIata: string;
  airportName: string;
  picked: string | null;
  hintStage: number;
  correct: boolean;
  earned: number;
}

export type AirportRoundResult = AirportWordleResult | AirportIdentifyResult;
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AirlineMeta {
  icao?: string;
  callsign?: string;
  founded?: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
  keyboardHints: boolean;
  darkMode: boolean;
}

export interface Question {
  mode: Mode;
  airline: Airline;
  options: string[];
  answer: string;
  answers?: string[];
  // For airport-subject modes (airportAirline, airportConn): the IATA of the airport
  // the question is about. `airline` is then a contextual associated airline (often
  // the hub carrier) used only for stats/explanations, not as the prompt subject.
  airport?: string;
  // For 'code' mode: the displayed code/callsign (e.g. "LH", "DLH", "SPEEDBIRD")
  // and the kind, used to render and explain the prompt.
  prompt?: string;
  promptKind?: 'iata' | 'icao' | 'callsign' | 'airport' | 'destinations';
  // For whereAmI mode: list of top destination IATAs to display.
  destinations?: string[];
}

export interface RoundResult {
  question: Question;
  picked: string;
  correct: boolean;
}

export interface HistoryEntry {
  mode: Mode;
  difficulty: Difficulty;
  score: number;
  total: number;
  ts: number;
  results?: RoundResult[];
  aircraftResults?: AircraftRoundResult[];
  militaryResults?: MilitaryRoundResult[];
  airportResults?: AirportRoundResult[];
}
