/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/us-hts/merchandise-processing-fee-mpf-calculator',
        destination: '/?region=us&feature=mpf-calc',
      },
      {
        source: '/uk-global-tariff/post-brexit-import-vat-cif-calculator',
        destination: '/?region=uk&feature=cif-vat',
      },
      {
        source: '/eu-taric/cn8-code-verification-member-state-vat',
        destination: '/?region=eu&feature=cn8-vat',
      },
      {
        source: '/abf-australia/import-processing-charge-gst-calculator',
        destination: '/?region=au&feature=abf-gst',
      },
      {
        source: '/integrations/quickbooks-online-landed-cost-sync',
        destination: '/?sync=quickbooks',
      },
      {
        source: '/integrations/odoo-erp-automated-landed-cost-module',
        destination: '/?sync=odoo',
      },
      {
        source: '/integrations/netsuite-purchase-order-tariff-sync',
        destination: '/?sync=netsuite',
      },
    ];
  },
};

export default nextConfig;
