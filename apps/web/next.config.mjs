/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['@mailfalcon/shared', '@mailfalcon/ui'],
  // Static export: trailing slash makes paths cleaner on CF Pages.
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
