import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Agent Deployment Lab",
  description: "A simulator-first deployment harness for safe enterprise voice actions."
};

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/simulator", label: "Simulator" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/approvals", label: "Approvals" },
  { href: "/evals", label: "Evals" }
] satisfies Array<{ href: Route; label: string }>;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 28
            }}
          >
            <Link href="/" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
              Voice Agent Deployment Lab
            </Link>
            <nav style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="subtle">
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
