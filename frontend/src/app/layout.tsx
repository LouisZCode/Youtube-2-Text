import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/AuthContext";
import Script from "next/script";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "TubeText — YouTube Video to Text",
  description: "Convert any YouTube video to a formatted transcript with timestamps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${roboto.variable} ${robotoMono.variable} antialiased`}>
        <Script
          type="module"
          src="https://cdn.spline.design/@splinetool/hana-viewer@1.2.44/hana-viewer.js"
          strategy="afterInteractive"
        />
        <ThemeProvider attribute="class" defaultTheme="light">
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
