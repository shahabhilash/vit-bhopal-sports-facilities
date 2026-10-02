"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AccessPage() {
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
          Access, attendance and feedback for gyms and recreation rooms.
        </p>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-10">
        <button className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow-sm">
          Facilities
        </button>
        <button className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium rounded-md transition-colors">
          My sessions
        </button>
        <button className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium rounded-md transition-colors">
          Player groups
        </button>
        <button className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium rounded-md transition-colors">
          Reports
        </button>
      </div>

      <div className="space-y-12">
        {/* Gyms Section */}
        <section>
          <div className="flex justify-between items-baseline mb-4">
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
          <div className="flex justify-between items-baseline mb-4">
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
