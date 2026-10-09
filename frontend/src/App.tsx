import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  dateTime,
  type User,
  type Role,
  type Workshop,
  type Registration,
  type HistoryEvent,
} from "./api";

type Notice = { text: string; error: boolean } | null;
const statuses = ["OPEN", "CLOSED", "CANCELLED", "COMPLETED"];
const roles: Role[] = ["ADMIN", "MANAGER", "STAFF"];
const blankWorkshop = {
  code: "",
  title: "",
  instructor: "",
  location: "Colombo",
  startsAt: "",
  capacity: "10",
  status: "OPEN",
};
// datetime-local uses the browser's local timezone; the API receives an unambiguous ISO instant.
const localInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [history, setHistory] = useState<{
    registration: Registration;
    events: HistoryEvent[];
  } | null>(null);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    status: "",
    availableOnly: false,
  });
  const [editor, setEditor] = useState<{
    id: number | null;
    values: typeof blankWorkshop;
  } | null>(null);

  const logout = () => {
    sessionStorage.removeItem("workshop-token");
    setUser(null);
    setSelected(null);
    setRegistrations([]);
    setHistory(null);
    setEditor(null);
    setWorkshops([]);
    setUsers([]);
    setNotice(null);
  };
  useEffect(() => {
    const expired = () => {
      logout();
      setNotice({
        text: "Session expired. Please sign in again.",
        error: true,
      });
    };
    window.addEventListener("session-expired", expired);
    if (sessionStorage.getItem("workshop-token"))
      api<User>("/auth/me")
        .then(setUser)
        .catch((e) => setNotice({ text: e.message, error: true }))
        .finally(() => setChecking(false));
    else setChecking(false);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  async function loadWorkshops() {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.status) params.set("status", filters.status);
    if (filters.availableOnly) params.set("availableOnly", "true");
    const list = await api<Workshop[]>(`/workshops?${params}`);
    setWorkshops(list);
    if (selected && !list.some((w) => w.id === selected)) {
      setSelected(null);
      setHistory(null);
    }
  }
  async function loadRegistrations(id: number) {
    setRegistrations(
      await api<Registration[]>(`/workshops/${id}/registrations`),
    );
  }
  async function refresh() {
    if (user?.role === "ADMIN") setUsers(await api<User[]>("/users"));
    else {
      await loadWorkshops();
      if (selected) await loadRegistrations(selected);
    }
  }
  async function perform(work: () => Promise<void>, success?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      if (success) setNotice({ text: success, error: false });
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : "Request failed",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (user) void perform(refresh);
  }, [user]);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await perform(async () => {
      const result = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      sessionStorage.setItem("workshop-token", result.token);
      setUser(result.user);
    });
  }
  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await perform(async () => {
      await api("/users", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(data)),
      });
      form.reset();
      await refresh();
    }, "Account created. Share the credentials with the staff member.");
  }
  async function saveWorkshop(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const { id, values } = editor;
    await perform(
      async () => {
        await api(id ? `/workshops/${id}` : "/workshops", {
          method: id ? "PUT" : "POST",
          body: JSON.stringify({
            ...values,
            capacity: Number(values.capacity),
            startsAt: new Date(values.startsAt).toISOString(),
          }),
        });
        setEditor(null);
        await refresh();
      },
      id ? "Workshop updated." : "Workshop created.",
    );
  }
  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const id = selected;
    await perform(async () => {
      await api(`/workshops/${id}/registrations`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(data)),
      });
      form.reset();
      await refresh();
    }, "Attendee registered. Seat confirmed.");
  }
  const current = workshops.find((w) => w.id === selected);

  if (checking) return <div className="loading">Opening Workshop Desk…</div>;
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="mark">W</span>
          <div>
            Workshop Desk<small>Community training centre</small>
          </div>
        </div>
        {user && (
          <div className="session">
            <span>
              {user.name}
              <small>{label(user.role)}</small>
            </span>
            <button className="light" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </header>
      {!user ? (
        <main className="login-layout">
          <div className="intro">
            <div className="eyebrow">
              A little learning. A lot of possibility.
            </div>
            <h1>
              Every workshop.
              <br />
              Every seat.
              <br />
              <span>All in one place.</span>
            </h1>
            <p>
              Schedule workshops, welcome attendees, and keep every registration
              accounted for.
            </p>
            <div className="intro-note">
              Staff access only · No public signup
            </div>
          </div>
          <section className="card login-card">
            <div className="eyebrow">Welcome back</div>
            <h2>Sign in to your desk</h2>
            <p className="muted">
              Use the account provided by your administrator.
            </p>
            {notice && <NoticeBox notice={notice} />}
            <form onSubmit={login}>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="you@centre.com"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <button disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {user.role === "ADMIN" ? "Administration" : "Front desk"}
              </div>
              <h1>
                {user.role === "ADMIN"
                  ? "Your team, connected."
                  : "Make room for learning."}
              </h1>
              <p className="muted">
                {user.role === "ADMIN"
                  ? "Create staff accounts and assign the right access."
                  : "Find a workshop, confirm a seat, and keep the full history."}
              </p>
            </div>
            <div className="actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void perform(refresh)}
              >
                Refresh
              </button>
              {user.role === "MANAGER" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    setEditor({ id: null, values: { ...blankWorkshop } })
                  }
                >
                  + Add workshop
                </button>
              )}
            </div>
          </div>
          {notice && <NoticeBox notice={notice} />}
          {user.role === "ADMIN" ? (
            <div className="admin-grid">
              <section className="card">
                <h2>Create an account</h2>
                <p className="muted">
                  Managers schedule workshops. Staff handle registrations.
                </p>
                <form onSubmit={createUser}>
                  <label>
                    Full name
                    <input name="name" required maxLength={100} />
                  </label>
                  <label>
                    Email address
                    <input name="email" type="email" required maxLength={254} />
                  </label>
                  <label>
                    Temporary password
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      maxLength={72}
                    />
                    <small>At least 8 characters</small>
                  </label>
                  <label>
                    Role
                    <select name="role" defaultValue="STAFF">
                      {roles.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy}>Create account</button>
                </form>
              </section>
              <section className="card">
                <h2>
                  Team accounts <span className="count">{users.length}</span>
                </h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name / email</th>
                        <th>Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.name}</strong>
                            <small>{u.email}</small>
                          </td>
                          <td>
                            <select
                              aria-label={`Role for ${u.name}`}
                              value={u.role}
                              disabled={busy || u.id === user.id}
                              onChange={(e) => {
                                const nextRole = e.target.value;
                                void perform(async () => {
                                  await api(`/users/${u.id}/role`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ role: nextRole }),
                                  });
                                  await refresh();
                                }, "Role updated.");
                              }}
                            >
                              {roles.map((r) => (
                                <option key={r}>{r}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : (
            <>
              <section className="card filter-card">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(loadWorkshops);
                  }}
                  className="filters"
                >
                  <label>
                    From
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) =>
                        setFilters({ ...filters, from: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) =>
                        setFilters({ ...filters, to: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={filters.status}
                      onChange={(e) =>
                        setFilters({ ...filters, status: e.target.value })
                      }
                    >
                      <option value="">All statuses</option>
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={filters.availableOnly}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          availableOnly: e.target.checked,
                        })
                      }
                    />
                    Seats available
                  </label>
                  <button disabled={busy}>Find workshops</button>
                </form>
                <small>
                  Workshop display and date filters use Sri Lanka time
                  (Asia/Colombo).
                </small>
              </section>
              <section className="card">
                <div className="section-heading">
                  <h2>
                    Workshops <span className="count">{workshops.length}</span>
                  </h2>
                  <span className="muted">Select one to manage attendees</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Workshop</th>
                        <th>Date & location</th>
                        <th>Seats</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workshops.map((w) => (
                        <tr
                          key={w.id}
                          className={w.id === selected ? "selected" : ""}
                        >
                          <td>
                            <strong>{w.title}</strong>
                            <small>
                              {w.code} · {w.instructor}
                            </small>
                          </td>
                          <td>
                            {dateTime(w.starts_at)}
                            <small>{w.location}</small>
                          </td>
                          <td>
                            <strong>{w.available_seats} left</strong>
                            <small>
                              {w.active_count} / {w.capacity} booked
                            </small>
                          </td>
                          <td>
                            <span className={`badge ${w.status.toLowerCase()}`}>
                              {label(w.status)}
                            </span>
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                className="secondary compact"
                                disabled={busy}
                                onClick={() =>
                                  void perform(async () => {
                                    await loadRegistrations(w.id);
                                    setSelected(w.id);
                                    setHistory(null);
                                  })
                                }
                              >
                                Attendees
                              </button>
                              {user.role === "MANAGER" && (
                                <button
                                  className="link"
                                  disabled={busy}
                                  onClick={() =>
                                    setEditor({
                                      id: w.id,
                                      values: {
                                        code: w.code,
                                        title: w.title,
                                        instructor: w.instructor,
                                        location: w.location,
                                        startsAt: localInput(w.starts_at),
                                        capacity: String(w.capacity),
                                        status: w.status,
                                      },
                                    })
                                  }
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!workshops.length && (
                    <div className="empty">
                      No workshops match these filters. Change the dates or
                      status and try again.
                    </div>
                  )}
                </div>
              </section>
              {current && (
                <section className="card detail">
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow">Registrations & history</div>
                      <h2>{current.title}</h2>
                    </div>
                    <button
                      className="link"
                      onClick={() => {
                        setSelected(null);
                        setHistory(null);
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <div className="detail-grid">
                    <div className="register-panel">
                      <h3>Register an attendee</h3>
                      <p className="muted">
                        {current.available_seats} seats available ·{" "}
                        {label(current.status)}
                      </p>
                      <form onSubmit={register}>
                        <label>
                          Attendee name
                          <input name="attendeeName" required maxLength={100} />
                        </label>
                        <label>
                          Email address
                          <input
                            name="attendeeEmail"
                            type="email"
                            required
                            maxLength={254}
                          />
                        </label>
                        <button
                          disabled={
                            busy ||
                            current.status !== "OPEN" ||
                            current.available_seats < 1
                          }
                        >
                          Confirm registration
                        </button>
                      </form>
                      {(current.status !== "OPEN" ||
                        current.available_seats < 1) && (
                        <p className="muted">
                          Registration is unavailable for this workshop.
                        </p>
                      )}
                    </div>
                    <div>
                      <h3>
                        Attendees{" "}
                        <span className="count">{registrations.length}</span>
                      </h3>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Attendee / activity</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {registrations.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <strong>{r.attendee_name}</strong>
                                  <small>{r.attendee_email}</small>
                                  <small>
                                    Registered by {r.registered_by_name}
                                    <br />
                                    {dateTime(r.registered_at)}
                                  </small>
                                  {r.cancelled_at && (
                                    <small>
                                      Cancelled by {r.cancelled_by_name}
                                      <br />
                                      {dateTime(r.cancelled_at)}
                                    </small>
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`badge ${r.status.toLowerCase()}`}
                                  >
                                    {label(r.status)}
                                  </span>
                                </td>
                                <td>
                                  <div className="vertical-actions">
                                    <button
                                      className="link"
                                      disabled={busy}
                                      onClick={() =>
                                        void perform(async () =>
                                          setHistory({
                                            registration: r,
                                            events: await api<HistoryEvent[]>(
                                              `/registrations/${r.id}/history`,
                                            ),
                                          }),
                                        )
                                      }
                                    >
                                      History
                                    </button>
                                    {r.status === "ACTIVE" && (
                                      <button
                                        className="danger compact"
                                        disabled={busy}
                                        onClick={() => {
                                          if (
                                            window.confirm(
                                              `Cancel ${r.attendee_name}'s registration? The seat will become available.`,
                                            )
                                          )
                                            void perform(async () => {
                                              await api(
                                                `/registrations/${r.id}/cancel`,
                                                { method: "POST" },
                                              );
                                              setHistory(null);
                                              await refresh();
                                            }, "Registration cancelled. The seat has been freed.");
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!registrations.length && (
                          <p className="empty">
                            No attendees yet. Register the first one.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {history && (
                    <div className="history-panel">
                      <div className="section-heading">
                        <h3>History: {history.registration.attendee_name}</h3>
                        <button
                          className="link"
                          onClick={() => setHistory(null)}
                        >
                          Close history
                        </button>
                      </div>
                      <ol className="timeline">
                        {history.events.map((event) => (
                          <li key={event.id}>
                            <strong>{label(event.action)}</strong> by{" "}
                            {event.actor_name}
                            <small>{dateTime(event.occurred_at)}</small>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      )}
      {editor && (
        <div className="modal-backdrop">
          <section
            className="card modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workshop-dialog-title"
          >
            <div className="section-heading">
              <h2 id="workshop-dialog-title">
                {editor.id ? "Edit workshop" : "Add a workshop"}
              </h2>
              <button
                className="link"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Close
              </button>
            </div>
            <form onSubmit={saveWorkshop}>
              <div className="form-grid">
                {(
                  [
                    "code",
                    "title",
                    "instructor",
                    "location",
                    "startsAt",
                    "capacity",
                  ] as const
                ).map((field) => (
                  <label key={field}>
                    {
                      {
                        code: "Workshop code",
                        title: "Title",
                        instructor: "Instructor",
                        location: "Location",
                        startsAt: "Date & time (your device timezone)",
                        capacity: "Capacity",
                      }[field]
                    }
                    <input
                      type={
                        field === "startsAt"
                          ? "datetime-local"
                          : field === "capacity"
                            ? "number"
                            : "text"
                      }
                      required
                      min={field === "capacity" ? 1 : undefined}
                      max={field === "capacity" ? 100000 : undefined}
                      maxLength={
                        field === "code" ? 40 : field === "title" ? 150 : 100
                      }
                      value={editor.values[field]}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [field]: e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Status
                  <select
                    value={editor.values.status}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        values: { ...editor.values, status: e.target.value },
                      })
                    }
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              {notice?.error && <NoticeBox notice={notice} />}
              <button disabled={busy}>
                {busy ? "Saving…" : "Save workshop"}
              </button>
            </form>
          </section>
        </div>
      )}
      <footer>Workshop Desk · Every registration accounted for</footer>
    </>
  );
}

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <div
      role={notice.error ? "alert" : "status"}
      className={`notice ${notice.error ? "error" : "success"}`}
    >
      {notice.text}
    </div>
  );
}
