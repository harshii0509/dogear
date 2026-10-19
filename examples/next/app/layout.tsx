import Link from "next/link";
import type { ReactNode } from "react";

import { DogearComments } from "./comments";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", maxWidth: 640, margin: "64px auto", padding: "0 16px" }}>
        <nav style={{ display: "flex", gap: 16 }}>
          <Link href="/">Home</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/pricing?plan=team">Pricing (team)</Link>
        </nav>
        {children}
        <DogearComments />
      </body>
    </html>
  );
}
