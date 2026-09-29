"use client"
import { useEffect, useState } from "react";
import { getBookings, updateBookingStatus } from "@/lib/bookings";
import { Booking } from "@/types";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Past' | 'Cancelled'>('Upcoming');

  useEffect(() => {
    setBookings(getBookings());
  }, []);

  const handleCancel = (id: string) => {
    if (confirm("Are you sure you want to cancel this booking?")) {
      updateBookingStatus(id, 'Cancelled');
      setBookings(getBookings());
    }
  };

  const isPast = (b: Booking) => b.status === 'Completed' || new Date(b.date) < new Date(new Date().toISOString().split('T')[0]);
  
  const filteredBookings = bookings.filter(b => {
    if (activeTab === 'Cancelled') return b.status === 'Cancelled';
    if (activeTab === 'Past') return isPast(b) && b.status !== 'Cancelled';
    return !isPast(b) && b.status !== 'Cancelled' && b.status !== 'Completed';
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">My Bookings</h1>
      
      <div className="flex space-x-2 border-b mb-6 pb-px">
        {['Upcoming', 'Past', 'Cancelled'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 font-medium text-sm -mb-px border-b-2 transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {filteredBookings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No {activeTab.toLowerCase()} bookings found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(booking => {
            const facility = sportsFacilities.find(f => f.id === booking.facilityId);
            return (
              <Card key={booking.id} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg">{facility?.name} {booking.courtId ? `- ${booking.courtId}` : ''}</h3>
                  <div className="text-sm text-muted-foreground">
                    {new Date(booking.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  <div className="text-sm font-medium mt-1">
                    {booking.startTime} - {booking.endTime}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    booking.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                    booking.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {booking.status}
                  </span>
                  {activeTab === 'Upcoming' && (
                    <Button variant="destructive" size="sm" onClick={() => handleCancel(booking.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
