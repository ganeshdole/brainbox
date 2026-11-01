// The shape of every long-form page on the site: install guides,
// integrations, comparisons and templates. Pages are data, so a new one is an
// entry in a content file, and content.test.ts holds every entry to the same
// rules (lengths, links, code that matches the packages).
//
// Text takes `backticks` for inline code and [label](/path) for links (see
// RichText).

export type Lang =
  | "astro"
  | "blade"
  | "django"
  | "erb"
  | "html"
  | "md"
  | "php"
  | "python"
  | "sh"
  | "svelte"
  | "ts"
  | "tsx"
  | "vue"
  | "yaml"

export type Block =
  | { p: string }
  | { code: string; lang: Lang; file?: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }

export interface Section {
  title: string
  blocks: Block[]
}

export interface Link {
  label: string
  href: string
}

export interface Article {
  /** Root-relative, e.g. /install/nextjs. */
  path: string
  /** Short, for lists and breadcrumbs: "Next.js", "Marker.io". */
  name: string
  /** The <title>; " · Brainbox" is added after it. */
  title: string
  /** The meta description, 70 to 160 characters. */
  description: string
  /** The hub it belongs to, shown above the heading. */
  parent: Link
  heading: string
  intro: string[]
  sections: Section[]
  /** For pages that state facts about other products: when they were last
   *  checked, and where. Shown on the page and used as the sitemap's lastmod. */
  checked?: { date: string; sources: Link[] }
  /** More to read, internal pages first. */
  related?: Link[]
}

/** A hub: one page listing a family of articles, e.g. /install. */
export interface Hub {
  path: string
  name: string
  title: string
  description: string
  heading: string
  intro: string[]
  items: { name: string; href: string; summary: string }[]
}
