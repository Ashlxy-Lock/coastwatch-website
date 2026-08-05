import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "智岸 AI | AI Coastal Sentinel";
const description =
  "AI-powered coastal safety research prototype combining edge vision, environmental intelligence and an explainable risk-fusion roadmap.";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "ashlxylock.uk";
  const forwardedProtocol = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: origin,
    title,
    description,
    keywords: ["AI Coastal Sentinel", "智岸 AI", "Edge AI", "OpenMV", "ESP32", "Coastal Safety"],
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "AI Coastal Sentinel",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "智岸 AI — AI Coastal Sentinel" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
