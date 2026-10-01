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
        // WINDSOR BEAUTY'S OWN PALETTE (the colours of the first Windsor Beauty site):
        // warm cream pages, charcoal type and buttons, champagne accents. The page layout
        // came from the sister shop, and every screen there is written against a "gold"
        // and a "stone" scale, so the two scales are redefined here rather than renaming
        // thousands of classes. Read "gold-700" as "the main brand colour" (charcoal) and
        // "gold-400" as "the accent" (champagne).
        gold: {
          50:  '#FBF7F1', // cream
          100: '#F1E9DD', // sand
          200: '#E7DECE', // line
          300: '#D9C39A',
          400: '#C7A769', // champagne, the accent
          500: '#B9985C',
          600: '#AD8E54', // champagne-dark, hover
          // 650: small accent text on white that still passes WCAG AA (4.8:1).
          // scripts/check-admin-contrast.mjs measures it. White backgrounds only.
          650: '#8A6D3B',
          700: '#2B2723', // charcoal: buttons, headings, strong accents
          800: '#4A4038', // hover on charcoal, and dark accent text
          900: '#191613',
        },
        stone: {
          50:  '#FBF7F1',
          100: '#F4EEE4',
          200: '#E7DECE',
          300: '#D5CABA',
          400: '#A39A8E',
          500: '#776F66',
          600: '#5E5750',
          700: '#48423C',
          800: '#37322D',
          900: '#2B2723',
          950: '#191613',
        },
        black: '#2B2723',
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
