import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "زمام - معمل تشخيص شبكة الهاتف للسائق",
  description: "معمل هندسي لاختبار وعزل مشاكل اتصال السائق على شبكة بيانات الهاتف 4G/5G",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "زمام خلوي",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0F766E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col justify-start items-center">
        <div className="w-full max-w-md min-h-screen flex flex-col bg-slate-900 border-x border-slate-800 shadow-2xl relative">
          {children}
        </div>
      </body>
    </html>
  );
}
