import type { MetadataRoute } from "next";

const baseUrl = "https://distill-mcp.com";

// Define all documentation pages with their slugs
const docPages = [
  "", // index page
  "installation",
  "mcp-tools",
  "troubleshooting",
  "guides/claude-code",
  "guides/cursor",
  "guides/windsurf",
  "guides/antigravity",
  "guides/claude-md-setup",
  "guides/settings-local",
];

// Define static pages
const staticPages = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "about", priority: 0.8, changeFrequency: "monthly" as const },
];

// Supported languages
const languages = ["en", "fr"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // Root URL with x-default behavior
  entries.push({
    url: baseUrl,
    lastModified,
    changeFrequency: "weekly",
    priority: 1,
    alternates: {
      languages: {
        en: `${baseUrl}/en`,
        fr: `${baseUrl}/fr`,
        "x-default": baseUrl,
      },
    },
  });

  // Static pages for each language
  for (const page of staticPages) {
    for (const lang of languages) {
      const url = page.path
        ? `${baseUrl}/${lang}/${page.path}`
        : `${baseUrl}/${lang}`;

      entries.push({
        url,
        lastModified,
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: {
          languages: {
            en: page.path ? `${baseUrl}/en/${page.path}` : `${baseUrl}/en`,
            fr: page.path ? `${baseUrl}/fr/${page.path}` : `${baseUrl}/fr`,
            "x-default": page.path ? `${baseUrl}/${page.path}` : baseUrl,
          },
        },
      });
    }
  }

  // Documentation pages for each language
  for (const slug of docPages) {
    for (const lang of languages) {
      const docPath = slug ? `docs/${slug}` : "docs";
      const url = `${baseUrl}/${lang}/${docPath}`;

      // Determine priority based on page type
      let priority = 0.7;
      if (slug === "") {
        priority = 0.9; // docs index
      } else if (slug === "installation") {
        priority = 0.85; // installation is important
      } else if (slug.startsWith("guides/")) {
        priority = 0.75; // guides
      }

      entries.push({
        url,
        lastModified,
        changeFrequency: "weekly",
        priority,
        alternates: {
          languages: {
            en: `${baseUrl}/en/${docPath}`,
            fr: `${baseUrl}/fr/${docPath}`,
            "x-default": `${baseUrl}/${docPath}`,
          },
        },
      });
    }
  }

  return entries;
}
