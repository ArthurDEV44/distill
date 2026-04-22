import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import Image from "next/image";
import { source } from "@/lib/source";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLanguageSwitcher } from "@/components/DocsLanguageSwitcher";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <RootProvider
      i18n={{
        locale: lang,
        locales: [
          { locale: "en", name: "English" },
          { locale: "fr", name: "Français" },
        ],
      }}
    >
      <DocsLayout
        tree={source.pageTree[lang]!}
        nav={{
          title: (
            <>
              <Image
                src="/distill-logo.png"
                alt="Distill"
                width={24}
                height={24}
                className="rounded"
              />
              Distill
            </>
          ),
          url: `/${lang === "en" ? "" : lang}`,
          children: <DocsLanguageSwitcher />,
        }}
        sidebar={{
          defaultOpenLevel: 1,
        }}
        links={[
          {
            text: "GitHub",
            url: "https://github.com/ArthurDEV44/distill",
            external: true,
          },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
