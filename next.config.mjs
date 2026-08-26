/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/flowdynamicsagency-portfolio', destination: '/flowdynamicsagency-portfolio/index.html' },
      { source: '/flowdynamicsagency-portfolio/', destination: '/flowdynamicsagency-portfolio/index.html' },
    ];
  },
};

export default nextConfig;
