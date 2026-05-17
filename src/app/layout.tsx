import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OneOnOne — Не теряй людей из виду",
  description: "Инструмент тимлида для регулярных встреч с командой",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
