/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  transpilePackages: ['@lawfirm/shared'],
  output: 'standalone',
};

module.exports = nextConfig;
