import { Booking } from "@/types";
import { initialMockBookings } from "@/data/mock-bookings";

const STORAGE_KEY = "vitb_sports_bookings";

export function getBookings(): Booking[] {
  if (typeof window === "undefined") return initialMockBookings;
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMockBookings));
    return initialMockBookings;
  }
  return JSON.parse(stored);
}

export function saveBookings(bookings: Booking[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

export function addBooking(booking: Omit<Booking, "id" | "status">): Booking {
  const bookings = getBookings();
  const newBooking: Booking = {
    ...booking,
    id: `b_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    status: "Upcoming"
  };
  saveBookings([...bookings, newBooking]);
  return newBooking;
}

export function updateBookingStatus(id: string, status: Booking["status"]): void {
  const bookings = getBookings();
  const updated = bookings.map(b => b.id === id ? { ...b, status } : b);
  saveBookings(updated);
}

export function checkIn(id: string): void {
  const bookings = getBookings();
  const updated = bookings.map(b => b.id === id ? { 
    ...b, 
    status: "Checked in" as Booking["status"], 
    checkInTime: new Date().toISOString() 
  } : b);
  saveBookings(updated);
}

export function checkOut(id: string): void {
  const bookings = getBookings();
  const updated = bookings.map(b => b.id === id ? { 
    ...b, 
    status: "Completed" as Booking["status"], 
    checkOutTime: new Date().toISOString() 
  } : b);
  saveBookings(updated);
}
