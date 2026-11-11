import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/src/i18n/LocaleProvider";
import { isSupportedLocale, translate } from "@/src/i18n/messages";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://oneauth.nishantapps.in";
const siteTitle = "OneAuth | Secure Identity & Access Management";
const siteDescription =
  "OneAuth helps developers and organizations securely manage identity, authentication, OAuth applications, and access to connected apps from one platform.";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("oneauth-locale")?.value;
  const locale = isSupportedLocale(localeCookie) ? localeCookie : "en";
  const localizedDescription = translate(
    locale,
    "OneAuth helps developers and organizations securely manage identity, authentication, OAuth applications, and access to connected apps from one platform.",
  );

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: siteTitle,
      template: "%s | OneAuth",
    },
    description: localizedDescription || siteDescription,
    applicationName: "OneAuth",
    keywords: [
      "OneAuth",
      "identity management",
      "authentication",
      "access management",
      "OAuth 2.0",
      "OpenID Connect",
      "developer portal",
      "single sign-on",
      "secure authentication",
    ],
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: siteUrl,
      siteName: "OneAuth",
      title: siteTitle,
      description: localizedDescription || siteDescription,
      locale: locale.replace("-", "_"),
    },
    twitter: {
      card: "summary",
      title: siteTitle,
      description: localizedDescription || siteDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("oneauth-locale")?.value;
  const locale = isSupportedLocale(localeCookie) ? localeCookie : "en";

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
