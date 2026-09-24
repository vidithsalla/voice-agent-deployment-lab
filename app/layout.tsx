import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Agent Deployment Lab",
  description: "Deployment gateway for safe enterprise voice actions."
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
          <header className="nav-bar" style={{ marginBottom: 24 }}>
            <Link href="/" style={{ fontSize: "1.02rem", fontWeight: 750 }}>
              Voice Agent Deployment Lab
            </Link>
            <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Main navigation">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link">
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
