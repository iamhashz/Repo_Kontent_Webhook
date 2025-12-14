import { ManagementClient } from '@kontent-ai/management-sdk';

function normalizeUrl(path) {
  if (!path) return null;

  return path
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '') || '/';
}

const client = new ManagementClient({
  environmentId: process.env.KONTENT_ENVIRONMENT_ID,
  apiKey: process.env.KONTENT_MANAGEMENT_API_KEY,
});

export default async function handler(req, res) {
  try {
    const event = req.body;

    const item = event?.data?.items?.[0];
    if (!item) {
      return res.status(200).json({ isValid: true });
    }

    // Only validate URL Redirect content type
    if (item.system.type.codename !== 'url_redirect') {
      return res.status(200).json({ isValid: true });
    }

    const currentItemId = item.system.id;
    const sources = item.elements?.source_urls?.value || [];

    if (!sources.length) {
      return res.status(200).json({ isValid: true });
    }

    const normalizedSources = sources
      .map(normalizeUrl)
      .filter(Boolean);

    // Fetch all published redirect items
    const response = await client
      .listContentItems()
      .type('url_redirect')
      .workflowStep('published')
      .toPromise();

    for (const existingItem of response.data.items) {
      if (existingItem.id === currentItemId) continue;

      const existingSources =
        existingItem.elements?.source_urls?.value || [];

      const normalizedExisting = existingSources
        .map(normalizeUrl)
        .filter(Boolean);

      for (const source of normalizedSources) {
        if (normalizedExisting.includes(source)) {
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

    // All good
    return res.status(200).json({ isValid: true });

  } catch (error) {
    console.error('Redirect validation error:', error);

    // Fail-safe: allow publish to avoid editor lockout
    return res.status(200).json({ isValid: true });
  }
}
