import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Folio · Your next chapter",
  description: "A thoughtful home for your job search.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
