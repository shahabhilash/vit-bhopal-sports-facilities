export interface User {
  id: string;
  name: string;
  regNo: string;
  email: string;
}

export type FacilityType = 'court' | 'turf' | 'gym';

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  description: string;
  courts?: number;
  capacity?: number;
  openingHours: string;
  rules: string[];
  equipment: string[];
  userAccessStatus: 'Allowed' | 'Restricted';
}

export type BookingStatus = 'Upcoming' | 'Checked in' | 'Completed' | 'Cancelled';

export interface Booking {
  id: string;
  userId: string;
  facilityId: string;
  courtId?: string; // Optional if gym
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: BookingStatus;
  checkInTime?: string; // ISO string
  checkOutTime?: string; // ISO string
}
