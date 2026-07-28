import "@fontsource/inter/latin-300.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UpgradeModalHost } from "@/components/billing/UpgradeModal";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { ToastHost } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc/ReDefined",
  description: "Doc/ReDefined prompt experience"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <ProfileProvider>{children}</ProfileProvider>
        <ToastHost />
        <UpgradeModalHost />
      </body>
    </html>
  );
}
