# Validation completed

Verified in a local test environment with Node.js 24.19.0 and PostgreSQL 17.9.

- Backend TypeScript build passed.
- Frontend TypeScript and Vite production build passed.
- Database setup ran twice successfully, preserving existing data.
- Integration run: 10 tests passed, 0 failed (one parent test and nine behavior scenarios).
- Twelve concurrent registration requests for a workshop with capacity three produced exactly three successful registrations and nine conflict responses.
- A capacity reduction competing with a new registration preserved active registrations <= capacity.
- Role restrictions, immediate role changes, retained cancellation records, actor/time history, duplicate email rejection and date/status/availability filters passed.
- Browser smoke check passed: Admin created Manager/Staff accounts; Manager created a workshop, registered an attendee, saw the full state, cancelled and viewed history; Staff had the permitted actions. No page JavaScript errors were recorded.
- Desktop and mobile views were rendered. The one-page design PDF was rendered and visually checked.

Re-run the README checks on your own Windows/PostgreSQL installation before submitting; your credentials, ports and local services must be configured there. Production deployment is not included.
