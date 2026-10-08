"use client"
import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const photoGalleries = {
  gym: [
    "/images/gym-1.PNG", "/images/gym-2.JPG", "/images/gym-3.JPG", "/images/gym-4.JPG", 
    "/images/gym-5.jpg", "/images/gym-6.jpg", "/images/gym-7.jpg", "/images/gym-8.jpg"
  ],
  tennis: [
    "/images/tennis-1.JPG", "/images/tennis-2.JPG", "/images/tennis-3.JPG", "/images/tennis-4.JPG"
  ],
  pickleball: [
    "/images/pickleball-1.jpg", "/images/pickleball-2.jpg", "/images/pickleball-3.jpg", "/images/pickleball-4.jpg"
  ]
};

export default function AccessPage() {
  const [activeGallery, setActiveGallery] = useState<"gym" | "tennis" | "pickleball">("gym");
  
  const gyms = ["BH-1 Gym", "BH-2 Gym", "Girls Hostel Gym"];
  const recRooms = [
    "Block 1 Recreation Room", "Block 2 Recreation Room", 
    "Block 3 Recreation Room", "Block 4 Recreation Room",
    "Block 5 Recreation Room", "Block 6 Recreation Room",
    "Block 7 Recreation Room", "Block 8 Recreation Room"
  ];

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <div className="mb-6">
        <div className="text-[10px] font-bold tracking-widest text-primary uppercase mb-2">
          UNIFIED FACILITIES
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-2">
          Facility access
        </h1>
        <p className="text-muted-foreground">
          Explore campus facilities, view live occupancy, and discover the exact rules and equipment available.
        </p>
      </div>
      
      <div className="flex overflow-x-auto gap-2 pb-2 mb-10 no-scrollbar whitespace-nowrap border-b border-border">
        <button className="flex-shrink-0 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-t-md shadow-sm">
          Facilities & Gallery
        </button>
        <button className="flex-shrink-0 px-4 py-2 text-muted-foreground hover:bg-secondary/50 text-sm font-medium rounded-t-md transition-colors">
          My sessions
        </button>
        <button className="flex-shrink-0 px-4 py-2 text-muted-foreground hover:bg-secondary/50 text-sm font-medium rounded-t-md transition-colors">
          Player groups
        </button>
        <button className="flex-shrink-0 px-4 py-2 text-muted-foreground hover:bg-secondary/50 text-sm font-medium rounded-t-md transition-colors">
          Reports
        </button>
      </div>

      <div className="space-y-16">
        {/* Visual Showcase Section */}
        <section className="bg-secondary/20 p-6 md:p-8 rounded-2xl border border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Campus Showcase</h2>
              <p className="text-sm text-muted-foreground mt-1">Take a digital tour of our premium sports infrastructure.</p>
            </div>
            
            {/* Gallery Selector */}
            <div className="flex bg-background rounded-lg p-1 border shadow-sm w-fit">
              <button 
                onClick={() => setActiveGallery("gym")}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeGallery === "gym" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Gyms
              </button>
              <button 
                onClick={() => setActiveGallery("tennis")}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeGallery === "tennis" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Tennis
              </button>
              <button 
                onClick={() => setActiveGallery("pickleball")}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeGallery === "pickleball" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Pickleball
              </button>
            </div>
          </div>

          {/* Dynamic Image Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-500">
            {photoGalleries[activeGallery].map((imgSrc, idx) => (
              <div 
                key={`${activeGallery}-${idx}`} 
                className={`relative overflow-hidden rounded-xl bg-muted ${idx === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-[4/3]" : "aspect-square"}`}
              >
                <Image 
                  src={imgSrc}
                  alt={`${activeGallery} facility photo ${idx + 1}`}
                  fill
                  priority={idx === 0} // Preload the large feature image instantly
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" // Instructs Next.js to compress aggressively
                  className="object-cover hover:scale-110 transition-transform duration-700 ease-out"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Gyms Section */}
        <section>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 mb-4">
            <h2 className="text-xl font-medium text-foreground">Gyms</h2>
            <span className="text-xs text-muted-foreground">Live occupancy · no booking limit</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gyms.map((gym, idx) => (
              <Card key={idx} className="shadow-sm border-border bg-card">
                <CardHeader className="p-5 pb-3">
                  <div className="flex justify-between items-start gap-4">
                    <CardTitle className="text-base font-medium">{gym}</CardTitle>
                    <span className="text-[10px] font-semibold tracking-wider bg-secondary text-secondary-foreground px-2 py-1 rounded uppercase">
                      Inactive
                    </span>
                  </div>
                  <CardDescription className="text-xs font-medium text-muted-foreground mt-1">
                    0 currently inside · Hours pending
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Access requires a verified, time-limited entitlement. Contact FR Sports privately.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Recreation Rooms Section */}
        <section>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 mb-4">
            <h2 className="text-xl font-medium text-foreground">Recreation rooms</h2>
            <span className="text-xs text-muted-foreground">Block 1 - 8 - walk in play</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recRooms.map((room, idx) => (
              <Card key={idx} className="shadow-sm border-border bg-card">
                <CardHeader className="p-5 pb-3">
                  <div className="flex justify-between items-start gap-4">
                    <CardTitle className="text-base font-medium">{room}</CardTitle>
                    <span className="text-[10px] font-semibold tracking-wider bg-secondary text-secondary-foreground px-2 py-1 rounded uppercase">
                      Inactive
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Pilot access awaits verified student sign-in and the room QR.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
