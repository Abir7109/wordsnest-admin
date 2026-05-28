export interface DashboardStats {
  users: number;
  activeUsers: number;
  searches: number;
  words: number;
  quizzes: number;
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
}

export interface SavedWord {
  id: string;
  userId: string;
  word: string;
  type?: string;
  definition?: string;
  phonetic?: string;
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
}

export interface NotificationItem {
  title: string;
  message: string;
  target: string;
  sentAt: number;
  success: boolean;
  error?: string;
}

export interface Tab {
  id: string;
  label: string;
  icon: string;
}
