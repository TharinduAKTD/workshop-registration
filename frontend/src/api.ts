export type Role = "ADMIN" | "MANAGER" | "STAFF";
export type User = { id: number; name: string; email: string; role: Role };
export type Workshop = {
  id: number;
  code: string;
  title: string;
  instructor: string;
  location: string;
  starts_at: string;
  capacity: number;
  status: string;
  active_count: number;
  available_seats: number;
};
export type Registration = {
  id: number;
  attendee_name: string;
  attendee_email: string;
  status: string;
  registered_by_name: string;
  registered_at: string;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
};
export type HistoryEvent = {
  id: number;
  action: string;
  actor_name: string;
  occurred_at: string;
};

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem("workshop-token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && token)
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data as T;
}

export const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    dateStyle: "medium",
    timeStyle: "short",
  });
