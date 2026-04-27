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
  | 'aircraftWordle'
  | 'aircraftIdentify';

import type { AttributeFeedback } from './aircraft';

export interface AircraftWordleResult {
  type: 'wordle';
  aircraftId: string;
  aircraftName: string;
  guesses: { id: string; name: string; feedback: AttributeFeedback[] }[];
  solved: boolean;
  earned: number;
}

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
}
