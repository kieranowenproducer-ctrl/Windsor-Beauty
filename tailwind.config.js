/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // src/lib too (task 41a3910f). A shared rule that decides a colour keeps its class names here,
    // and Tailwind only writes the CSS for classes it has SEEN. With this line missing, the order
    // stage squares asked for bg-orange-600 and bg-yellow-400, no such CSS was ever generated, and
    // two of the four squares rendered as nothing at all with no error anywhere. Red and green
    // happened to work only because those exact classes are used elsewhere in the app.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // WINDSOR BEAUTY'S PALETTE: "Blush and Plum" (chosen by Kieran, 1 October 2026).
        // Deep cream pages, blush bands, plum buttons and bars, rose details. No white.
        //
        // The page layout came from the sister shop, where every screen is written against
        // a "gold" scale, a "stone" scale and "white". Those three are redefined here, so
        // the whole site changes colour without renaming thousands of classes. Read them as:
        //   gold-700  the main brand colour (plum): buttons, headings, strong accents
        //   gold-400  the detail colour (rose)
        //   gold-50 / gold-100  blush bands and tints
        //   stone-50  the page cream;  white  the card cream;  stone-900  plum-black text and bars
        gold: {
          50:  '#F6E4DC',
          100: '#EBD0C7',
          200: '#E2C3B8',
          300: '#CFA194',
          400: '#B98478',
          500: '#A9695D',
          600: '#95574C',
          // 650: small accent text that still passes WCAG AA on the card cream (5.5:1).
          // scripts/check-admin-contrast.mjs measures it.
          650: '#8A4F45',
          700: '#4B2A3A',
          800: '#63394D',
          900: '#2E1823',
        },
        stone: {
          50:  '#F3E8D8',
          100: '#EDE0CD',
          200: '#E2D0BF',
          300: '#D2BDAA',
          400: '#9A858B',
          500: '#705860',
          600: '#634A52',
          700: '#523A44',
          800: '#472F3B',
          900: '#412636',
          950: '#2A1A22',
        },
        white: '#F9F1E4',
        black: '#3A2130',
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        // Decorative accent only — used for the single "Coming Soon" script
        // headline on the pre-launch page, matching the client-supplied
        // reference design. Never used for body copy or anything load-bearing.
        script: ['Pinyon Script', 'cursive'],
      },
      keyframes: {
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-33.333%)' },
        },
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        glow: {
          '0%, 100%': { textShadow: '0 0 12px rgba(184,144,42,0.25)' },
          '50%':      { textShadow: '0 0 22px rgba(184,144,42,0.55)' },
        },
        flashGold: {
          '0%, 100%': { opacity: '1',   textShadow: '0 0 24px rgba(184,144,42,0.65)' },
          '50%':      { opacity: '0.45', textShadow: '0 0 4px rgba(184,144,42,0.1)' },
        },
      },
      animation: {
        ticker: 'ticker 22s linear infinite',
        flash: 'flash 1.8s ease-in-out infinite',
        // Slow, low-contrast shimmer on the "Coming Soon" headline only —
        // draws the eye without being distracting. 4s is well below
        // anything that could trigger photo-sensitivity concerns.
        glow: 'glow 4s ease-in-out infinite',
        // A genuine attention-grabbing flash for the "10% OFF" figure
        // specifically — opacity + glow pulse, fast enough to clearly read
        // as flashing rather than gentle breathing, slow enough (1.4s) to
        // stay comfortable to look at. Disabled under reduced motion at the
        // usage site, same as glow above.
        flashGold: 'flashGold 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
