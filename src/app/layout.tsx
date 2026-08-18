import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegister } from "@/components/nexus/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NM NEXUS — Secure Realtime Communication",
  description: "NM NEXUS by NIGHTMARE STUDIOS. Encrypted messaging, calls, and communities.",
  keywords: ["NM NEXUS", "NIGHTMARE STUDIOS", "secure messaging", "E2EE", "WebRTC"],
  authors: [{ name: "NIGHTMARE STUDIOS" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NM NEXUS",
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png", sizes: "1024x1024" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/logo.png", sizes: "1024x1024" }],
    shortcut: ["/logo.png"],
  },
  openGraph: {
    title: "NM NEXUS",
    description: "Secure realtime communication by NIGHTMARE STUDIOS",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07060c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
