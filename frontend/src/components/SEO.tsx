import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: 'website' | 'product' | 'article';
  ogImage?: string;
  ogImageAlt?: string;
  price?: number;
  currency?: string;
  availability?: 'instock' | 'outofstock';
  noindex?: boolean;
}

const DEFAULT_DESCRIPTION = 'Villi: a curated marketplace for verified, authenticated pre-loved Finnish and Nordic design outdoor apparel.';
const DEFAULT_IMAGE = '/hero-emblem.png'; // Fallback OG image
const SITE_NAME = 'Villi';
const BASE_URL = 'https://villi.com'; // Update with actual production URL

/**
 * SEO component for managing page metadata
 * Updates document title, meta tags, and OpenGraph/Twitter Card tags
 */
export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  canonical,
  ogType = 'website',
  ogImage = DEFAULT_IMAGE,
  ogImageAlt,
  price,
  currency = 'EUR',
  availability,
  noindex = false,
}: SEOProps) {
  useEffect(() => {
    // Update document title
    document.title = `${title} | ${SITE_NAME}`;

    // Helper function to update or create meta tag
    const setMetaTag = (selector: string, content: string, property?: string) => {
      const attribute = property ? 'property' : 'name';
      const attributeValue = property || selector;

      let element = document.querySelector(`meta[${attribute}="${attributeValue}"]`) as HTMLMetaElement;

      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, attributeValue);
        document.head.appendChild(element);
      }

      element.setAttribute('content', content);
    };

    // Helper function to update or create link tag
    const setLinkTag = (rel: string, href: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;

      if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', rel);
        document.head.appendChild(element);
      }

      element.setAttribute('href', href);
    };

    // Basic meta tags
    setMetaTag('description', description);

    if (noindex) {
      setMetaTag('robots', 'noindex, nofollow');
    } else {
      setMetaTag('robots', 'index, follow');
    }

    // Canonical URL
    const canonicalUrl = canonical || window.location.href;
    setLinkTag('canonical', canonicalUrl);

    // OpenGraph tags
    setMetaTag('og:type', ogType, 'property');
    setMetaTag('og:title', title, 'property');
    setMetaTag('og:description', description, 'property');
    setMetaTag('og:url', canonicalUrl, 'property');
    setMetaTag('og:site_name', SITE_NAME, 'property');

    // Handle OG image (ensure it's an absolute URL)
    const absoluteImageUrl = ogImage.startsWith('http')
      ? ogImage
      : `${BASE_URL}${ogImage}`;
    setMetaTag('og:image', absoluteImageUrl, 'property');

    if (ogImageAlt) {
      setMetaTag('og:image:alt', ogImageAlt, 'property');
    }

    // Product-specific OG tags
    if (ogType === 'product' && price !== undefined) {
      setMetaTag('og:price:amount', price.toString(), 'property');
      setMetaTag('og:price:currency', currency, 'property');

      if (availability) {
        setMetaTag('og:availability', availability, 'property');
      }
    }

    // Twitter Card tags
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', title);
    setMetaTag('twitter:description', description);
    setMetaTag('twitter:image', absoluteImageUrl);

    if (ogImageAlt) {
      setMetaTag('twitter:image:alt', ogImageAlt);
    }

    // Cleanup function (optional - removes dynamically added tags)
    // Note: In practice, we usually don't remove these as they'll be updated on next route
  }, [title, description, canonical, ogType, ogImage, ogImageAlt, price, currency, availability, noindex]);

  // This component doesn't render anything
  return null;
}

/**
 * Hook for simple title updates without full SEO component
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | ${SITE_NAME}`;

    return () => {
      // Reset to default title on unmount
      document.title = `${SITE_NAME} — Verified Pre-Loved Nordic Outdoor Apparel`;
    };
  }, [title]);
}
