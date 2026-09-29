"use client"
import { useEffect, useState } from "react";
import { getBookings, checkIn, checkOut } from "@/lib/bookings";
import { Booking } from "@/types";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CheckInPage() {
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const fetchBookings = () => {
      const all = getBookings();
      const today = new Date().toISOString().split('T')[0];
      setTodayBookings(all.filter(b => b.date === today && b.status !== 'Cancelled'));
    };
    fetchBookings();
    // Refresh interval could be added here
  }, []);

  const handleCheckIn = (id: string) => {
    checkIn(id);
    setTodayBookings(getBookings().filter(b => b.date === new Date().toISOString().split('T')[0] && b.status !== 'Cancelled'));
  };

  const handleCheckOut = (id: string) => {
    checkOut(id);
    setTodayBookings(getBookings().filter(b => b.date === new Date().toISOString().split('T')[0] && b.status !== 'Cancelled'));
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Today's Sessions</h1>
      
      {todayBookings.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">You have no bookings for today.</p>
            <Button asChild className="mt-4" variant="outline">
              <a href="/book">Book a session</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {todayBookings.map(booking => {
            const facility = sportsFacilities.find(f => f.id === booking.facilityId);
            return (
              <Card key={booking.id} className="overflow-hidden">
                <div className={`h-2 w-full ${booking.status === 'Completed' ? 'bg-muted' : booking.status === 'Checked in' ? 'bg-green-500' : 'bg-primary'}`} />
                <div className="p-6 md:flex md:items-center md:justify-between">
                  <div className="mb-4 md:mb-0">
                    <h3 className="text-xl font-bold">{facility?.name} {booking.courtId ? `- ${booking.courtId}` : ''}</h3>
                    <p className="text-muted-foreground">{booking.startTime} - {booking.endTime}</p>
                    <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">
                      {booking.status}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {booking.status === 'Upcoming' && (
                      <Button onClick={() => handleCheckIn(booking.id)} size="lg" className="w-full md:w-auto">
                        Check In
                      </Button>
                    )}
                    {booking.status === 'Checked in' && (
                      <Button onClick={() => handleCheckOut(booking.id)} variant="outline" size="lg" className="w-full md:w-auto border-green-500 text-green-600 hover:bg-green-50">
                        Check Out
                      </Button>
                    )}
                    {booking.status === 'Completed' && (
                      <div className="text-sm text-muted-foreground">
                        Session completed
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
