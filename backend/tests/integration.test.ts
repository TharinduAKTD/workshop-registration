import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { pool } from "../src/db.js";

// Run against a LOCAL development database. Fixtures are retained for inspection.
// No records are deleted or reset. Each test run uses a unique email/code suffix.
let server: Server;
let base: string;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
before(async () => {
  await pool.query("SELECT 1");
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server address missing");
  base = `http://127.0.0.1:${address.port}/api`;
});
after(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function request(
  path: string,
  method = "GET",
  token?: string,
  body?: unknown,
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: (await res.json()) as any };
}

test("Workshop registration service: access, concurrency, history and filtering", async (t) => {
  let admin = "";
  let manager = "";
  let staff = "";
  let managerId = 0;
  const managerEmail = `manager-${suffix}@example.com`;
  const staffEmail = `staff-${suffix}@example.com`;
  const password = "Testing123!";
  const workshopBody = {
    code: `TEST-${suffix}`,
    title: "Concurrent registration test",
    instructor: "Test trainer",
    location: "Colombo",
    startsAt: "2035-06-10T10:00:00+05:30",
    capacity: 3,
    status: "OPEN",
  };
  let workshopId = 0;
  let firstRegistration = 0;
  let firstEmail = "";
  let registeredActorId = 0;

  await t.test(
    "Login works; bad credentials and unauthenticated access are refused",
    async () => {
      assert.equal((await request("/workshops")).status, 401);
      assert.equal(
        (
          await request("/auth/login", "POST", undefined, {
            email: "nobody@example.com",
            password,
          })
        ).status,
        401,
      );
      const login = await request("/auth/login", "POST", undefined, {
        email: process.env.ADMIN_EMAIL || "admin@workshop.local",
        password: process.env.ADMIN_PASSWORD || "Admin123!",
      });
      assert.equal(login.status, 200);
      admin = login.data.token;
      assert.equal(login.data.user.role, "ADMIN");
      assert.equal(login.data.user.password_hash, undefined);
    },
  );

  await t.test(
    "Only Admin creates accounts; Manager and Staff log in",
    async () => {
      const m = await request("/users", "POST", admin, {
        name: "Test Manager",
        email: managerEmail,
        password,
        role: "MANAGER",
      });
      assert.equal(m.status, 201);
      managerId = m.data.id;
      assert.equal(m.data.password_hash, undefined);
      assert.equal(
        (
          await request("/users", "POST", admin, {
            name: "Test Staff",
            email: staffEmail,
            password,
            role: "STAFF",
          })
        ).status,
        201,
      );
      manager = (
        await request("/auth/login", "POST", undefined, {
          email: managerEmail,
          password,
        })
      ).data.token;
      staff = (
        await request("/auth/login", "POST", undefined, {
          email: staffEmail,
          password,
        })
      ).data.token;
      assert.ok(manager && staff);
      assert.equal(
        (
          await request("/users", "POST", staff, {
            name: "Forbidden",
            email: `bad-${suffix}@example.com`,
            password,
            role: "ADMIN",
          })
        ).status,
        403,
      );
      assert.equal((await request("/users", "GET", manager)).status, 403);
      assert.equal((await request("/users", "GET", staff)).status, 403);
    },
  );

  await t.test(
    "Admin cannot view/create workshops; Staff cannot create workshops",
    async () => {
      assert.equal((await request("/workshops", "GET", admin)).status, 403);
      assert.equal(
        (await request("/workshops", "POST", admin, workshopBody)).status,
        403,
      );
      assert.equal(
        (await request("/workshops", "POST", staff, workshopBody)).status,
        403,
      );
      const created = await request(
        "/workshops",
        "POST",
        manager,
        workshopBody,
      );
      assert.equal(created.status, 201);
      workshopId = created.data.id;
      assert.equal(
        (await request(`/workshops/${workshopId}`, "PUT", staff, workshopBody))
          .status,
        403,
      );
      assert.equal(
        (await request(`/workshops/${workshopId}/registrations`, "GET", admin))
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            `/workshops/${workshopId}/registrations`,
            "POST",
            admin,
            { attendeeName: "A", attendeeEmail: "a@example.com" },
          )
        ).status,
        403,
      );
    },
  );

  await t.test(
    "12 simultaneous requests cannot exceed capacity 3",
    async () => {
      const replies = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          request(
            `/workshops/${workshopId}/registrations`,
            "POST",
            i % 2 ? staff : manager,
            {
              attendeeName: `Attendee ${i}`,
              attendeeEmail: `attendee-${i}-${suffix}@example.com`,
            },
          ),
        ),
      );
      assert.equal(replies.filter((r) => r.status === 201).length, 3);
      assert.equal(replies.filter((r) => r.status === 409).length, 9);
      const first = replies.find((r) => r.status === 201)!.data;
      firstRegistration = first.id;
      firstEmail = first.attendee_email;
      registeredActorId = first.registered_by;
      const count = await pool.query(
        "SELECT COUNT(*)::int AS count FROM registrations WHERE workshop_id=$1 AND status='ACTIVE'",
        [workshopId],
      );
      assert.equal(count.rows[0].count, 3);
      assert.equal(
        (
          await request(`/workshops/${workshopId}`, "PUT", manager, {
            ...workshopBody,
            capacity: 2,
          })
        ).status,
        409,
      );
    },
  );

  await t.test(
    "Cancellation frees a seat, retains the record and records exactly two history events",
    async () => {
      assert.equal(
        (
          await request(
            `/registrations/${firstRegistration}/cancel`,
            "POST",
            admin,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `/registrations/${firstRegistration}/history`,
            "GET",
            admin,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `/registrations/${firstRegistration}/cancel`,
            "POST",
            staff,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/registrations/${firstRegistration}/cancel`,
            "POST",
            manager,
          )
        ).status,
        200,
      );
      const history = await request(
        `/registrations/${firstRegistration}/history`,
        "GET",
        staff,
      );
      assert.deepEqual(
        history.data.map((e: any) => e.action),
        ["REGISTERED", "CANCELLED"],
      );
      assert.equal(history.data[0].actor_id, registeredActorId);
      const staffUser = await request("/auth/me", "GET", staff);
      assert.equal(history.data[1].actor_id, staffUser.data.id);
      const list = await request(
        `/workshops/${workshopId}/registrations`,
        "GET",
        manager,
      );
      assert.equal(list.data.length, 3);
      const cancelled = list.data.find((r: any) => r.id === firstRegistration);
      assert.equal(cancelled.status, "CANCELLED");
      assert.ok(cancelled.cancelled_at);
      const available = await request(
        "/workshops?availableOnly=true",
        "GET",
        staff,
      );
      assert.ok(
        available.data.some(
          (w: any) => w.id === workshopId && w.available_seats === 1,
        ),
      );
      const again = await request(
        `/workshops/${workshopId}/registrations`,
        "POST",
        staff,
        { attendeeName: "Returning attendee", attendeeEmail: firstEmail },
      );
      assert.equal(again.status, 201);
      assert.notEqual(again.data.id, firstRegistration);
      assert.equal(
        (await request(`/workshops/${workshopId}/registrations`, "GET", staff))
          .data.length,
        4,
      );
    },
  );

  await t.test(
    "Date/status/available filtering and invalid input",
    async () => {
      const filtered = await request(
        "/workshops?from=2035-06-10&to=2035-06-10&status=OPEN",
        "GET",
        staff,
      );
      assert.ok(
        filtered.data.some(
          (w: any) => w.id === workshopId && w.available_seats === 0,
        ),
      );
      assert.ok(
        !(
          await request("/workshops?availableOnly=true", "GET", staff)
        ).data.some((w: any) => w.id === workshopId),
      );
      assert.equal(
        (
          await request(
            "/workshops?from=2035-06-15&to=2035-06-10",
            "GET",
            staff,
          )
        ).status,
        400,
      );
      assert.equal(
        (await request("/workshops?from=2035-02-30", "GET", staff)).status,
        400,
      );
      assert.equal(
        (
          await request("/workshops", "POST", manager, {
            ...workshopBody,
            code: `INVALID-${suffix}`,
            capacity: 0,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/workshops/${workshopId}/registrations`,
            "POST",
            staff,
            { attendeeName: "", attendeeEmail: "invalid" },
          )
        ).status,
        400,
      );
    },
  );

  await t.test(
    "Duplicate email and closed workshops are refused; rejected requests add no history",
    async () => {
      const another = await request("/workshops", "POST", manager, {
        ...workshopBody,
        code: `DUPE-${suffix}`,
        capacity: 5,
      });
      const id = another.data.id;
      const attendee = {
        attendeeName: "Duplicate test",
        attendeeEmail: `duplicate-${suffix}@example.com`,
      };
      assert.equal(
        (
          await request(
            `/workshops/${id}/registrations`,
            "POST",
            staff,
            attendee,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(`/workshops/${id}/registrations`, "POST", manager, {
            ...attendee,
            attendeeEmail: attendee.attendeeEmail.toUpperCase(),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(`/workshops/${id}`, "PUT", manager, {
            ...workshopBody,
            code: `DUPE-${suffix}`,
            capacity: 5,
            status: "CLOSED",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/workshops/${id}/registrations`, "POST", staff, {
            attendeeName: "Another",
            attendeeEmail: `another-${suffix}@example.com`,
          })
        ).status,
        409,
      );
      const events = await pool.query(
        "SELECT COUNT(*)::int AS count FROM registration_events e JOIN registrations r ON r.id=e.registration_id WHERE r.workshop_id=$1",
        [id],
      );
      assert.equal(events.rows[0].count, 1);
    },
  );

  await t.test(
    "Capacity reduction racing with registration preserves the invariant",
    async () => {
      const body = { ...workshopBody, code: `RACE-${suffix}`, capacity: 2 };
      const created = await request("/workshops", "POST", manager, body);
      const id = created.data.id;
      assert.equal(
        (
          await request(`/workshops/${id}/registrations`, "POST", staff, {
            attendeeName: "First",
            attendeeEmail: `race-first-${suffix}@example.com`,
          })
        ).status,
        201,
      );
      const results = await Promise.all([
        request(`/workshops/${id}`, "PUT", manager, { ...body, capacity: 1 }),
        request(`/workshops/${id}/registrations`, "POST", staff, {
          attendeeName: "Second",
          attendeeEmail: `race-second-${suffix}@example.com`,
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 409).length, 1);
      const final = await pool.query(
        "SELECT capacity,(SELECT COUNT(*)::int FROM registrations WHERE workshop_id=w.id AND status='ACTIVE') AS active FROM workshops w WHERE id=$1",
        [id],
      );
      assert.ok(final.rows[0].active <= final.rows[0].capacity);
    },
  );

  await t.test(
    "Role changes take effect immediately with existing tokens",
    async () => {
      assert.equal(
        (
          await request(`/users/${managerId}/role`, "PATCH", admin, {
            role: "STAFF",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/workshops", "POST", manager, {
            ...workshopBody,
            code: `ROLE-${suffix}`,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/users/${managerId}/role`, "PATCH", admin, {
            role: "MANAGER",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/users/${managerId}/role`, "PATCH", staff, {
            role: "ADMIN",
          })
        ).status,
        403,
      );
    },
  );
});
