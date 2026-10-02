import Link from "next/link";
import { Calendar, Info, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Official Hero Section */}
      <section className="relative w-full bg-slate-50 py-20 md:py-32 overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-grid-slate-100/[0.04] bg-[bottom_1px_center]" />
        <div className="container px-4 md:px-6 relative z-10 max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-block px-3 py-1 text-sm font-medium text-primary bg-primary/10 rounded-full mb-4">
            Official Portal
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-4">
            VIT Bhopal <br className="md:hidden" />
            <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
              Sports Facilities
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Welcome to the official VIT Bhopal Sports Facilities portal. Book courts, check availability, and manage your physical well-being seamlessly.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
            <Button asChild size="lg" className="rounded-md px-8 shadow-lg shadow-primary/20 h-12 text-base font-semibold transition-all hover:scale-[1.02]">
              <Link href="/book">Book a session</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-md px-8 h-12 text-base font-semibold border-slate-300 hover:bg-slate-100 transition-all hover:scale-[1.02]">
              <Link href="/check-in">Check in/out</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Our Facilities</h2>
            <p className="text-slate-500 mt-2 text-lg">Explore the sports infrastructure available on campus.</p>
          </div>
          <Button variant="ghost" asChild className="text-primary hover:text-primary/80 hover:bg-primary/10">
            <Link href="/access">View details &rarr;</Link>
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {sportsFacilities.map((sport) => {
            return (
              <Card key={sport.id} className="overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 group border-slate-200">
                <div className="h-1.5 w-full bg-slate-100 group-hover:bg-primary transition-colors" />
                <CardHeader className="pb-4">
                  <div className="p-3 bg-slate-50 w-fit rounded-lg mb-4 text-primary border border-slate-100 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl text-slate-900">{sport.name}</CardTitle>
                  <CardDescription className="text-slate-500 line-clamp-2">{sport.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-medium text-slate-700 mb-6 bg-slate-50 py-2 px-3 rounded-md">
                    {sport.type === 'court' 
                      ? `${sport.courts} Courts Available` 
                      : `Capacity: ${sport.capacity} people`}
                  </div>
                  <Button asChild className="w-full font-medium" variant="secondary">
                    <Link href={`/book?sport=${sport.id}`}>Book now</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="py-20 bg-slate-900 text-slate-50 border-t border-slate-800">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="space-y-5 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-blue-400 shadow-inner">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="font-semibold text-xl text-white">Quick Check-in</h3>
              <p className="text-slate-400 leading-relaxed">Arrive at the facility and check in instantly from your smartphone.</p>
            </div>
            <div className="space-y-5 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-blue-400 shadow-inner">
                <Info className="w-8 h-8" />
              </div>
              <h3 className="font-semibold text-xl text-white">Real-time Access</h3>
              <p className="text-slate-400 leading-relaxed">View real-time availability and capacity constraints before you arrive.</p>
            </div>
            <div className="space-y-5 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-blue-400 shadow-inner">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="font-semibold text-xl text-white">Track Your Activity</h3>
              <p className="text-slate-400 leading-relaxed">Monitor your playtime, favorite sports, and stay consistent.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
