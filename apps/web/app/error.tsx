"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <section className="panel">
        <h1>We couldn’t load this page</h1>
        <p>Check that the API and database are running, then try again.</p>
        <button onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
