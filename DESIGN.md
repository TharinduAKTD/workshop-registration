# Workshop Registration Service — Design Decisions

**1. Technology Stack**

I used React with TypeScript and Vite for the frontend, Express with TypeScript for the backend, and PostgreSQL for the database. I chose these technologies because I am familiar with them, and they are suitable for building a simple full-stack application. I used raw SQL with parameterized queries instead of an ORM.

**2. Authentication and Permissions**

The system has three roles: Admin, Manager, and Staff. The first Admin account is created during database setup. Admins can create users and assign roles. Managers can manage workshops and registrations. Staff can register and cancel attendees. Managers and Staff can view workshops and registration history.

JWT is used for authentication, and passwords are securely hashed using bcrypt. Permissions are checked in the backend, not only in the frontend.

**3. Preventing Over-Registration**

A workshop cannot have more active registrations than its capacity. I used PostgreSQL transactions and `SELECT FOR UPDATE` to lock a workshop while processing a registration. This prevents multiple staff members from booking the last available seat at the same time.

If a workshop is full, the registration is rejected. Cancelling a registration frees a seat. The system also prevents reducing workshop capacity below the current number of active registrations.

**4. Registration History**

Registration records are never deleted. When an attendee cancels, the registration status changes to CANCELLED. The system records who registered or cancelled the attendee and when. Registration and cancellation events are saved in the database to maintain history.

**5. Assumptions**

Only OPEN workshops accept registrations. Each email address can have only one active registration per workshop. Workshop locations are stored as text. Dates and times are stored using PostgreSQL TIMESTAMPTZ, with filtering based on the Colombo timezone. Registration for past workshops is not separately restricted because it was not specified in the requirements.

**6. Trade-offs and Skipped Features**

I focused on completing the main requirements within the assessment time. The application includes authentication, role-based permissions, workshop management, registration, cancellation, history, and filtering.

Optional features such as waitlists, detailed audit logs for workshop and account changes, public deployment, password reset, and advanced pagination were not implemented.

JWT tokens are stored in sessionStorage for this assessment. For a production application, I would improve session security and add further security and monitoring features.

The project also includes build and integration tests covering permissions, concurrent registrations, cancellations, duplicate registrations, filters, and capacity updates.