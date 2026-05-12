/** @type {import('next').NextConfig} */
const nextConfig = {
  // Environment variables
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },

  // Compress responses
  compress: true,

  // Faster builds + smaller output
  poweredByHeader: false,
  reactStrictMode: false,

  // Image optimization — allow external logo/banner URLs
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
    minimumCacheTTL: 86400,
  },

  // Handle ES modules and external packages
  serverExternalPackages: [
    'viem', 'wagmi',
    '@gear-js/api', '@gear-js/react-hooks', '@gear-js/vara-ui', '@gear-js/wallet-connect', '@gear-js/ui',
    '@polkadot/api', '@polkadot/extension-dapp', '@polkadot/react-identicon',
    'sails-js',
  ],

  // Webpack configuration
  webpack: (config, { isServer }) => {
    config.externals = config.externals || []
    if (isServer) {
      config.externals.push({
        'viem': 'commonjs viem',
        'wagmi': 'commonjs wagmi',
      })
    }

    if (isServer && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      console.warn('⚠️ Warning: Missing Supabase environment variables.')
    }

    return config;
  },

  // HTTP headers for caching static assets
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
