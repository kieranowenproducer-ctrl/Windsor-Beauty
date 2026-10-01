/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
    // Allow unoptimised local images during development
    unoptimized: process.env.NODE_ENV === 'development',
  },
  async redirects() {
    return [
      // Public URL rename: old product slug -> pretty slug (never show the old
      // name in the address bar). Internal slug is unchanged; see lib/slugAliases.
      { source: '/shop/super-human-blend', destination: '/shop/up389', permanent: true },
      { source: '/shop/dsip-5mg', destination: '/shop/dsip-10mg', permanent: true },
    ];
  },
}
module.exports = nextConfig
