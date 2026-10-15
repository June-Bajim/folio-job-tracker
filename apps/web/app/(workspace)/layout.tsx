import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "../../components/shell";
import { serviceOrigin } from "../../../../packages/shared/urls";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const response = await fetch(
    `${serviceOrigin(process.env.API_URL, "http://localhost:4000")}/api/me`,
    { headers: { cookie: h.get("cookie") ?? "" }, cache: "no-store" },
  );
  if (response.status === 401) redirect("/login");
  if (response.status === 403) redirect("/verify-email");
  if (!response.ok) throw new Error("Unable to load account");
  return <Shell user={await response.json()}>{children}</Shell>;
}
