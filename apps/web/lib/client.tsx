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
  emailVerified: boolean;
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
  emailVerified: false,
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
  if (data.error?.code === "EMAIL_NOT_VERIFIED") {
    window.location.assign("/verify-email");
    throw new Error("Verify your email to continue.");
  }
  if (!response.ok)
    throw new Error(data.error?.message ?? data.message ?? "Request failed");
  return data;
}
export async function downloadFile(path: string, filename: string) {
  const response = await fetch(
    `/api${path}${path.includes("?") ? "&" : "?"}format=json`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error?.message ??
        "File download failed. Please sign in and try again.",
    );
  }
  const file = (await response.json()) as { mimeType: string; content: string };
  const bytes = Uint8Array.from(atob(file.content), (character) =>
    character.charCodeAt(0),
  );
  if (!bytes.length)
    throw new Error("The file response was empty. Please retry.");
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
