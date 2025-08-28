# Changelog

All notable changes to this project will be documented in this file.

## v0.2.0 - 2025-08-28

### Added
- Admin-only routing and protection on backend for all `/api/admin/*` endpoints via token (`get_current_admin_user`).
- `authFetch` utility with automatic token refresh and retry on 401 (frontend).
- Admin banner on 401/403 with one-click relog to `/admin`.
- Admin badge in app header when the user has admin privileges.
- Manual chunk splitting in Vite for more predictable bundles (`vendor-react`, `vendor-mui`, etc.).

### Changed
- Unified administration UI to a single route `/admin`; removed `admin-qsa-settings` usage.
- Persist login across hard refresh: frontend holds user session using local data if `/auth/me` temporarily fails.
- Frontend now uses `authFetch` for:
  - Admin panel (all `/api/admin/*` calls)
  - Chat streaming, conversation creation, TTS and ASR endpoints
  - File uploads (FileUpload, FileManager, FileManagerCompact)
- Survey Results visuals: added toggles and zooms
  - Bar/Pie toggle per demographic (Età, Sesso, Istruzione, Tipo Istituto, Provenienza)
  - Collapsible sections, numeric labels on bars, labels on pie sectors (counts only)
  - Line chart for all Likert questions with clickable legend to show/hide series
  - STEM/Umanistiche comparison moved into demographics and tied to selected question
  - Type Istituto grouped by macro-typology (Scuole, Università/AFAM, ITS, Altre) with static mapping `frontend/public/istituto_mapping.json`
  - Zoom-to-fullscreen for each demographic chart

### Fixed
- Removed duplicated “Dati demografici” section in SurveyResults.
- Removed legacy admin password prompt from AdminPanel.

### Notes
- To push this release and tag to your remote:
  - `git push origin master --tags`
- If running in dev, start backend and frontend as usual, then open `/admin` and login with an admin user.

