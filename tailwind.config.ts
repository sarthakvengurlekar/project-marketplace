import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Override zinc dark shades → deep purple-black Pokemon palette
        zinc: {
          950: '#0a0514',
          900: '#160e20',
          800: '#1e1628',
        },
        pika:   { DEFAULT: '#FFDE00', dark: '#F4C430' },
        char:   '#FF6B35',
        squirt: '#00A7E1',
        bulba:  '#78C850',
        gengar: { DEFAULT: '#7C538C', light: '#9C6BA6' },
        ball:   '#EE1515',
      },
      fontFamily: {
        poppins: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
      },
      boxShadow: {
        'glow-yellow': '0 0 18px rgba(255,222,0,0.45), 0 0 36px rgba(255,222,0,0.15)',
        'glow-red':    '0 0 18px rgba(238,21,21,0.5),  0 0 36px rgba(238,21,21,0.2)',
        'glow-blue':   '0 0 18px rgba(0,167,225,0.45), 0 0 36px rgba(0,167,225,0.15)',
        'glow-green':  '0 0 18px rgba(120,200,80,0.45),0 0 36px rgba(120,200,80,0.15)',
        'glow-purple': '0 0 18px rgba(124,83,140,0.5), 0 0 36px rgba(124,83,140,0.2)',
        'glow-orange': '0 0 18px rgba(255,107,53,0.45),0 0 36px rgba(255,107,53,0.15)',
      },
    },
  },
  plugins: [],
};
export default config;
