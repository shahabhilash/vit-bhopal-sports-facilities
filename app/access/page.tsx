"use client"
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function AccessPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">Facility Access</h1>
      <p className="text-muted-foreground mb-8">Rules, guidelines, and your current access status for all sports facilities.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sportsFacilities.map(facility => (
          <Card key={facility.id} className="flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{facility.name}</CardTitle>
                  <CardDescription>{facility.openingHours}</CardDescription>
                </div>
                {facility.userAccessStatus === 'Allowed' ? (
                  <span className="flex items-center text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Allowed
                  </span>
                ) : (
                  <span className="flex items-center text-sm font-medium text-red-600 bg-red-50 px-2 py-1 rounded-md">
                    <AlertCircle className="w-4 h-4 mr-1" /> Restricted
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Equipment</h4>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {facility.equipment.map((eq, i) => (
                    <li key={i}>{eq}</li>
                  ))}
                </ul>
              </div>
              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold mb-2">Rules & Guidelines</h4>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {facility.rules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
