import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "../../components/shell";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const response = await fetch(
    `${process.env.API_URL ?? "http://localhost:4000"}/api/me`,
    { headers: { cookie: h.get("cookie") ?? "" }, cache: "no-store" },
  );
  if (response.status === 401) redirect("/login");
  if (!response.ok) throw new Error("Unable to load account");
  return <Shell user={await response.json()}>{children}</Shell>;
}
