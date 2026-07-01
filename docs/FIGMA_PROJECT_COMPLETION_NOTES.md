# FieldTrack KSA — Figma Project Completion Notes

This project has been completed as a Figma Make / React prototype package for a Field Data Collection SaaS used to find construction leads across multiple cities in Saudi Arabia.

## Completed UI Areas

### Admin Web Dashboard
- Executive dashboard with active drivers, KSA city coverage cards, daily leads, charts, and zone progress.
- Multi-city coverage map with city selector, zone overlays, driver pins, and assignment color logic.
- City / zone / district / street assignment manager.
- Live GPS tracking page with driver status, idle/offline alerts, speed/last-active UI, and daily KM concepts.
- Leads database with filtering, export actions, lead status, and detail links.
- Lead detail review page with project information, construction phase, GPS location, contact details, photo category counts, QC score, approval/rejection actions, and driver performance.
- Reporting and analytics dashboard by city, zone, driver, and status.
- Smart route planning engine with per-city street coverage calculator and printable route sheet UI.
- Quality control queue for photo completion, blur check, duplicate risk, GPS match, and watermarked photo policy.
- Client portal and billing preview for optional Phase 2.
- Settings page with language, RTL, offline mode, notifications, and theme controls.

### Driver Mobile PWA
- Driver login.
- Driver home with assigned city/area, target progress, performance, and quick actions.
- Driver check-in screen with selfie proof, GPS verification, and time-window validation.
- Street-by-street navigation screen.
- Complete construction lead submission form:
  - Site name / plot number
  - Construction phase
  - Auto GPS location
  - City / street / district / zone
  - Nearest landmark
  - Mandatory billboard and front site photos
  - Optional side and contractor-board photos
  - Owner / contractor / engineer / phone fields
  - Notes
  - Offline draft save
- Offline sync dashboard with draft queue and sync status.

## Design Direction
- Professional blue/white SaaS dashboard style.
- Mobile-first driver screens with large tap targets.
- Arabic-friendly labels and RTL-ready structure.
- Dark and light mode support.
- Mapbox / Google Maps style map placeholders.
- Production-style cards, tables, badges, charts, and progress bars.

## Recommended Figma Structure
Use the following page organization in Figma:

1. Cover / Brand
2. Admin National Dashboard
3. City Map + Assignment
4. Admin Tracking + QC
5. Leads + Reports
6. Driver Mobile App
7. Client Portal Phase 2
8. Components / Design System
9. Developer Handoff

## Prototype Flow
Admin:
Dashboard → Cities & Map → Assignments → Live Tracking → Leads Database → Lead Detail → Quality Control → Reports → Route Planner → Client Portal → Settings

Driver:
Login → Home → Check-in → Navigation → Lead Form → Save Draft / Submit → Offline Sync

## Notes for Development
This is a front-end prototype. Backend, real authentication, real maps, real file storage, real GPS tracking, and live APIs must be implemented separately using the included architecture and schema files.
