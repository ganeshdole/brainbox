// Every article on the site, with the links between them filled in.
import { ALTERNATIVES } from "./alternatives"
import { DESTINATIONS } from "./destinations"
import { FRAMEWORK_GUIDES } from "./frameworks"
import { TEMPLATES } from "./templates"
import type { Article, Link } from "./types"

export { HUBS } from "./hubs"

const link = (a: Article, label = a.name): Link => ({ label, href: a.path })
const others = (list: readonly Article[], self: Article) => list.filter((a) => a !== self)

const NPM: Link[] = [
  { label: "Widget reference on npm", href: "https://www.npmjs.com/package/@ganeshdole/brainbox-widget" },
  { label: "Self-hosting guide", href: "https://github.com/ganeshdole/brainbox/blob/main/docs/self-hosting.md" },
]

export const ARTICLES: readonly Article[] = [
  ...FRAMEWORK_GUIDES.map((a) => ({
    ...a,
    related: [
      ...DESTINATIONS.map((d) => link(d, `Send reports to ${d.name}`)),
      ...others(FRAMEWORK_GUIDES, a).map((g) => link(g, `${g.name} guide`)),
      ...NPM,
    ],
  })),
  ...DESTINATIONS.map((a) => ({
    ...a,
    related: [
      ...others(DESTINATIONS, a).map((d) => link(d)),
      ...FRAMEWORK_GUIDES.map((g) => link(g, `Install on ${g.name}`)),
      ...TEMPLATES.map((t) => link(t, `${t.name} template`)),
    ],
  })),
  ...ALTERNATIVES,
  ...TEMPLATES.map((a) => ({
    ...a,
    related: [
      ...others(TEMPLATES, a).map((t) => link(t, `${t.name} template`)),
      ...DESTINATIONS.map((d) => link(d, `Reports filed in ${d.name}`)),
      { label: "Install guides", href: "/install" },
    ],
  })),
]
