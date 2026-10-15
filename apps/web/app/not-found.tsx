import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="panel">
        <h1>Page not found</h1>
        <Link href="/dashboard">Back to dashboard</Link>
      </div>
    </main>
  );
}
