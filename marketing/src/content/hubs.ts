// The hub pages: one per family of articles, each listing all of it.
import { ALTERNATIVES } from "./alternatives"
import { DESTINATIONS } from "./destinations"
import { FRAMEWORK_GUIDES } from "./frameworks"
import { TEMPLATES } from "./templates"
import type { Article, Hub } from "./types"

const items = (articles: readonly Article[]) =>
  articles.map((a) => ({ name: a.name, href: a.path, summary: a.description }))

export const HUBS: readonly Hub[] = [
  {
    path: "/install",
    name: "Install guides",
    title: "Bug report widget install guides",
    description:
      "Add Brainbox's bug report widget to Next.js, React, Vue, Nuxt, SvelteKit, Astro, Angular, Rails, Laravel, Django, WordPress or any page with one script tag.",
    heading: "Add Brainbox to your app",
    intro: [
      "The widget is one script tag, the same in every framework, or React components if you'd rather. Each guide shows where it goes in that framework, how to say who is signed in, and what to know about that framework in particular.",
    ],
    items: items(FRAMEWORK_GUIDES),
  },
  {
    path: "/integrations",
    name: "Integrations",
    title: "Integrations: GitHub Issues and Azure DevOps",
    description:
      "Brainbox files every report from your users in the tracker you already use, GitHub Issues or Azure DevOps, with the screenshot and the console errors.",
    heading: "Reports, filed where you already work",
    intro: [
      "Every report lands in your Brainbox inbox. Connect a tracker and each one is also filed there as it arrives, with the marked-up screenshot, the user's words, the browser and the console errors.",
    ],
    items: items(DESTINATIONS),
  },
  {
    path: "/alternatives",
    name: "Alternatives",
    title: "Bug reporting tool alternatives compared",
    description:
      "Brainbox compared with Marker.io, Jam, Userback, BugHerd, Usersnap, Gleap, Sentry User Feedback and Ybug: pricing, capture, integrations, and when each fits.",
    heading: "Brainbox compared",
    intro: [
      "How Brainbox compares with other bug-reporting and feedback tools, row by row, from their own pricing and docs pages. Each page also says when the other tool is the better choice.",
    ],
    items: items(ALTERNATIVES),
  },
  {
    path: "/templates",
    name: "Templates",
    title: "Free bug report and feature request templates",
    description:
      "Free templates to copy: a bug report template with examples, GitHub issue forms for bugs and feature requests, and a feature request template.",
    heading: "Templates for bug reports and feature requests",
    intro: ["Copy them into your tracker, your repo or your support macros. Free, and no sign-up."],
    items: items(TEMPLATES),
  },
]
