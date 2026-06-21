import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Anton, Fraunces } from "next/font/google";
import "./globals.css";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "../contexts/AuthContext";
import { WalletProvider } from "../contexts/WalletContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display: heavy condensed poster face for impact headlines.
const anton = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

// Editorial serif (with italics) for expressive accent words.
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "All Or Nothing",
  description: "Test your luck and win big with exciting casino games!",
  icons: {
    icon: "/images/aon-favicon.png",
    shortcut: "/images/aon-favicon.png",
    apple: "/images/aon-favicon.png",
  },
};

// Mobile-first viewport: fit device width, allow zoom for accessibility,
// and respect notches/safe areas on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#07060A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${fraunces.variable} antialiased`}
        suppressHydrationWarning
      >
        <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
          <AuthProvider>
            <WalletProvider>{children}</WalletProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );

}
