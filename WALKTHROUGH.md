# Assessment eka step by step therum ganna

## 1. Requirements mulinma

Me assessment eka products/orders app ekak nemei. Workshop registrations app ekak.

- ADMIN: users create karanawa, role set karanawa. Workshop access na.
- MANAGER: workshop add/edit karanawa; attendees register/cancel karanawa; history balanawa.
- STAFF: workshops/history balanawa; attendees register/cancel karanawa. Workshop add/edit ba.
- Attendee account ekak hadanne na: name + email witharai.
- ACTIVE registrations ganana capacity ekata wada wadi wenna ba.
- Cancel kalath original record delete karanne na.

## 2. Database eke tables 4 ai?

| Table | Thiyenne mokakda? |
| --- | --- |
| users | Staff login details, hashed password, role |
| workshops | Code, title, instructor, location, date/time, capacity, status |
| registrations | Attendee name/email, workshop FK, status, registered/cancelled actor/time |
| registration_events | REGISTERED / CANCELLED history, actor FK, time |

users -> workshops: workshop create karapu user. Seed workshops system-created nisa created_by null.
workshops -> registrations: one workshop ekata registrations godak.
users -> registrations: register karapu saha cancel karapu staff.
registrations -> registration_events: one registration ekata events godak.

SQL thiyenne schema.sql eke. VS Code eke file eka save karana eka witharak tables hadanne na. `npm run db:setup` execute kalama script eka PostgreSQL ekata connect wela SQL execute karanawa. DBeaver eka database eka balanna use karana client ekak witharai.

## 3. Backend piliwela

1. config.ts: `.env` read karala DB credentials, port, JWT secret gannawa.
2. db.ts: PostgreSQL Pool ekak hadanawa. Normal single query ekata pool.query use karanawa.
3. auth.ts: token verify karala database eken current user role gannawa. allow(...) middleware eken forbidden actions stop karanawa.
4. app.ts: routes, input validation, SQL queries saha business rules thiyenawa.
5. server.ts: database connection check karala server listen karanawa.

Password database eke plain text save karanne na. bcrypt hash ekak save karanawa. Login ekedi entered password eka hash ekka compare karanawa. JWT eka user ID identify karanawa; request ekak awama current role DB eken balana nisa role change eka immediately enforce wenawa.

## 4. Last seat problem eka

Capacity 1, ACTIVE registrations 0 kiyala hithanna. Staff A saha Staff B ekama welawata request karanawa.

Lock nathnam dennama count 0 balanawa. Dennama INSERT karanawa. Capacity 1 unath registrations 2 wenawa.

Apita thiyena flow eka:

1. `pool.connect()` eken ONE client/connection ekak gannawa.
2. `BEGIN` karanawa.
3. `SELECT ... FROM workshops WHERE id=$1 FOR UPDATE` eken workshop row eka lock karanawa.
4. Lock eka gaththata PASSE wena query ekakin ACTIVE count balanawa.
5. Full nam HTTP 409 error ekak, `ROLLBACK`.
6. Seat thiyenawanam registration INSERT karanawa, `RETURNING *` eken saved registration eke id gannawa.
7. E id eka use karala REGISTERED history event INSERT karanawa.
8. `COMMIT` karanawa; lock release wenawa.
9. `finally` eke client.release() karala connection eka pool ekata return karanawa.

Staff A lock gaththama Staff B wait karanawa. A commit kalata passe B lock gannawa, count eka 1 kiyala dakina nisa B reject wenawa. Transaction eka athule `pool.query` use karanne na: BEGIN, lock, count, insert, commit okkoma SAME client eke run wenna oona.

`RETURNING id` use karanne saved row eke ID eka ganna. ID duplicate wena eka prevent karanne primary key/sequence; RETURNING clause eka nemei.

`ROLLBACK` use karanne transaction eke changes undo karanna. Udaharanayak: registration INSERT una, history INSERT fail una nam, registration ekath undo wenna oona.

## 5. Cancel saha workshop edit

Cancel kalama status CANCELLED, cancelled_by, cancelled_at update karanawa. History event ekak insert karanawa. DELETE na. ACTIVE count adu nisa seat eka automatically free wenawa.

Cancel, register, capacity edit okkoma SAME workshop row eka lock karanawa. Manager capacity adu karanawanam active count ekata wada adu karanna ba. Already cancelled registration ekak aye cancel kalath duplicate history event ekak hadanne na.

## 6. Frontend flow

1. Login form -> POST /api/auth/login -> token + user.
2. Token sessionStorage eke thiyanawa; API calls walata Bearer header yawenawa.
3. Admin -> create accounts / roles screen.
4. Manager/Staff -> filters + workshops list.
5. Attendees click -> registrations list.
6. Form submit -> POST registration -> backend confirms -> list/seat count refresh.
7. Cancel -> backend updates -> UI refresh.
8. History -> backend events -> history panel.

Button hide karana eka permissions enforce karana eka nemei. Postman walin forbidden request ekak yawuwath backend 403 denna oona.

## 7. Interview ekedi kiyanna puluwan explanation

"I used React and TypeScript for the UI, Express for the API, and PostgreSQL for transactions. I enforce the exact role matrix in backend middleware. For registrations, I lock the workshop row inside one transaction, then check the active count before inserting. Cancellation and capacity edits use the same lock. Cancelled records and actor timestamps are retained, and history events commit with the registration change. I tested concurrent requests as well as authorization and cancellation."

Test eka oyage PC eke run karala pass unata passe last sentence eka kiyanna. Error ekak thiyenawanam fix karala aye verify karanna.
