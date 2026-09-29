import Link from "next/link";
import { Calendar, Info, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <section className="text-center py-16 md:py-24 space-y-6">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-primary">
          Play. Compete. Stay Fit.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Welcome to the VIT Bhopal Sports Facilities portal. Book courts, check availability, and manage your physical well-being.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/book">Book a session</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-8">
            <Link href="/check-in">Check in/out</Link>
          </Button>
        </div>
      </section>

      <section className="py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Our Facilities</h2>
          <Button variant="ghost" asChild>
            <Link href="/access">View details &rarr;</Link>
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {sportsFacilities.map((sport) => {
            return (
              <Card key={sport.id} className="overflow-hidden hover:shadow-lg transition-all duration-300 group">
                <div className="h-2 w-full bg-primary/20 group-hover:bg-primary transition-colors" />
                <CardHeader>
                  <div className="p-3 bg-primary/10 w-fit rounded-lg mb-4 text-primary">
                    {/* Placeholder for icon, you can add dynamic icons later */}
                    <Calendar className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl">{sport.name}</CardTitle>
                  <CardDescription>{sport.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-6">
                    {sport.type === 'court' 
                      ? `${sport.courts} Courts Available` 
                      : `Capacity: ${sport.capacity} people`}
                  </div>
                  <Button asChild className="w-full" variant="secondary">
                    <Link href={`/book?sport=${sport.id}`}>Book now</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="py-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div className="space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-primary">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h3 className="font-semibold text-lg">Quick Check-in</h3>
          <p className="text-muted-foreground">Arrive at the court and check in instantly from your phone.</p>
        </div>
        <div className="space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-primary">
            <Info className="w-8 h-8" />
          </div>
          <h3 className="font-semibold text-lg">Real-time Access</h3>
          <p className="text-muted-foreground">View real-time availability and capacity constraints for all facilities.</p>
        </div>
        <div className="space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-primary">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="font-semibold text-lg">Track Your Activity</h3>
          <p className="text-muted-foreground">Monitor your playtime, favorite sports, and activity trends over time.</p>
        </div>
      </section>
    </div>
  );
}
