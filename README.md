# SocietyPool 🏡💧⚡

> **Hyperlocal Group-Buying & Collective Bargaining Platform for Housing Societies**

SocietyPool enables apartment residents, society management committees (RWAs), and verified service vendors to aggregate demand for essential home services (AC servicing, deep cleaning, pest control, sofa sanitization, painting, car washes) and unlock wholesale volume pricing tiers that are typically unavailable to individual households.

---

## 🌟 Key Features & Role Portals

### 1. Resident Experience (`/dashboard`, `/event/[id]`, `/activity`)
* **Live Service Pools:** Browse active group pools for your housing society with transparent volume pricing.
* **Dynamic Wholesale Pricing:** Real-time price tiers that drop as more neighbors enroll (e.g. 1–5 flats: ₹499 $\to$ 6–15 flats: ₹399 $\to$ 16+ flats: ₹299).
* **Live Savings Calculator:** Immediate visualization of individual and collective society savings.
* **Realtime Pool Updates:** Live participant sync and price-drop notifications via Supabase Realtime (`postgres_changes`).
* **Segregated Verification:** Residents independently verify service delivery for their own apartment unit before vendor payment settlement.

### 2. Society Management & Admin Portal (`/admin`)
* **Event Creation & Scheduling:** Create official group-buying events with custom slot timings, vendor assignments, and tier thresholds.
* **Resident Service Request Inbox:** Review incoming bulk requests submitted by residents and convert them into live pools with one click.
* **Roster Manifest Inspection:** Monitor enrolled flats, total participants, and locked tier discounts.
* **Society-Based Data Isolation:** Multi-tenant housing society boundaries enforced via PostgreSQL Row-Level Security (RLS).

### 3. AI Society Copilot (`/copilot`, `/api/chat`)
* **Intelligent Event Planner:** Conversational AI powered by Google Gemini (`gemini-1.5-flash` via Vercel AI SDK) assisting secretaries and residents.
* **Automated Tier Strategy:** Recommends optimal wholesale discount tiers based on society size and vendor agreements.
* **WhatsApp Broadcast Generator:** Drafts catchy, emoji-rich Hinglish/English broadcast announcements ready to send to building WhatsApp groups.
* **Interactive Event Draft Cards:** Rendered directly in chat for instant one-click publication.

### 4. Vendor Partner Dashboard (`/vendor`, `/api/vendor/completion`)
* **Assigned Booking Manifest:** View only service events explicitly assigned to your business.
* **Dispatch & Flat-Level Tracking:** Real-time visibility into flat statuses:
  * **Pending Service:** Units awaiting vendor technician visit.
  * **Vendor Marked Complete:** Work finished by vendor, pending resident sign-off.
  * **Resident Verified:** Confirmed satisfied by the resident.
  * **Issue Reported:** Flagged by resident for resolution.
* **Operational Progress Bar:** Clear operational dispatch metric (`X of Y flats completed by vendor • N Resident Verified`).
* **Strict Two-Party Security:** Vendor completion transitions flats to `awaiting_confirmation`. Vendors cannot forge or self-sign resident verification.
* **Atomic State Updates:** Concurrency-guarded completion API preventing duplicate or out-of-order state transitions.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Components, Partial Prerendering) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) (Strict type checking) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, SSR Session Auth, Realtime) |
| **Generative AI** | [Google Gemini 1.5 Flash](https://ai.google.dev/) via [Vercel AI SDK](https://sdk.vercel.ai/) (`ai`, `@ai-sdk/google`) |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/), Radix UI Primitives, Lucide Icons, Sonner Notifications |
| **Design System** | Custom Earthy Palette (`#2E3A2F` Forest, `#C96F4F` Terracotta, `#6B7F5B` Sage, `#FAF9F5` Alabaster) |

---

## 📁 Repository Structure

```text
society-pool/
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Landing & redirect logic
│   │   ├── layout.tsx                   # Root layout with fonts & bottom navigation
│   │   ├── dashboard/page.tsx           # Resident dashboard & active pools
│   │   ├── admin/page.tsx               # Admin management portal
│   │   ├── vendor/page.tsx              # Vendor partner dashboard
│   │   ├── copilot/page.tsx             # AI Society Copilot chat interface
│   │   ├── activity/page.tsx            # Booking history & savings breakdown
│   │   ├── event/[id]/page.tsx          # Event details & opt-in view
│   │   ├── login/page.tsx               # Authentication (Sign in / Sign up)
│   │   ├── signup/page.tsx              # Dedicated sign-up route
│   │   └── api/
│   │       ├── chat/route.ts            # Gemini Copilot streaming API
│   │       ├── events/route.ts          # Admin event publishing endpoint
│   │       └── vendor/completion/route.ts# Secure vendor completion endpoint
│   ├── components/
│   │   ├── admin/                       # Admin dashboard, event dialogs
│   │   ├── vendor/                      # Vendor dashboard, dispatch manifests
│   │   ├── dashboard/                   # Resident cards, price meters, notifications
│   │   ├── copilot/                     # Chat interface, draft previews
│   │   └── ui/                          # Button, Card, Badge, Dialog, Progress, etc.
│   ├── lib/
│   │   ├── auth.ts                      # Unified role detector (admin, resident, vendor)
│   │   ├── pricing.ts                   # Tier calculation, savings math, slot formatting
│   │   └── supabase/                    # SSR server/client & middleware handlers
│   └── types/                           # Core TypeScript domain models
├── supabase/
│   └── migrations/                      # RLS policies, triggers, and schema definitions
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js:** v18.18+ or v20+ (tested through Node 24)
* **npm:** v9+

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/<your-username>/society-pool.git
cd society-pool
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google Gemini API Key (for Copilot features)
GEMINI_API_KEY=your-gemini-api-key
# OR
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
```

### 4. Running the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production Build & Type Verification
```bash
# Verify TypeScript without errors
npx tsc --noEmit

# Compile production build
npm run build

# Start production server
npm run start
```

---

## 🔐 Role-Based Access & Demo Modes

SocietyPool implements strict role authorization evaluated via `public.users(role)`:

| Role | Default Route | Permissions |
| :--- | :--- | :--- |
| **`resident`** | `/dashboard` | Join open service pools, view savings, request services, confirm personal flat completion. |
| **`admin`** | `/admin` | Publish new pools, manage societies, review resident requests, view all rosters. |
| **`vendor`** | `/vendor` | View assigned bookings, track flat manifests, submit service completion handoffs. |

* **Demo Testing Mode:** For testing UI flows without database seeds, you can set a cookie `demo_role`:
  * Vendor mode: `Cookie: demo_role=vendor` $\to$ `/vendor`
  * Admin mode: `Cookie: demo_role=admin` $\to$ `/admin`
  * Resident mode: `Cookie: demo_role=resident` $\to$ `/dashboard`

---

## 🗄️ Database Migrations

Database schema scripts are located in `supabase/migrations/`:

* `20261009_secure_events_rls.sql`: Row-Level Security policies restricting event creation and updates to authorized Society Admins.
* `20261009_notifications_rls.sql`: Realtime notification schema and trigger functions for booking updates.
* `20261017_vendor_completion_verification.sql`: Flat-level service lifecycle (`status`), vendor assignment relationship, and resident verification policies.

To apply migrations, run the SQL scripts in the **Supabase SQL Editor** on your project.

---

## 🤝 How to Push to GitHub from Another Laptop

If you copy or clone this codebase to another laptop and want to push to your GitHub repository:

1. **Initialize or verify git remote:**
   ```bash
   git remote -v
   # If remote origin is missing:
   git remote add origin https://github.com/<your-username>/society-pool.git
   ```

2. **Stage and commit your local changes:**
   ```bash
   git add .
   git commit -m "feat: complete SocietyPool with resident, admin, copilot, and vendor dashboards"
   ```

3. **Push to main branch:**
   ```bash
   git branch -M main
   git push -u origin main
   ```

---

## 📄 License
This project is private and proprietary to SocietyPool.
