import { source } from "@/lib/source";
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXContent } from "mdx/types";
import { BreadcrumbSchema, ArticleSchema } from "@/components/JsonLd";

interface ExtendedPageData {
  title?: string;
  description?: string;
  body: MDXContent;
  toc: { title: string; url: string; depth: number }[];
}

const baseUrl = "https://distill-mcp.com";

// Generate breadcrumb items from slug
function generateBreadcrumbs(
  slug: string[] | undefined,
  lang: string,
  title: string
): Array<{ name: string; url: string }> {
  const breadcrumbs: Array<{ name: string; url: string }> = [
    { name: "Home", url: `${baseUrl}/${lang}` },
    { name: "Documentation", url: `${baseUrl}/${lang}/docs` },
  ];

  if (slug && slug.length > 0) {
    // Handle nested paths like guides/claude-code
    if (slug[0] === "guides" && slug.length > 1) {
      breadcrumbs.push({
        name: "Guides",
        url: `${baseUrl}/${lang}/docs/guides`,
      });
    }

    // Add the current page
    breadcrumbs.push({
      name: title,
      url: `${baseUrl}/${lang}/docs/${slug.join("/")}`,
    });
  }

  return breadcrumbs;
}

export default async function Page(props: {
  params: Promise<{ slug?: string[]; lang: string }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) notFound();

  const data = page.data as unknown as ExtendedPageData;
  const MDX = data.body;

  const breadcrumbs = generateBreadcrumbs(
    params.slug,
    params.lang,
    data.title || "Documentation"
  );

  const currentUrl = params.slug
    ? `${baseUrl}/${params.lang}/docs/${params.slug.join("/")}`
    : `${baseUrl}/${params.lang}/docs`;

  return (
    <>
      <BreadcrumbSchema items={breadcrumbs} />
      <ArticleSchema
        title={data.title || "Documentation"}
        description={data.description || "Distill documentation"}
        url={currentUrl}
      />
      <DocsPage toc={data.toc} tableOfContent={{ style: "clerk" }}>
        <DocsTitle>{data.title}</DocsTitle>
        <DocsDescription>{data.description}</DocsDescription>
        <DocsBody>
          <MDX components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[]; lang: string }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) notFound();

  const slug = params.slug ? params.slug.join("/") : "";
  const docPath = slug ? `docs/${slug}` : "docs";

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: `/${params.lang}/${docPath}`,
      languages: {
        en: `/en/${docPath}`,
        fr: `/fr/${docPath}`,
        "x-default": `/${docPath}`,
      },
    },
  };
}
