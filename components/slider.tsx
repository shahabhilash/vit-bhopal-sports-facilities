"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const images = [
  "/images/slider-1.JPG",
  "/images/slider-2.jpg",
  "/images/slider-3.jpg",
];

export default function Slider() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 4000); 
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-full h-[600px] md:h-[700px] overflow-hidden bg-slate-900 group">
      {images.map((src, idx) => (
        <div
          key={idx}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            idx === currentIndex ? "opacity-100 z-0" : "opacity-0 z-0"
          }`}
        >
          <Image
            src={src}
            alt={`Campus facilities slide ${idx + 1}`}
            fill
            className="object-cover"
            priority={idx === 0}
          />
        </div>
      ))}
      
      {/* Heavy dark gradient overlay to ensure white text is always readable */}
      <div className="absolute inset-0 bg-black/60 z-10" />

      {/* Hero Content overlaid on top */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 md:px-6">
        <div className="max-w-4xl space-y-6">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-4 drop-shadow-lg">
            VIT Bhopal <br className="md:hidden" />
            <span className="text-[#a4b884]">
              Sports Facilities
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed drop-shadow-md">
            Welcome to the official VIT Bhopal Sports Facilities portal. Book courts, check availability, and manage your physical well-being seamlessly.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
            <Button asChild size="lg" className="rounded-md px-8 shadow-xl shadow-black/20 h-14 text-base font-bold transition-all hover:scale-[1.03] bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/book">Book a session</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-md px-8 h-14 text-base font-bold bg-white/10 text-white border-white/20 hover:bg-white/20 transition-all hover:scale-[1.03] backdrop-blur-sm">
              <Link href="/check-in">Check in/out</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Slider indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-20">
        {images.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full transition-all shadow-md ${
              idx === currentIndex ? "bg-white w-6 md:w-8" : "bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
