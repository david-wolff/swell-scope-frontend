import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BackendWaker } from "@/components/BackendWaker";

export const metadata: Metadata = {
  title: "Swell Scope",
  description: "Historical Analysis for Coastal Weather Phenomena",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const be = process.env.NEXT_PUBLIC_BACKEND_URL;
  let beOrigin: string | null = null;
  try { beOrigin = be ? new URL(be).origin : null; } catch {}

  return (
    <html lang="pt-BR">
      <head>
        {/* Favicon / PWA bits */}
        <link rel="icon" href="/logo.png" sizes="any" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="theme-color" content="#0b1220" />

        {/* Prepara handshake com o backend para acordá-lo mais rápido */}
        {beOrigin ? <link rel="preconnect" href={beOrigin} /> : null}
      </head>
      <body className="bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {/* Dispara um ping assíncrono ao backend (/health) quando a página monta */}
        <BackendWaker />

        <div className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-neutral-950/60 border-b border-neutral-200/50 dark:border-neutral-800">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex items-center justify-between py-2">
            <Link href="#home" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Swell Scope" width={28} height={28} className="rounded" />
              <span className="font-medium">SwellScope</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="opacity-80 hover:opacity-100">Home</Link>
              <Link href="/waves" className="opacity-50 hover:opacity-100">Ondas</Link>
              <Link href="/tides" className="opacity-50 hover:opacity-100">Marés</Link>
            </nav>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
