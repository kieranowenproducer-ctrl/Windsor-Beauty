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
        gold: {
          50:  '#FDF8EC',
          100: '#F5EDD5',
          200: '#EDD9A3',
          300: '#D4AF5A',
          400: '#C49A2E',
          500: '#B8902A',
          600: '#A07820',
          // 650 exists for one reason: small gold text on white that still passes WCAG AA.
          // It is the brightest gold that does (4.56:1). 600 is 4.04:1 and 500 is 2.97:1, so
          // both are unreadable at the 7px the admin sidebar's section headings use. Do not
          // brighten this hex: scripts/check-admin-contrast.mjs measures it and will fail.
          // White backgrounds only. On gold-50 it drops to 4.30:1 and stops passing.
          650: '#957014',
          700: '#8B6914',
          800: '#6B4F0E',
          900: '#4A3508',
        },
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
