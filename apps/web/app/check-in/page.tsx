"use client"
import { useEffect, useState } from "react";
import Link from "next/link";
import { getBookings, checkIn, checkOut } from "@/lib/bookings";
import { Booking } from "@/types";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CheckInPage() {
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  
  // Checkout Modal State
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [raiseTicket, setRaiseTicket] = useState(false);
  const [photoAttached, setPhotoAttached] = useState(false);

  useEffect(() => {
    const fetchBookings = () => {
      const all = getBookings();
      const today = new Date().toISOString().split('T')[0];
      setTodayBookings(all.filter(b => b.date === today && b.status !== 'Cancelled'));
    };
    fetchBookings();
  }, []);

  const handleCheckIn = (id: string) => {
    checkIn(id);
    setTodayBookings(getBookings().filter(b => b.date === new Date().toISOString().split('T')[0] && b.status !== 'Cancelled'));
  };

  const submitCheckout = () => {
    if (checkoutBookingId) {
      checkOut(checkoutBookingId);
      setTodayBookings(getBookings().filter(b => b.date === new Date().toISOString().split('T')[0] && b.status !== 'Cancelled'));
      
      // Reset state (In a real app with DB, we would save the feedback/ticket here)
      setCheckoutBookingId(null);
      setFeedback("");
      setRaiseTicket(false);
      setPhotoAttached(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl relative">
      <h1 className="text-3xl font-bold mb-8">Today's Sessions</h1>
      
      {todayBookings.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">You have no bookings for today.</p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/#facilities">Book a session</Link>
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
                      <Button onClick={() => setCheckoutBookingId(booking.id)} variant="outline" size="lg" className="w-full md:w-auto border-green-500 text-green-600 hover:bg-green-50">
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

      {/* Checkout Feedback Modal */}
      {checkoutBookingId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader>
              <CardTitle>Session Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground">How was your session?</label>
                <textarea 
                  className="w-full border rounded-md p-3 mt-2 min-h-[100px] text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" 
                  placeholder="Tell us about your experience..."
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                />
              </div>
              
              <div className="flex items-center space-x-3 bg-secondary/30 p-3 rounded-md">
                <input 
                  type="checkbox" 
                  id="ticket" 
                  checked={raiseTicket}
                  onChange={(e) => setRaiseTicket(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="ticket" className="text-sm font-medium cursor-pointer select-none">
                  Report broken equipment or facility issue
                </label>
              </div>

              {raiseTicket && (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-secondary/10 transition-all">
                  <input 
                    type="file" 
                    id="photo" 
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // SECURITY: Validate file size (max 5MB) to prevent Denial of Service via huge uploads
                        if (file.size > 5 * 1024 * 1024) {
                          alert("File is too large. Maximum allowed size is 5MB.");
                          e.target.value = '';
                          setPhotoAttached(false);
                          return;
                        }
                        // SECURITY: Strictly validate MIME type to prevent malicious non-image files
                        if (!file.type.startsWith('image/')) {
                          alert("Security Error: Only image files are allowed.");
                          e.target.value = '';
                          setPhotoAttached(false);
                          return;
                        }
                        setPhotoAttached(true);
                      } else {
                        setPhotoAttached(false);
                      }
                    }}
                  />
                  <label htmlFor="photo" className="cursor-pointer flex flex-col items-center">
                    {photoAttached ? (
                      <span className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                        ✓ Photo successfully attached
                      </span>
                    ) : (
                      <>
                        <span className="text-sm text-primary font-bold">Click here to attach a photo</span>
                        <span className="text-xs text-red-500 font-medium mt-2">
                          * Photo evidence is compulsory to raise a ticket
                        </span>
                      </>
                    )}
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="ghost" onClick={() => {
                  setCheckoutBookingId(null);
                  setRaiseTicket(false);
                  setPhotoAttached(false);
                  setFeedback("");
                }}>
                  Cancel
                </Button>
                <Button 
                  disabled={raiseTicket && !photoAttached}
                  onClick={submitCheckout}
                >
                  Submit & Check Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
