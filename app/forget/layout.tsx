import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password | OneAuth",
  description: "Reset your OneAuth account password.",
};

export default function ForgetLayout({ children }: LayoutProps<"/forget">) {
  return children;
}
