import { Facility } from "../types";

export const sportsFacilities: Facility[] = [
  {
    id: "f_pickleball",
    name: "Pickleball",
    type: "court",
    description: "2 professional standard pickleball courts.",
    courts: 2,
    openingHours: "06:00 - 22:00",
    rules: ["Non-marking shoes only", "Max 4 players per court", "Check-in at court mandatory"],
    equipment: ["Paddles available for rent", "Balls available at sports office"],
    userAccessStatus: "Allowed",
  },
  {
    id: "f_tennis",
    name: "Tennis",
    type: "court",
    description: "2 hard courts for tennis enthusiasts.",
    courts: 2,
    openingHours: "06:00 - 22:00",
    rules: ["Proper tennis attire required", "Non-marking shoes only", "Max 4 players per court"],
    equipment: ["Bring your own racquet", "Balls available at sports office"],
    userAccessStatus: "Allowed",
  },
  {
    id: "f_turf",
    name: "Turf",
    type: "turf",
    description: "Multi-purpose artificial turf.",
    courts: 2, // Treated as half courts: 1 and 2, where booking both means full turf. For simplicity, treating as 2 selectable areas.
    openingHours: "06:00 - 22:00",
    rules: ["Turf shoes or trainers only (no studs)", "No food or beverages on turf"],
    equipment: ["Goalposts available", "Football available at sports office"],
    userAccessStatus: "Allowed",
  },
  {
    id: "f_gym",
    name: "Gym & Recreation",
    type: "gym",
    description: "Fully equipped gymnasium with recreation area.",
    capacity: 30,
    areaNames: ["Block 1 Gym", "Block 2 Gym"],
    openingHours: "06:00 - 10:00, 16:00 - 21:00",
    rules: ["Towel mandatory", "Wipe down machines after use", "Indoor shoes only"],
    equipment: ["Free weights", "Cardio machines", "Resistance machines", "Yoga mats"],
    userAccessStatus: "Allowed",
  }
];
