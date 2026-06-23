import type { NextConfig } from 'next';

const WINDOWS_DOWNLOAD_URL =
  'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-Setup.exe';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/docs/troubleshooting/download',
        destination: WINDOWS_DOWNLOAD_URL,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
