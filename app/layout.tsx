import type { Metadata } from 'next'
import type { Viewport } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'
import { CountryProvider } from '@/lib/context/CountryContext'
import BottomNav from '@/components/BottomNav'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-poppins',
  display: 'swap',
})

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
      <body className={`${poppins.variable} font-poppins antialiased`} style={{ background: '#FAF6EC', color: '#0A0A0A' }}>
        <CountryProvider>
          {children}
          <BottomNav />
        </CountryProvider>
      </body>
    </html>
  )
}
