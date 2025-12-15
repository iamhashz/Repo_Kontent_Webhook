import { ManagementClient } from '@kontent-ai/management-sdk';
import { DeliveryClient } from '@kontent-ai/delivery-sdk';

const managementClient = new ManagementClient({
  environmentId: process.env.KONTENT_ENVIRONMENT_ID,
  apiKey: process.env.KONTENT_MANAGEMENT_API_KEY,
});

const deliveryClient = new DeliveryClient({
  environmentId: process.env.KONTENT_ENVIRONMENT_ID,
});

function normalizeUrl(path) {
  return path?.trim().toLowerCase().replace(/\/+$/, '') || '/';
}

export default async function handler(req, res) {
  try {
    console.log("Validation webhook triggered");
    
    const item = req.body?.data?.items?.[0];
    if (!item) return res.status(200).json({ isValid: true });

    if (item.system.type.codename !== 'url_redirect') {
      return res.status(200).json({ isValid: true });
    }

    /* ---------------- SOURCE URL VALIDATION ---------------- */

    const currentItemId = item.system.id;
    const sources = item.elements?.source_urls?.value || [];
    const normalizedSources = sources.map(normalizeUrl);

    const existing = await managementClient
      .listContentItems()
      .type('url_redirect')
      .workflowStep('published')
      .toPromise();

    for (const publishedItem of existing.data.items) {
      if (publishedItem.id === currentItemId) continue;

      const publishedSources =
        publishedItem.elements?.source_urls?.value || [];

      const normalizedPublished = publishedSources.map(normalizeUrl);

      for (const source of normalizedSources) {
        if (normalizedPublished.includes(source)) {
          return res.status(200).json({
            isValid: false,
            messages: [
              {
                severity: 'error',
                message: `Source URL '${source}' already exists in another published redirect.`,
              },
            ],
          });
        }
      }
    }

    /* ---------------- TARGET URL VALIDATION ---------------- */

    const target = normalizeUrl(item.elements?.target_url?.value);

    if (!target || !target.startsWith('/')) {
      return res.status(200).json({
        isValid: false,
        messages: [
          {
            severity: 'error',
            message: 'Target URL must be a valid relative path (e.g. /about-us).',
          },
        ],
      });
    }

    const publishedUrls = await getPublishedUrls();

    if (!publishedUrls.has(target)) {
      return res.status(200).json({
        isValid: false,
        messages: [
          {
            severity: 'error',
            message: `Target URL '${target}' does not exist or is not published.`,
          },
        ],
      });
    }

    return res.status(200).json({ isValid: true });

  } catch (err) {
    console.error('Validation webhook error:', err);

    // Fail-safe to avoid editor lockout
    return res.status(200).json({ isValid: true });
  }
}
