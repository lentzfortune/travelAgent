import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Agent",
  description: "Plan your next trip with your AI travel agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
