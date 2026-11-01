// Every page the site serves. The client picks one by path, and the build
// prerenders each to its own HTML file with its own <head> and lists it in
// sitemap.xml (scripts/prerender.mjs). A page that isn't here is the 404.
import type { ReactNode } from "react"
import { ArticlePage, HubPage } from "@/components/site/article"
import { Home } from "@/components/site/home"
import { NotFound } from "@/components/site/not-found"
import { ARTICLES, HUBS } from "@/content"
import { BUSINESS, PRO } from "@/lib/pricing"
import { breadcrumbs, normalizePath, SITE_URL, type PageMeta } from "@/lib/seo"

export interface Page extends PageMeta {
  render: () => ReactNode
}

const HOME_DESCRIPTION =
  "Brainbox is a widget for your web app. Users point at what broke and say what happened; you get a report with the screenshot, console errors and environment, filed in GitHub or Azure DevOps."

const product = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Brainbox",
  url: `${SITE_URL}/`,
  description: HOME_DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  offers: [PRO, BUSINESS].map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    price: (plan.monthlyCents / 100).toFixed(2),
    priceCurrency: "USD",
  })),
}

const home = { name: "Brainbox", path: "/" }

export const PAGES: readonly Page[] = [
  {
    path: "/",
    title: "Brainbox · Bug reports from your users that you can start on",
    description: HOME_DESCRIPTION,
    jsonLd: [product],
    render: () => <Home />,
  },
  ...HUBS.map(
    (hub): Page => ({
      path: hub.path,
      title: `${hub.title} · Brainbox`,
      description: hub.description,
      jsonLd: [breadcrumbs([home, { name: hub.name, path: hub.path }])],
      render: () => <HubPage hub={hub} />,
    }),
  ),
  ...ARTICLES.map(
    (article): Page => ({
      path: article.path,
      title: `${article.title} · Brainbox`,
      description: article.description,
      lastmod: article.checked?.date,
      jsonLd: [
        breadcrumbs([
          home,
          { name: article.parent.label, path: article.parent.href },
          { name: article.name, path: article.path },
        ]),
      ],
      render: () => <ArticlePage article={article} />,
    }),
  ),
]

/** Written to dist/404.html, which Vercel serves with a 404 for any unknown path. */
export const NOT_FOUND: Page = {
  path: "/404",
  title: "Page not found · Brainbox",
  description: "There is no page at this address.",
  render: () => <NotFound />,
}

export function findPage(pathname: string): Page {
  const path = normalizePath(pathname)
  return PAGES.find((p) => p.path === path) ?? NOT_FOUND
}
