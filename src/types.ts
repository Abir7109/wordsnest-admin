export interface DashboardStats {
  users: number;
  activeUsers: number;
  searches: number;
  words: number;
  quizzes: number;
  newUsersToday: number;
  dailyActiveUsers: number;
  totalInstalls: number;
  searchesToday: number;
  wordsToday: number;
  quizzesToday: number;
  averageQuizScore: number;
  uniqueWordsSaved: number;
  topWordType: string;
  engagementRate: number;
  retentionRate: number;
}

export interface TimelineDay {
  date: string;
  label: string;
  users: number;
  activeUsers: number;
  searches: number;
  words: number;
  quizzes: number;
  newUsers: number;
}

export interface TopWord {
  word: string;
  count: number;
  type?: string;
  users?: number;
}

export interface TopSearch {
  word: string;
  count: number;
  users?: number;
}

export interface UserProfile {
  uid: string;
  email?: string;
  username?: string;
  status?: string;
  install_date?: number;
  lastActive?: number;
  app_version?: string;
  fcm_token?: string;
  device_model?: string;
  createdAt?: number;
  wordCount?: number;
  quizCount?: number;
  averageScore?: number;
  streak?: number;
  rankingPoints?: number;
}

export interface SavedWord {
  id: string;
  userId: string;
  word: string;
  type?: string;
  definition?: string;
  phonetic?: string;
  synonyms?: string[];
  antonyms?: string[];
  simpleSentence?: string;
  complexSentence?: string;
  compoundSentence?: string;
  timestamp?: number;
}

export interface SearchEvent {
  id: string;
  user_id?: string;
  word?: string;
  timestamp?: number;
  status?: string;
}

export interface QuizEvent {
  id: string;
  userId: string;
  score?: number;
  total?: number;
  timestamp?: number;
}

export interface AppConfig {
  isAppAlive: boolean;
  underMaintenance: boolean;
  maintenanceTitle: string;
  maintenanceMessage: string;
  maintenanceEstimatedTime: string;
  forceUpdate: boolean;
  softUpdate: boolean;
  currentVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  updateMessage: string;
  dailyQuizLimit: number;
  dailyWordLimit: number;
  enableNotifications: boolean;
  enableLeaderboard: boolean;
  enableBackup: boolean;
  adsEnabled: boolean;
  apiEndpoint?: string;
  featureFlags?: Record<string, boolean>;
}

export interface NotificationItem {
  id?: string;
  title: string;
  message: string;
  target: string;
  sentAt: number;
  success: boolean;
  error?: string;
  readCount?: number;
  deliveredCount?: number;
}

export interface Tab {
  id: string;
  label: string;
  icon: string;
}

export interface WordTypeStat {
  type: string;
  count: number;
  percentage: number;
}

export interface UserStats {
  newToday: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
  active: number;
  inactive: number;
  byVersion: Record<string, number>;
  byStatus: { active: number; inactive: number; banned: number };
}

export interface SearchStats {
  total: number;
  today: number;
  thisWeek: number;
  uniqueWords: number;
  topSearches: TopSearch[];
}

export interface QuizStats {
  total: number;
  today: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  totalParticipants: number;
  scoreDistribution: { range: string; count: number }[];
}

export interface RecentActivity {
  type: 'user_signup' | 'word_saved' | 'quiz_taken' | 'search';
  userId?: string;
  username?: string;
  word?: string;
  score?: number;
  timestamp: number;
}
