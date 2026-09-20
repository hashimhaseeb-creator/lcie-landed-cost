import type { Metadata } from "next";
import { Inter, Sora, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Green G(P)\u2074\u2122 Global Operations \u2014 LCIE Landed Cost Engine | Hydrogen Systems & Supply Chain Framework",
  description:
    "Green G(P)\u2074\u2122 Global Operations \u2014 Plan, Procure, Produce, Provide. The LCIE Landed Cost Engine is an AI agent that auto-determines HS codes (US HTS, UK Global Tariff, EU TARIC) and calculates duty, Section 301 / IEEPA surcharge, MPF, HMF and VAT when a Purchase Order is uploaded.",
  keywords: [
    "Green G(P)4",
    "LCIE",
    "Landed Cost",
    "HS Code",
    "HTS",
    "UK Global Tariff",
    "EU TARIC",
    "Section 301",
    "IEEPA",
    "MPF",
    "HMF",
    "VAT",
    "Supply Chain Framework",
    "Plan Procure Produce Provide",
    "AI Customs Broker",
    "Hydrogen Systems",
  ],
  authors: [{ name: "Green G(P)\u2074\u2122 Global Operations" }],
  icons: {
    icon: "/gp4-logo.png",
  },
  openGraph: {
    title: "Green G(P)\u2074\u2122 Global Operations \u2014 LCIE Landed Cost Engine",
    description:
      "AI-assisted HS code + duty/VAT/Section 301 determination for US, UK and EU.",
    siteName: "Green G(P)\u2074\u2122 Global Operations",
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
        className={`${inter.variable} ${sora.variable} ${plexMono.variable} antialiased bg-background text-foreground`}
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
