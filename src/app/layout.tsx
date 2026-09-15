import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LCIE Landed Cost Agent | Green G(P)4 Supply Chain Framework",
  description:
    "AI agent for harmonized code auto-determination and landed cost calculation across US (HTS), UK (Global Tariff) and EU (TARIC) when a Purchase Order is uploaded.",
  keywords: [
    "LCIE",
    "Landed Cost",
    "HS Code",
    "HTS",
    "UK Global Tariff",
    "EU TARIC",
    "Customs Duty",
    "VAT",
    "MPF",
    "HMF",
    "Green G(P)4",
    "Supply Chain",
    "AI Customs Broker",
  ],
  authors: [{ name: "Green G(P)4 Supply Chain Framework" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "LCIE Landed Cost Agent",
    description:
      "AI-assisted HS code + duty/VAT/levy determination for US, UK and EU.",
    siteName: "Green G(P)4 Supply Chain Framework",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
