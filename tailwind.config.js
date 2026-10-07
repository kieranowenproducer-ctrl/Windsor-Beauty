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
        form: {
          surface: '#FFFFFF',
          border: '#7B8D9B',
          panel: '#CBD5DF',
          disabled: '#E8EEF2',
        },
        // Pale blue and brushed pewter, approved by Kieran on 7 October 2026.
        // Keep the legacy scale names used throughout the shop and admin:
        // gold-700 is graphite, stone-50/white are pale blue, stone-900 is dark text.
        gold: {
          50:  '#F3F7FA',
          100: '#F3F7FA',
          200: '#9AAEBF',
          300: '#9AAEBF',
          400: '#9AAEBF',
          500: '#415564',
          600: '#415564',
          650: '#415564',
          700: '#3D4B59',
          800: '#273644',
          900: '#1C2B38',
        },
        stone: {
          50:  '#F3F7FA',
          100: '#F4F7FA',
          200: '#F4F7FA',
          300: '#9AAEBF',
          400: '#9AAEBF',
          500: '#415564',
          600: '#415564',
          700: '#415564',
          800: '#273644',
          900: '#273644',
          950: '#18242E',
        },
        white: '#F3F7FA',
        black: '#273644',
      },
      backgroundImage: {
        'beauty-silver': 'linear-gradient(120deg, #566570 0%, #7E8B96 47%, #64727D 100%)',
      },
      textColor: { white: '#F4F7FA' },
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
