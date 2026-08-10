import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "CoastWatch | 英国海岸机器学习风险研究";
const description =
  "基于英国六个海岸历史数据与实时海况的可解释机器学习风险研究网站。展示未来六小时四级风险、模型证据与已知局限。";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "ashlxylock.uk";
  const forwardedProtocol = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og-coastwatch.png", origin).toString();

  return {
    metadataBase: origin,
    title,
    description,
    keywords: ["CoastWatch", "英国海岸风险", "机器学习", "Coastal Risk", "Explainable AI", "Marine Weather"],
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "CoastWatch UK Coastal Risk Lab",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "CoastWatch — UK Coastal Risk Machine Learning Lab" }],
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
