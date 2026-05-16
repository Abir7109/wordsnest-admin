export enum UserType {
  REGISTERED = 'Registered',
  GUEST = 'Guest',
}

export interface User {
  id: string;
  type: UserType;
  identity: string;
  words: number;
  lastActive: string;
  joinDate: string;
}

export interface RequestLog {
  id: string;
  word: string;
  userId: string;
  guestId: string;
  timestamp: string;
  time: string;
  status: 'Success' | 'Error';
}

export interface Meaning {
  definition: string;
  example: string;
}

export interface PartOfSpeech {
  pos: string;
  definition: string;
}

export interface Sentences {
  academic: string[];
  colloquial: string[];
}

export interface AnalyzeResponse {
  word: string;
  meaning: Meaning;
  partsOfSpeech: PartOfSpeech[];
  synonyms: string[];
  antonyms: string[];
  sentences: Sentences;
}

export interface AIConfiguration {
  systemPrompt: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
}
