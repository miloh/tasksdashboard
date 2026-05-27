/**
 * Site configuration — reads from environment variables with sensible defaults.
 * Deployers customize their instance by setting these in .env.local
 */
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || 'Task Dashboard',
  tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE || 'Volunteer task management',
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    'A community workspace where people come together to learn, share, and create.',
  logoPath: process.env.NEXT_PUBLIC_LOGO_PATH || '/logo.svg',
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  authProvider: process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'discord',
} as const;
