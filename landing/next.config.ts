import type { NextConfig } from 'next';

const GITHUB_RELEASES_URL = 'https://github.com/pblsketch/ssampin/releases';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/docs/troubleshooting/download',
        destination: GITHUB_RELEASES_URL,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
