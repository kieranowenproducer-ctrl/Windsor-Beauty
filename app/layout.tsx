import type { Metadata } from "next";
import { Outfit, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { CartProvider } from "@/lib/cart";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://windsorbeauty.co.uk"),
  title: {
    default: "Windsor Beauty | Considered Skincare Essentials",
    template: "%s | Windsor Beauty",
  },
  description:
    "Windsor Beauty offers a considered range of skincare essentials, including serums, moisturisers, cleansers and SPF, designed for daily routines and suitable for most skin types.",
  keywords: [
    "skincare",
    "serum",
    "moisturiser",
    "vitamin C serum",
    "hyaluronic acid serum",
    "niacinamide",
    "SPF moisturiser",
    "men's skincare",
    "UK skincare brand",
  ],
  openGraph: {
    title: "Windsor Beauty | Considered Skincare Essentials",
    description:
      "Considered skincare essentials, including serums, moisturisers, cleansers and SPF, designed for daily routines.",
    url: "https://windsorbeauty.co.uk",
    siteName: "Windsor Beauty",
    locale: "en_GB",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased flex min-h-screen flex-col">
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
