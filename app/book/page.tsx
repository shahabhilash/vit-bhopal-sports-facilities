"use client"
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addBooking } from "@/lib/bookings";
import { demoUser } from "@/data/user";
import { Calendar as CalendarIcon, CheckCircle2, Clock } from "lucide-react";
import { Facility } from "@/types";

const generateTimeSlots = (facility: Facility) => {
  const slots = [];
  for (let i = 6; i <= 21; i++) {
    slots.push(`${i.toString().padStart(2, '0')}:00`);
  }
  return slots;
};

function BookingForm() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedSport, setSelectedSport] = useState<Facility | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [bookingId, setBookingId] = useState("");

  // Read URL query parameters to auto-select the sport if linked from homepage
  useEffect(() => {
    const sportId = searchParams.get("sport");
    if (sportId) {
      const sport = sportsFacilities.find((s) => s.id === sportId);
      if (sport) {
        setSelectedSport(sport);
        setStep(2); // Skip straight to Date selection
      }
    }
  }, [searchParams]);

  const handleSportSelect = (sport: Facility) => {
    setSelectedSport(sport);
    setStep(2);
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setStep(3);
  };

  const handleConfirm = () => {
    if (!selectedSport || !selectedDate || !selectedSlot) return;
    
    const newBooking = addBooking({
      userId: demoUser.id,
      facilityId: selectedSport.id,
      courtId: selectedSport.type === 'gym' ? undefined : selectedCourt,
      date: selectedDate,
      startTime: selectedSlot,
      endTime: `${parseInt(selectedSlot.split(':')[0]) + 1}:00`,
    });
    
    setBookingId(newBooking.id);
    setIsSuccess(true);
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-6">
        <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
        <h1 className="text-3xl font-bold">Booking Confirmed!</h1>
        <p className="text-muted-foreground">Your booking ID is <span className="font-mono font-bold text-foreground">{bookingId}</span></p>
        <Card className="max-w-xs mx-auto overflow-hidden">
          <CardContent className="p-8 bg-white flex items-center justify-center">
            {/* Fake QR code */}
            <div className="w-48 h-48 bg-black/5 rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">QR CODE PLACEHOLDER</span>
            </div>
          </CardContent>
        </Card>
        <Button onClick={() => window.location.href = '/my-bookings'} size="lg">
          View My Bookings
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Book a Session</h1>
      
      {/* Step Indicator */}
      <div className="flex flex-wrap items-center gap-2 mb-8 text-sm font-medium">
        <span className={`px-3 py-1 rounded-full ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>1. Sport</span>
        <span className="text-muted-foreground hidden sm:inline">&rarr;</span>
        <span className={`px-3 py-1 rounded-full ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>2. Date</span>
        <span className="text-muted-foreground hidden sm:inline">&rarr;</span>
        <span className={`px-3 py-1 rounded-full ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>3. Time</span>
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sportsFacilities.map(sport => (
            <Card key={sport.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleSportSelect(sport)}>
              <CardHeader>
                <CardTitle>{sport.name}</CardTitle>
                <CardDescription>{sport.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <h2 className="text-xl font-semibold">Select Date for {selectedSport?.name}</h2>
          </div>
          <div className="max-w-sm">
            <div className="bg-card border rounded-lg p-6 shadow-sm">
              <label htmlFor="booking-date" className="block font-medium mb-4 text-foreground">
                Pick a Date from Calendar
              </label>
              <input 
                id="booking-date"
                type="date" 
                className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground bg-background cursor-pointer"
                min={new Date().toISOString().split('T')[0]}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) handleDateSelect(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground mt-3">
                Selecting a date will automatically proceed to time selection.
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 3 && selectedSport && (
        <div className="space-y-8">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <h2 className="text-xl font-semibold">Select Time on {selectedDate}</h2>
          </div>
          
          {selectedSport.type !== 'gym' && (
            <div className="mb-6">
              <h3 className="font-medium mb-3">Select Court/Area</h3>
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: selectedSport.courts || 1 }).map((_, i) => (
                  <Button 
                    key={i} 
                    variant={selectedCourt === `Court ${i + 1}` ? "default" : "outline"}
                    onClick={() => setSelectedCourt(`Court ${i + 1}`)}
                  >
                    Court {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-medium mb-3">Available Slots (1 hour)</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {generateTimeSlots(selectedSport).map(slot => (
                <Button
                  key={slot}
                  variant={selectedSlot === slot ? "default" : "outline"}
                  className="w-full"
                  onClick={() => setSelectedSlot(slot)}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {slot}
                </Button>
              ))}
            </div>
          </div>

          <div className="bg-muted/50 p-6 rounded-xl border mt-8">
            <h3 className="font-semibold text-lg mb-4">Booking Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-sm text-muted-foreground">Sport</div>
                <div className="font-medium">{selectedSport.name} {selectedCourt ? `- ${selectedCourt}` : ''}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Date & Time</div>
                <div className="font-medium">{selectedDate} @ {selectedSlot}</div>
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={handleConfirm} disabled={!selectedSlot || (selectedSport.type !== 'gym' && !selectedCourt)}>
              Confirm Booking
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">
        Loading booking system...
      </div>
    }>
      <BookingForm />
    </Suspense>
  );
}
