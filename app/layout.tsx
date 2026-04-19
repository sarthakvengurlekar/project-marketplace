import type { Metadata } from 'next'
import './globals.css'
import { CountryProvider } from '@/lib/context/CountryContext'

export const metadata: Metadata = {
  title: 'projecttrading',
  description: 'Trade Pokémon cards',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">
        <CountryProvider>{children}</CountryProvider>
      </body>
    </html>
  )
}
