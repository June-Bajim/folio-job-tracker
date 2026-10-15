"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, UserContext, useHydrated, type User } from "../lib/client";
const nav = [
  { href: "/dashboard", icon: "◫", label: "Overview" },
  { href: "/applications", icon: "▤", label: "Applications" },
  { href: "/schedule", icon: "◷", label: "Interviews & reminders" },
  { href: "/contacts", icon: "♧", label: "Contacts" },
  { href: "/documents", icon: "▱", label: "Documents" },
  { href: "/delivery-status", icon: "↗", label: "Email delivery" },
  { href: "/settings", icon: "⚙", label: "Settings" },
];
export function Shell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [error, setError] = useState("");
  const hydrated = useHydrated();
  return (
    <UserContext.Provider value={user}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className="workspace">
        <aside className="sidebar">
          <Link className="brand" href="/dashboard">
            <span className="brand-mark">f</span>folio
            <span className="brand-dot">.</span>
          </Link>
          <div className="workspace-label">YOUR WORKSPACE</div>
          <nav aria-label="Main navigation">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={path.startsWith(n.href) ? "page" : undefined}
                className={path.startsWith(n.href) ? "active" : ""}
              >
                <span aria-hidden="true">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-note">
            <span>↗</span>
            <strong>Make your next move.</strong>
            <p>
              One application at a time.
              <br />
              You’ve got this.
            </p>
          </div>
          <div className="account">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>Your personal workspace</small>
            </div>
          </div>
          <button
            className="signout"
            disabled={!hydrated}
            onClick={async () => {
              try {
                await api("/auth/sign-out", "POST", {});
                window.location.assign("/login");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Sign out ↗
          </button>
          {error && <p role="alert">{error}</p>}
        </aside>
        <div className="main-wrap">
          <header className="topbar">
            <span>
              MY CAREER <span className="slash">/</span>{" "}
              <strong>
                {nav.find((item) => path.startsWith(item.href))?.label ??
                  "Overview"}
              </strong>
            </span>
            <span className="private-label">◈ Private workspace</span>
          </header>
          <main id="content">{children}</main>
          <footer className="footer">
            A little more organized. A step closer.
          </footer>
        </div>
      </div>
    </UserContext.Provider>
  );
}
