# VIT Bhopal Sports Facilities

A frontend-only Next.js application for VIT Bhopal students to book sports facilities, check in/out, and track their activity.

## Features
- **Book Sessions**: Multi-step booking flow for sports facilities.
- **Check-in/Check-out**: Manage today's sessions.
- **Access Info**: Real-time capacity and rules for all facilities.
- **My Bookings**: View and cancel upcoming, past, or cancelled bookings.
- **My Report**: Activity tracking with Recharts.
- **Mock Data Layer**: Built with static typed JSON and `localStorage` to emulate a backend. No API routes or real database used.

## Tech Stack
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Shadcn UI (Custom minimal implementation)
- Lucide React (Icons)
- Recharts (Charts)
- Next Themes (Dark Mode)

## Setup Instructions

Since this project was built without `npx create-next-app` due to Node environment constraints during initialization, ensure you have Node.js installed to run it.

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure
- `app/`: Next.js pages and layouts (Home, Book, Check-in, Access, Bookings, Report).
- `components/`: Reusable UI components (Navbar, Footer, Button, Card).
- `data/`: Mock data for user, facilities, and initial bookings.
- `lib/`: Helper functions (localStorage booking management).
- `types/`: TypeScript definitions.
