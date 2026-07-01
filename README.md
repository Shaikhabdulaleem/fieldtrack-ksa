# FieldTrack KSA — Multi-City Construction Site Lead Generation SaaS

Completed Figma Make / React prototype for a field data collection SaaS web + mobile application. The system now supports multiple Saudi cities, unlimited drivers, city-level operations, and city → zone → district → street assignment.

Original Figma project reference: https://www.figma.com/design/9xPaGAOGkTmpSgzdXx93rc/SaaS-Dashboard-and-Mobile-App

## What is included

### Admin Web App
- National KSA dashboard with city operation cards
- Multi-city map and coverage view
- City / zone / district / street assignment system
- Live GPS tracking for all drivers across cities
- Leads database with city, zone, district, phase, driver, and status filtering
- Lead detail and approval/rejection workflow
- Reports and analytics by city, driver, zone, and district
- Smart route planner and coverage calculator per city
- Quality control review queue
- Client portal and billing preview
- Settings with language/theme/offline controls

### Driver Mobile PWA
- Login
- Home dashboard with assigned city and area
- Start-day check-in with selfie + GPS verification
- Street-by-street navigation
- Construction lead submission form
- Mandatory photo categories
- Offline draft saving
- Sync queue
- Settings

### Handoff Files
- `docs/FIGMA_PROJECT_COMPLETION_NOTES.md`
- `database/schema.sql`
- `api/API_DOCUMENTATION.md`
- `manuals/DRIVER_USER_MANUAL_EN_AR.md`
- `manuals/ADMIN_USER_MANUAL.md`

## Running the code

```bash
npm install
npm run dev
```

## Recommended routes

Admin prototype:
- `/`
- `/city-map`
- `/assignments`
- `/tracking`
- `/leads`
- `/reports`
- `/route-planner`
- `/quality-control`
- `/client-portal`
- `/settings`

Driver mobile prototype:
- `/driver`
- `/driver/home`
- `/driver/check-in`
- `/driver/navigation`
- `/driver/lead-form`
- `/driver/sync`
- `/driver/settings`

## Multi-city logic

The app is no longer fixed to Jeddah or six drivers. The data model includes cities, drivers belong to a city, zones belong to a city, and assignments flow as:

`City → Zone → District → Street → Driver → Lead`

Demo cities included:
- Jeddah
- Riyadh
- Dammam / Khobar
- Makkah

## Notes
This is a clickable front-end prototype using mock data. For production, connect it to PostgreSQL/PostGIS, object storage, JWT auth, Socket.io live tracking, Google Maps/Mapbox, and push notifications.
