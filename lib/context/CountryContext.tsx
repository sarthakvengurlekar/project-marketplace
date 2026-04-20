'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { COUNTRIES } from '@/lib/currency'
import { supabase } from '@/lib/supabase'

type CountryConfig = (typeof COUNTRIES)[string]

type CountryContextType = {
  countryCode: string
  setCountryCode: (code: string) => void
  config: CountryConfig
  initialized: boolean   // false until profile fetch completes — gate price renders on this
}

const CountryContext = createContext<CountryContextType | null>(null)

const DEFAULT = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? 'IN'

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [countryCode, setCountryCode] = useState(DEFAULT)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    async function loadCountryFromProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setInitialized(true); return }

        const { data: profile } = await supabase
          .from('profiles')
          .select('country_code')
          .eq('id', user.id)
          .maybeSingle()

        if (profile?.country_code && COUNTRIES[profile.country_code]) {
          setCountryCode(profile.country_code)
        }
      } finally {
        setInitialized(true)
      }
    }

    loadCountryFromProfile()
  }, [])

  return (
    <CountryContext.Provider
      value={{
        countryCode,
        setCountryCode,
        config: COUNTRIES[countryCode] ?? COUNTRIES['IN'],
        initialized,
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
