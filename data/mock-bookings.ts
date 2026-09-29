import { Booking } from "../types";
import { demoUser } from "./user";

// Seeded mock data. We'll use a date relative to today in the UI layer if needed, 
// but for static mock we'll use a fixed recent date or let the app generate some on first load.
export const initialMockBookings: Booking[] = [
  {
    id: "b_mock_1",
    userId: demoUser.id,
    facilityId: "f_pickleball",
    courtId: "Court 1",
    date: new Date().toISOString().split('T')[0], // Today
    startTime: "07:00",
    endTime: "08:00",
    status: "Upcoming"
  },
  {
    id: "b_mock_2",
    userId: demoUser.id,
    facilityId: "f_gym",
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
    startTime: "18:00",
    endTime: "19:00",
    status: "Completed",
    checkInTime: new Date(Date.now() - 86400000).setHours(17, 55, 0, 0).toString(),
    checkOutTime: new Date(Date.now() - 86400000).setHours(19, 5, 0, 0).toString()
  }
];
