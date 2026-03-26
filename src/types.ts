import { Timestamp } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'admin_rh' | 'superviseur' | 'worker' | 'observateur';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  department?: string;
  photoURL?: string;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface CheckInRecord {
  id?: string;
  userId: string;
  checkedInBy: string;
  type: 'check-in' | 'check-out';
  status?: 'pending' | 'confirmed' | 'rejected';
  timestamp: Timestamp;
  sessionId?: string;
  durationMinutes?: number;
  eventId?: string;
  note?: string;
  correctedBy?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface Session {
  id: string;
  userId: string;
  checkIn: Timestamp;
  checkOut?: Timestamp;
  durationMinutes?: number;
  status: 'active' | 'completed';
}
