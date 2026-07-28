/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@lawfirm/shared'],
  output: 'standalone',
};

module.exports = nextConfig;
