import type { Metadata } from 'next'
import type { Viewport } from 'next'
import './globals.css'
import { CountryProvider } from '@/lib/context/CountryContext'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'projecttrading',
  description: 'Trade Pokémon cards',
}

export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">
        <CountryProvider>
          {children}
          <BottomNav />
        </CountryProvider>
      </body>
    </html>
  )
}
