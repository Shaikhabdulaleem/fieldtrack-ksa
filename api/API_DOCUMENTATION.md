# FieldTrack KSA API Documentation - Draft

Base URL: `/api/v1`
Authentication: JWT Bearer token
Roles: `super_admin`, `city_manager`, `driver`, `client`

## Auth
- `POST /auth/login` — login admin/driver/client.
- `POST /auth/logout` — revoke session.
- `GET /auth/me` — current user profile and permissions.

## Cities
- `GET /cities` — list supported Saudi cities.
- `POST /cities` — create a new operating city.
- `GET /cities/:id` — city profile, center coordinates, coverage, driver count, and lead count.
- `PATCH /cities/:id` — update city metadata.

## Admin - City Mapping
- `GET /cities/:city_id/zones` — list zones with coverage percentage for a city.
- `GET /zones/:id/districts` — list districts under zone.
- `GET /districts/:id/streets` — list streets with assignment status.
- `POST /imports/osm` — import OSM street data into PostGIS for a selected city.

## Admin - Assignments
- `POST /assignments` — assign city/zone/district/street group to driver.
- `GET /assignments?city_id=&driver_id=&date=` — view assignments.
- `PATCH /assignments/:id` — update assignment status.
- `POST /assignments/auto-plan` — generate daily proximity-based route plan per city.

## Driver Mobile
- `GET /driver/today` — today's assigned city, zone, district, streets, and target.
- `POST /driver/check-in` — selfie + GPS check-in.
- `POST /driver/check-out` — end-day closeout.
- `POST /streets/:id/visit` — mark visited / lead found / skipped.
- `POST /sync/offline` — bulk sync drafts and street updates.

## GPS Tracking
- `POST /tracking/ping` — driver GPS ping every 30 seconds.
- `GET /tracking/live?city_id=` — admin live driver map, optionally filtered by city.
- `GET /tracking/drivers/:id/history?date=` — route breadcrumb trail.
- `GET /tracking/alerts?city_id=` — idle/offline/skipped street alerts.

## Leads
- `POST /leads` — create construction lead.
- `GET /leads?city_id=&zone_id=&district_id=&phase=&date=&driver_id=&status=` — filter leads.
- `GET /leads/:id` — lead details with photos and timeline.
- `PATCH /leads/:id/approve` — approve lead.
- `PATCH /leads/:id/reject` — reject lead with reason.
- `PATCH /leads/:id/sent-to-client` — mark lead as sent.
- `POST /leads/:id/photos` — upload lead photos.

## Quality Control
- `POST /qc/photo-blur-check` — run blur detection.
- `POST /qc/duplicate-check` — compare nearby GPS and billboard data within the same city.
- `POST /qc/gps-street-match` — verify lead GPS within selected city/street/district.

## Reports / Export
- `GET /reports/summary?city_id=&from=&to=` — daily/weekly/monthly report.
- `GET /reports/drivers?city_id=` — driver performance comparison.
- `GET /reports/coverage?city_id=` — street coverage summary.
- `GET /exports/leads.xlsx?city_id=` — Excel export.
- `GET /exports/leads.csv?city_id=` — CSV export.
- `GET /exports/leads.pdf?city_id=` — PDF report with photos.

## Notifications
- `POST /notifications/push` — send push notification.
- `POST /whatsapp/lead-summary` — send lead summary to client/admin.
- `POST /whatsapp/daily-report` — daily admin summary.
