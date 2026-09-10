/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/gas/:path*',
        destination: 'https://script.google.com/a/macros/gmo-c.jp/s/AKfycbzVvegKTOYCmRbRL5S0jWaDyjysYzq6lZek17LxkRfjPAxlmIOqPalnikeWxXJSJhQhRw/exec/:path*',
      },
    ];
  },
};

module.exports = nextConfig;