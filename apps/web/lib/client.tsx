"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
} from "react";
import type {
  Application,
  Interview,
  Reminder,
  StatusHistory,
} from "@prisma/client";
export type User = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};
export type AppRecord = Application & {
  interviews: Interview[];
  reminders: Reminder[];
  history: StatusHistory[];
};
export type ScheduledInterview = Interview & { application: Application };
export type ScheduledReminder = Reminder & { application: Application };
export const UserContext = createContext<User>({
  id: "",
  name: "",
  email: "",
  timezone: "UTC",
});
export const useUser = () => useContext(UserContext);
const subscribe = () => () => {};
export const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && !path.startsWith("/auth/")) {
    window.location.assign("/login");
    throw new Error("Please sign in");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? data.message ?? "Request failed");
  return data;
}
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, error, loading, refresh };
}
export function dateTime(value: Date | string, zone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
export function dateOnly(value: Date | string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "—";
}
export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="feedback success">
          {success}
        </p>
      )}
    </>
  );
}
export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <div className="loading" role="status">
      Loading your workspace…
    </div>
  ) : error ? (
    <div className="panel">
      <Feedback error={error} />
      <button onClick={retry}>Try again</button>
    </div>
  ) : null;
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <span /> {status}
    </span>
  );
}
