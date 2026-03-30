import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0f0f13',
        surface: '#16161d',
        card: '#1e1e2a',
        border: '#2a2a3a',
        accent: {
          DEFAULT: '#22c55e',
          hover: '#16a34a',
          dim: '#14532d',
        },
        muted: '#6b7280',
        subtle: '#374151',
      },
    },
  },
  plugins: [],
}
export default config
