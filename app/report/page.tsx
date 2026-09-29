"use client"
import { useEffect, useState } from "react";
import { getBookings } from "@/lib/bookings";
import { Booking } from "@/types";
import { sportsFacilities } from "@/data/facilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function ReportPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    setBookings(getBookings());
  }, []);

  const completedBookings = bookings.filter(b => b.status === 'Completed');
  const cancelledBookings = bookings.filter(b => b.status === 'Cancelled');
  
  const totalHours = completedBookings.length; // 1 hour per session for simplicity

  // Mock data for charts
  const barData = [
    { name: 'Mon', sessions: 1 },
    { name: 'Tue', sessions: 2 },
    { name: 'Wed', sessions: 0 },
    { name: 'Thu', sessions: 1 },
    { name: 'Fri', sessions: 3 },
    { name: 'Sat', sessions: 4 },
    { name: 'Sun', sessions: 2 },
  ];

  const sportCounts: Record<string, number> = {};
  completedBookings.forEach(b => {
    const name = sportsFacilities.find(f => f.id === b.facilityId)?.name || 'Unknown';
    sportCounts[name] = (sportCounts[name] || 0) + 1;
  });
  
  // Mix in some mock data if empty
  const pieData = Object.keys(sportCounts).length > 0 ? 
    Object.keys(sportCounts).map(key => ({ name: key, value: sportCounts[key] })) :
    [
      { name: 'Pickleball', value: 10 },
      { name: 'Tennis', value: 5 },
      { name: 'Gym', value: 15 },
    ];

  const mostPlayed = pieData.sort((a, b) => b.value - a.value)[0]?.name || 'N/A';

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">My Activity Report</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedBookings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalHours}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Most Played</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold truncate">{mostPlayed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancellations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{cancelledBookings.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Sessions This Week</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Hours by Sport</CardTitle>
          </CardHeader>
          <CardContent className="h-72 flex justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
