// "<Product> alternative" pages at /alternatives/<slug>: Brainbox beside
// another bug-reporting or feedback tool, row by row. Their facts come from
// their own sites on CHECKED (sources listed on each page); ours come from the
// code and the plan catalogue, so a price change here can't drift from the
// pricing section. Say what they do better as plainly as what we do.

import { BUSINESS, OVERAGE_CENTS_PER_TICKET, PRO, formatUsd, monthlyEquivalentCents } from "@/lib/pricing"
import type { Article, Link } from "./types"

export const CHECKED = "2026-11-01"

const parent = { label: "Alternatives", href: "/alternatives" }

const n = (count: number) => count.toLocaleString("en-US")

/** Brainbox's side of every table. */
const BRAINBOX = {
  pricing: `By reports: ${n(PRO.ticketsPerMonth)} a month on Pro, ${n(BUSINESS.ticketsPerMonth)} on Business, then ${OVERAGE_CENTS_PER_TICKET}¢ each. Unlimited seats, projects and pageviews.`,
  from: `${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly, ${formatUsd(PRO.monthlyCents)} monthly`,
  free: "No free plan; 60-day money-back guarantee",
  reporting: "An in-app widget; your users need no account or extension",
  capture: "Marked-up screenshot, or a recording of the page as they used it (session replay, up to a minute); voice note with transcript",
  console: "Yes",
  network: "No",
  github: "Yes, every plan",
  azure: "Yes, every plan",
  features: "Yes: requests collected and grouped into features; no public voting board",
  selfHost: "Yes, source-available ([self-hosting guide](https://github.com/ganeshdole/brainbox/blob/main/docs/self-hosting.md))",
  mobile: "No: web apps only",
}

interface Them {
  pricing: string
  from: string
  free: string
  reporting: string
  capture: string
  console: string
  network: string
  github: string
  azure: string
  features: string
  selfHost: string
  mobile: string
}

const ROWS: [string, keyof Them][] = [
  ["What the price scales with", "pricing"],
  ["Cheapest paid plan", "from"],
  ["Free plan", "free"],
  ["How users report", "reporting"],
  ["What a report captures", "capture"],
  ["Console errors", "console"],
  ["Network requests", "network"],
  ["GitHub Issues", "github"],
  ["Azure DevOps", "azure"],
  ["Feature requests", "features"],
  ["Self-hosting", "selfHost"],
  ["Mobile app SDKs", "mobile"],
]

interface Competitor {
  slug: string
  name: string
  /** The <title>, when the usual one runs past 60 characters. */
  title?: string
  /** In their words, from their own site. */
  quote: string
  summary: string
  them: Them
  /** Where they are the better pick: be specific and fair. */
  pickThem: string[]
  pickBrainbox: string[]
  /** What paying looks like for a typical team, worked from both price lists. */
  cost: string
  sources: Link[]
}

function article(c: Competitor, all: readonly Competitor[]): Article {
  return {
    path: `/alternatives/${c.slug}`,
    name: c.name,
    parent,
    title: c.title ?? `${c.name} alternative: Brainbox vs ${c.name}`,
    description: `Brainbox vs ${c.name}, side by side: pricing, how users report, what a report captures, GitHub and Azure DevOps, and when each is the better pick.`,
    heading: `Brainbox vs ${c.name}`,
    intro: [
      `${c.name} calls itself “${c.quote}” ${c.summary}`,
      "Brainbox is a bug-report widget for web apps: your users point at what broke and say what happened, and you get a report you can start on, in your inbox and in GitHub or Azure DevOps. Here is how the two compare, including where " +
        c.name +
        " is the better choice.",
    ],
    checked: { date: CHECKED, sources: c.sources },
    sections: [
      {
        title: "Side by side",
        blocks: [
          {
            table: {
              head: ["", "Brainbox", c.name],
              rows: ROWS.map(([label, key]) => [label, BRAINBOX[key], c.them[key]]),
            },
          },
        ],
      },
      { title: `When ${c.name} is the better choice`, blocks: [{ list: c.pickThem }] },
      { title: "When Brainbox is the better choice", blocks: [{ list: c.pickBrainbox }] },
      { title: "What it costs", blocks: [{ p: c.cost }] },
    ],
    related: [
      ...all.filter((o) => o.slug !== c.slug).map((o) => ({ label: `Brainbox vs ${o.name}`, href: `/alternatives/${o.slug}` })),
      { label: "Install guides", href: "/install" },
    ],
  }
}

const COMPETITORS: Competitor[] = [
  {
    slug: "marker-io",
    name: "Marker.io",
    quote: "the top-rated website feedback tool.",
    summary:
      "It is built around website feedback: QA and user-acceptance testing, and agencies collecting comments from clients, through a widget, a CMS plugin or a browser extension.",
    them: {
      pricing: "Team members (3 on Starter, 15 on Team), projects and monitored pages; guests and reporters are free",
      from: "$39/mo billed yearly ($59 monthly), Starter",
      free: "No; 15-day trial",
      reporting: "Widget, CMS plugin or browser extension; reporters need no account",
      capture: "Annotated screenshot; session replay of the last 2.5 minutes on Team and up; no screen recording",
      console: "Team plan and up",
      network: "Team plan and up",
      github: "Yes, every plan",
      azure: "Business plan only (custom pricing)",
      features: "Not stated",
      selfHost: "Not stated",
      mobile: "Not stated; the widget works in mobile browsers",
    },
    pickThem: [
      "You review websites for clients, and want a CMS plugin, guest reporters and agency pricing built for that.",
      "Your team files feedback with a browser extension while testing, rather than collecting it from users inside the app.",
      "You need Jira, Linear, Trello, Asana or ClickUp, which it connects to and Brainbox doesn't.",
      "You want its website-monitoring add-on in the same tool.",
    ],
    pickBrainbox: [
      "Your users are the ones reporting, from inside your web app, and you want who they are and your app's details on each report.",
      "You use Azure DevOps: Brainbox files work items on every plan, where Marker.io keeps it to its custom-priced Business plan.",
      "You want console errors and replay without moving up a plan, and a recording or voice note when a screenshot isn't enough.",
      "You'd rather add people for free: Brainbox charges for reports, not seats.",
      "You want to be able to run it yourself.",
    ],
    cost: `For a team of ten that wants console logs and session replay, Marker.io's Team plan is $149/mo billed yearly. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly for up to ${n(PRO.ticketsPerMonth)} reports a month, with every teammate included. If you get very few reports and need only screenshots, Marker.io's Starter at $39/mo covers three members.`,
    sources: [
      { label: "Marker.io pricing", href: "https://marker.io/pricing" },
      { label: "Marker.io features", href: "https://marker.io/features" },
      { label: "Marker.io integrations", href: "https://marker.io/integrations" },
      { label: "Marker.io help: recording videos", href: "https://help.marker.io/en/articles/952693-how-to-record-videos-or-gifs" },
    ],
  },
  {
    slug: "jam",
    name: "Jam",
    quote: "Screen recorder for bugs, feedback, and ideas.",
    summary:
      "It is mostly for teams reporting bugs to each other: a browser extension (and Mac and iOS apps) records the screen with the console and network logs, and Recording Links let a customer record without installing anything.",
    them: {
      pricing: "Creator seats; viewers are free",
      from: "$14 per creator a month, billed yearly (Team)",
      free: "Yes: 30 Jams a month, up to 5 creators",
      reporting: "Browser extension for your team; Recording Links for customers, with no account or install",
      capture: "Screenshot, video, the last 2 minutes as Instant Replay, optional microphone",
      console: "Yes",
      network: "Yes",
      github: "Yes",
      azure: "Yes",
      features: "Not stated",
      selfHost: "Not stated",
      mobile: "No SDK; an iOS recorder app",
    },
    pickThem: [
      "Your developers, QA and PMs report bugs to each other while testing, and an extension in their own browser suits them.",
      "You need network requests in the report: Jam captures them, Brainbox doesn't.",
      "You want a free plan to start, or Jam's long list of integrations (Jira, Linear, Slack, Notion and more).",
      "You'll send a customer a link to record one problem, rather than keep a widget in your app.",
    ],
    pickBrainbox: [
      "You want every user able to report, any time, from a button in your app, with no link to send first.",
      "You want to know who sent each report and your own details about their account, attached automatically.",
      "Your team is large: Brainbox has no seats, so everyone who reads reports is free.",
      "You also want feature requests from the same widget, grouped by what's being asked for.",
      "You want to run it yourself.",
    ],
    cost: `Jam is free for up to five creators and 30 Jams a month; its Team plan is $14 per creator a month, so ten creators come to $140 a month. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly for up to ${n(PRO.ticketsPerMonth)} reports, whatever the size of the team.`,
    sources: [
      { label: "Jam pricing", href: "https://jam.dev/pricing" },
      { label: "Jam docs: Recording Links", href: "https://jam.dev/docs/recording-links.md" },
      { label: "Jam docs: integrations", href: "https://jam.dev/docs/integrations-overview" },
      { label: "Jam: Azure DevOps", href: "https://jam.dev/integrations/azure" },
    ],
  },
  {
    slug: "userback",
    name: "Userback",
    quote: "Centralize your user feedback. Build with confidence.",
    summary:
      "It is a broad feedback platform: a website widget and browser extension for bug reports, plus surveys, session replay and a feature portal with voting and a public roadmap.",
    them: {
      pricing: "Seats and sites (Team: 5 seats, 5 sites); feedback volume is unlimited",
      from: "$39/mo billed yearly ($49 monthly), Team",
      free: "Yes: 2 seats, 2 sites, feedback kept 7 days",
      reporting: "Widget, including for visitors without logins, or a browser extension",
      capture: "Annotated screenshot, video recording; session replay on Business and up",
      console: "Business plan and up",
      network: "Business plan and up",
      github: "Yes",
      azure: "Yes",
      features: "Yes: voting portal and public roadmap (add-on on Team, included from Business)",
      selfHost: "Not stated",
      mobile: "Yes: iOS, Android and React Native, on its higher plans",
    },
    pickThem: [
      "You want a public feature-voting board and roadmap: Brainbox collects requests but doesn't publish them yet.",
      "You also need surveys or NPS in the same product.",
      "You have mobile apps too, and want one tool for web and native.",
      "You want a free plan to try it with a small team.",
    ],
    pickBrainbox: [
      "You want console errors and replay on the entry plan, not from Business up.",
      "You'd rather not count seats or sites: Brainbox has unlimited projects and teammates on every plan.",
      "You want voice notes, transcribed, beside the screenshot.",
      "You want to be able to run it yourself.",
    ],
    cost: `Userback's Team plan is $39/mo billed yearly for 5 seats and 5 sites; console and network logs and session replay start at Business, $89/mo billed yearly for 15 seats. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly with all of that, for up to ${n(PRO.ticketsPerMonth)} reports a month.`,
    sources: [
      { label: "Userback pricing", href: "https://userback.io/pricing/" },
      { label: "Userback features", href: "https://userback.io/features/" },
      { label: "Userback integrations", href: "https://userback.io/integrations/" },
      { label: "Userback docs: iOS and Android", href: "https://docs.userback.io/docs/ios-android" },
    ],
  },
  {
    slug: "bugherd",
    name: "BugHerd",
    quote: "Getting client feedback on websites – made ridiculously easy.",
    summary:
      "It is made for agencies and web teams collecting client feedback: clients pin comments to the page, and the team works them on a kanban board.",
    them: {
      pricing: "Members (5 on Standard) and storage; guests and projects unlimited",
      from: "$42/mo billed yearly ($50 monthly), Standard",
      free: "No; free trial and 60-day money-back guarantee",
      reporting: "Clients review through a link, without logging in; JavaScript snippet or extension",
      capture: "Pinned, annotated screenshot; video feedback with audio up to a minute; no session replay of its own",
      console: "Not stated",
      network: "Not stated",
      github: "Standard plan and up",
      azure: "Not listed",
      features: "Not stated",
      selfHost: "Not stated",
      mobile: "Not stated",
    },
    pickThem: [
      "You build websites for clients and want them pinning comments while the site is in review.",
      "You want a kanban board for the feedback inside the same tool.",
      "Your team runs on Jira, Asana, ClickUp or Monday, which it connects to on its Premium plan.",
    ],
    pickBrainbox: [
      "You run a web app and the reports come from its users, not from clients reviewing a build.",
      "You need console errors and a replay of what the user did.",
      "You use Azure DevOps, which BugHerd doesn't list.",
      "You want everyone on the team without paying per member.",
    ],
    cost: `BugHerd's Standard plan is $42/mo billed yearly for five members, with extra members charged per seat. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly with unlimited teammates, for up to ${n(PRO.ticketsPerMonth)} reports a month.`,
    sources: [
      { label: "BugHerd pricing", href: "https://bugherd.com/pricing" },
      { label: "BugHerd features", href: "https://bugherd.com/features" },
      { label: "BugHerd integrations", href: "https://bugherd.com/integrations" },
    ],
  },
  {
    slug: "usersnap",
    name: "Usersnap",
    quote: "Put quality behind every product decision.",
    summary:
      "It is a feedback platform for product teams: an in-app widget and browser extensions for bug reports, surveys, and feature-request boards with roadmaps.",
    them: {
      pricing: "Projects, page views and feedback channels; seats unlimited from Growth",
      from: "€49/mo, Starter (2 seats, 2 projects)",
      free: "No free plan stated",
      reporting: "In-app widget, or Chrome and Firefox extensions",
      capture: "Annotated screenshot; screen recording with audio up to 3 minutes, on desktop and not in Safari",
      console: "Yes",
      network: "Not stated",
      github: "Yes",
      azure: "Yes, with two-way sync",
      features: "Yes: upvote boards and roadmaps",
      selfHost: "Not stated",
      mobile: "iOS and Android SDKs in beta, on Premium and up",
    },
    pickThem: [
      "You want two-way sync with Jira, Linear or Azure DevOps, so status changes come back.",
      "You want feature-request boards with voting and a roadmap you can share.",
      "You run surveys and want them in the same product as bug reports.",
    ],
    pickBrainbox: [
      "You want to pay for reports rather than projects and page views: Brainbox has unlimited projects and pageviews.",
      "You want recordings in every browser, Safari included: Brainbox records the page itself rather than a video of the screen.",
      "You want voice notes with a transcript.",
      "You want to be able to run it yourself.",
    ],
    cost: `Usersnap's Starter is €49 a month for 2 seats and 2 projects; Growth, with unlimited seats and 10 projects, is €129. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly, or ${formatUsd(PRO.monthlyCents)} monthly, with unlimited seats and projects, for up to ${n(PRO.ticketsPerMonth)} reports a month.`,
    sources: [
      { label: "Usersnap pricing", href: "https://usersnap.com/pricing" },
      { label: "Usersnap features", href: "https://usersnap.com/features" },
      { label: "Usersnap integrations", href: "https://usersnap.com/integrations" },
      { label: "Usersnap help: GitHub", href: "https://help.usersnap.com/docs/github" },
    ],
  },
  {
    slug: "gleap",
    name: "Gleap",
    quote: "the self-improving AI support system.",
    summary:
      "It started as in-app bug reporting and is now a customer-support suite: an SDK for web and mobile with bug reports, live chat, an AI support agent, surveys and a feature-request board.",
    them: {
      pricing: "Monthly active users, AI usage and email volume, not seats",
      from: "$29/mo billed yearly ($35 monthly), Starter: 1 seat, 1 project, no integrations",
      free: "No; 7-day trial",
      reporting: "In-app SDK widget; shake to report on mobile",
      capture: "Annotated screenshot, screen recording; web session replay from Team",
      console: "Yes",
      network: "Yes, the last 30 requests",
      github: "Team plan and up",
      azure: "Team plan and up",
      features: "Yes: voting and a public roadmap, from Team",
      selfHost: "Not stated",
      mobile: "Yes: iOS, Android, React Native, Flutter and more",
    },
    pickThem: [
      "You want support and bug reporting in one place: live chat, a help center and an AI agent beside the reports.",
      "You ship mobile apps and want the same reporting there, shake-to-report included.",
      "You need network requests in the report.",
      "You want a public roadmap with voting.",
    ],
    pickBrainbox: [
      "You want bug reports, not a support desk, and a price that reflects that.",
      "You want GitHub or Azure DevOps on the entry plan: Gleap's Starter has no integrations, and Team is $149/mo billed yearly.",
      "You want the whole team in it: Gleap's Starter has one seat.",
      "You want to be able to run it yourself.",
    ],
    cost: `Gleap's Starter is $29/mo billed yearly with one seat and no integrations; Team, with integrations and replay, is $149. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly with GitHub, Azure DevOps, replay and unlimited teammates, for up to ${n(PRO.ticketsPerMonth)} reports a month.`,
    sources: [
      { label: "Gleap pricing", href: "https://gleap.ai/pricing" },
      { label: "Gleap: in-app bug reporting", href: "https://gleap.ai/product/in-app-bug-reporting" },
      { label: "Gleap integrations", href: "https://gleap.ai/integrations" },
      { label: "Gleap docs", href: "https://docs.gleap.ai/" },
    ],
  },
  {
    slug: "sentry-user-feedback",
    name: "Sentry User Feedback",
    title: "Brainbox vs Sentry User Feedback",
    quote: "collect user feedback from anywhere inside your application at any time.",
    summary:
      "It is the feedback form in Sentry's JavaScript SDK: a small widget that sends what the user typed, optionally with a screenshot, into Sentry beside your errors and replays.",
    them: {
      pricing: "Sentry's own usage (errors, spans, replays); feedback included",
      from: "Free Developer plan for 1 user; Team $26/mo billed yearly",
      free: "Yes: Developer plan, 1 user",
      reporting: "Embeddable widget, or your own form through the API",
      capture: "Name, email, message, optional screenshot with highlight and hide tools; linked replay if you record them",
      console: "Through Sentry's own error and replay data",
      network: "Through Sentry's replay, if configured",
      github: "Create or link issues from feedback",
      azure: "Yes, through Sentry's Azure DevOps integration",
      features: "Not stated",
      selfHost: "Yes: self-hosted Sentry, under the FSL",
      mobile: "Yes: feedback APIs for Android, Apple, Flutter and React Native",
    },
    pickThem: [
      "You already run Sentry, and want feedback next to the errors and traces you already collect, for little or no extra cost.",
      "You want feedback from your mobile apps too.",
      "A short message, an email and a screenshot are all you need from users.",
    ],
    pickBrainbox: [
      "You want users to show you the problem: mark up the page, record their screen, or talk it through in a voice note.",
      "You want each report filed on its own as a GitHub issue or Azure DevOps work item, without an alert rule in between.",
      "You want feature requests collected and grouped, separately from bugs.",
      "You don't run Sentry, or your error budget is spoken for.",
    ],
    cost: `If you're already paying for Sentry, its feedback widget costs nothing more. Without Sentry, its Team plan starts at $26/mo billed yearly and is priced on errors and replays. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly for up to ${n(PRO.ticketsPerMonth)} reports a month; the two work side by side.`,
    sources: [
      { label: "Sentry docs: User Feedback", href: "https://docs.sentry.io/platforms/javascript/user-feedback/" },
      { label: "Sentry docs: User Feedback setup", href: "https://docs.sentry.io/product/user-feedback/setup/" },
      { label: "Sentry docs: Azure DevOps", href: "https://docs.sentry.io/organization/integrations/source-code-mgmt/azure-devops/" },
      { label: "Sentry pricing", href: "https://sentry.io/pricing/" },
      { label: "Self-hosted Sentry", href: "https://develop.sentry.dev/self-hosted/" },
    ],
  },
  {
    slug: "ybug",
    name: "Ybug",
    quote: "Effortless visual feedback for websites and web apps.",
    summary:
      "It is a straightforward visual feedback widget: users mark up a screenshot and it goes to your tracker, with npm packages for React, Vue and Angular.",
    them: {
      pricing: "Members and projects; feedback and reporters unlimited",
      from: "€10/mo billed yearly (€13 monthly), Basic: 3 members, 3 projects",
      free: "Yes: 1 member, 1 project, 50 screenshots a month",
      reporting: "Widget, or a browser extension; no sign-in for reporters",
      capture: "Annotated screenshot; video recording from Startup",
      console: "Limited on Basic, full from Startup",
      network: "From Startup",
      github: "Yes; one integration per project on Basic",
      azure: "Yes; one integration per project on Basic",
      features: "No; public roadmap marked as coming",
      selfHost: "Not stated",
      mobile: "Not stated",
    },
    pickThem: [
      "You want the cheapest way in: a free plan, and Basic at €10 a month.",
      "Screenshots with annotations are all you need, for a small team.",
      "You want Jira, Linear, Trello or one of its 20-plus other integrations.",
    ],
    pickBrainbox: [
      "You want screen recording, session replay and full console errors on the entry plan.",
      "You want voice notes, and feature requests collected beside bug reports.",
      "You want unlimited projects and teammates: Ybug counts both.",
      "You want to be able to run it yourself.",
    ],
    cost: `Ybug's Basic is €10/mo billed yearly for 3 members and 3 projects, and Startup, with video and network logs, is €23. Brainbox Pro is ${formatUsd(monthlyEquivalentCents(PRO))}/mo billed yearly with everything included, for up to ${n(PRO.ticketsPerMonth)} reports a month. For a small team that only needs screenshots, Ybug costs less.`,
    sources: [
      { label: "Ybug", href: "https://ybug.io/" },
      { label: "Ybug pricing", href: "https://ybug.io/pricing" },
      { label: "Ybug integrations", href: "https://ybug.io/integrations" },
    ],
  },
]

export const ALTERNATIVES: readonly Article[] = COMPETITORS.map((c) => article(c, COMPETITORS))
