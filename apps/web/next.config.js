/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  transpilePackages: ['@lawfirm/shared'],
  output: 'standalone',
  env: { NEXT_PUBLIC_APP_VERSION: require('./package.json').version },
  async headers() {
    // Outlook renders the add-in task pane inside an iframe: allow only Microsoft Outlook hosts, for the add-in path only.
    const outlookFraming = [
      {
        key: 'Content-Security-Policy',
        value:
          "frame-ancestors 'self' https://outlook.office.com https://outlook.office365.com https://outlook.live.com https://*.officeapps.live.com",
      },
    ];
    return [
      { source: '/outlook-addin', headers: outlookFraming },
      { source: '/outlook-addin/:path*', headers: outlookFraming },
    ];
  },
};

module.exports = nextConfig;
