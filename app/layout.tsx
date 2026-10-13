import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./profile.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The address social previews are built on. `Host` is what the platform routed
// the request by; `X-Forwarded-Host` is whatever a visitor chose to send, and
// used to be copied into the page. A deployment behind its own proxy names itself
// with NEXT_PUBLIC_SITE_URL.
function siteUrl(host: string | null) {
  const local = !host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  for (const candidate of [
    process.env.NEXT_PUBLIC_SITE_URL,
    `${local ? "http" : "https"}://${host || "localhost:3000"}`,
  ]) {
    const url = candidate ? URL.parse(candidate) : null;
    if (url && ["http:", "https:"].includes(url.protocol)) return new URL(url.origin);
  }
  return new URL("http://localhost:3000");
}

export async function generateMetadata(): Promise<Metadata> {
  // Reading the request also keeps this page rendered per request, which the
  // nonce minted in proxy.ts depends on: a prerendered page would carry none,
  // and the policy would then block every one of its scripts.
  const requestHeaders = await headers();
  const baseUrl = siteUrl(requestHeaders.get("host"));
  const title = "ScholarBuddy — Sports Research OS";
  const description =
    "A daily research cockpit and evidence-driven operating system for rigorous sports analytics PhD work.";
  const socialImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1672,
          height: 941,
          alt: "ScholarBuddy Today’s Research — Sports Research OS",
        },
      ],
    },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
