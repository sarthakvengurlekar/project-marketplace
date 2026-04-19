'use client'

import { createContext, useContext, useState } from 'react'
import { COUNTRIES } from '@/lib/currency'

type CountryConfig = (typeof COUNTRIES)[string]

type CountryContextType = {
  countryCode: string
  setCountryCode: (code: string) => void
  config: CountryConfig
}

const CountryContext = createContext<CountryContextType | null>(null)

const DEFAULT = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? 'IN'

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [countryCode, setCountryCode] = useState(DEFAULT)

  return (
    <CountryContext.Provider
      value={{
        countryCode,
        setCountryCode,
        config: COUNTRIES[countryCode] ?? COUNTRIES['IN'],
      }}
    >
      {children}
    </CountryContext.Provider>
  )
}

export function useCountry() {
  const ctx = useContext(CountryContext)
  if (!ctx) throw new Error('useCountry must be used within CountryProvider')
  return ctx
}
