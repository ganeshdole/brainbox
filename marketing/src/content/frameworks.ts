// Install guides, one per framework at /install/<slug>. Each says where the
// tag goes in that framework, how to tell Brainbox who is signed in there, and
// what is particular about it. content.test.ts checks every snippet against
// the packages and the script tag's documented attributes.

import { ENDPOINT, PROJECT_KEY, TAG, WIDGET_SRC, WINDOW_TYPES, tagLines } from "./snippets"
import type { Article, Section } from "./types"

const parent = { label: "Install guides", href: "/install" }

// Said the same way on every guide that has these steps.
const ownButton = (where: string): Section => ({
  title: "Your own button",
  blocks: [
    {
      p: `Any element marked \`data-brainbox\` opens the widget, ${where}. \`screenshot\` goes straight to marking up the page, \`record\` to a recording of the page and \`feature\` to a feature request; an empty value opens the chooser. Clicks are delegated, so elements rendered later work too.`,
    },
    { code: `<button data-brainbox="screenshot">Report a bug</button>\n<button data-brainbox="feature">Request a feature</button>`, lang: "html" },
    {
      p: "From code, `window.Brainbox.open()` shows the chooser and `window.Brainbox.start(\"feature\")` goes straight to one flow. To hide our floating button and keep only yours, add `data-mode=\"mount\"` to the tag.",
    },
  ],
})

const privacy: Section = {
  title: "Passwords and personal data",
  blocks: [
    {
      p: "Typed values are always masked in recordings, so passwords, emails and card numbers never leave the browser as plain text. Add the `rr-block` or `rr-mask` class to anything else you want kept out.",
    },
  ],
}

const types = (file: string): Section => ({
  title: "TypeScript",
  blocks: [
    { p: "`window.Brainbox` comes from a script tag, so TypeScript doesn't know it. Declare it once:" },
    { code: WINDOW_TYPES, lang: "ts", file },
  ],
})

const nextjs: Article = {
  path: "/install/nextjs",
  name: "Next.js",
  parent,
  title: "Add a bug report widget to Next.js",
  description:
    "Add Brainbox to a Next.js app with next/script or React components. Users mark what broke; you get a screenshot, console errors and the browser.",
  heading: "Bug reports from your Next.js app",
  intro: [
    "Brainbox puts a feedback button in your app. A user marks what broke on a screenshot, or records what they did, and says what happened. You get a report with the page, the browser, the viewport and the console errors, in your Brainbox inbox and in [GitHub Issues](/integrations/github-issues) or [Azure DevOps](/integrations/azure-devops) if you connect them.",
    "There are two ways in. The script tag needs nothing installed. The React components know who is signed in, so every report says who sent it.",
  ],
  sections: [
    {
      title: "The script tag, in your root layout",
      blocks: [
        {
          p: "Add it once in `app/layout.tsx` and it is on every page. Your project key is in the dashboard; it is public by design, since it ships in your HTML.",
        },
        {
          file: "app/layout.tsx",
          lang: "tsx",
          code: `import Script from "next/script"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="${WIDGET_SRC}"
          data-project="${PROJECT_KEY}"
          data-endpoint="${ENDPOINT}"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}`,
        },
        {
          p: "`afterInteractive` loads it once the page is interactive, so it never holds up your first render. The launcher is all that loads up front: the code that takes screenshots and recordings is fetched only when someone starts a report.",
        },
      ],
    },
    {
      title: "On the Pages Router",
      blocks: [
        { p: "The same `<Script>` goes in `pages/_app.tsx`, beside your page component." },
        {
          file: "pages/_app.tsx",
          lang: "tsx",
          code: `import type { AppProps } from "next/app"
import Script from "next/script"

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="${WIDGET_SRC}"
        data-project="${PROJECT_KEY}"
        data-endpoint="${ENDPOINT}"
        strategy="afterInteractive"
      />
    </>
  )
}`,
        },
      ],
    },
    {
      title: "React components, with the signed-in user",
      blocks: [
        { p: "Install the widget and the two packages it sits on. They need React 19, which Next.js 15 and later use." },
        { code: "npm install @ganeshdole/brainbox-widget @ganeshdole/brainbox-react @ganeshdole/brainbox-core", lang: "sh" },
        {
          p: "The provider and the widget are client components, so they live in a file of their own marked `\"use client\"`. Make the transport once, outside render: a new transport means a new Brainbox.",
        },
        {
          file: "app/feedback.tsx",
          lang: "tsx",
          code: `"use client"

import type { ReactNode } from "react"
import { brainboxTransport } from "@ganeshdole/brainbox-core"
import { BrainboxProvider } from "@ganeshdole/brainbox-react"
import { BrainboxWidget } from "@ganeshdole/brainbox-widget"

const transport = brainboxTransport({
  endpoint: "${ENDPOINT}",
  projectKey: "${PROJECT_KEY}",
})

type User = { id: string; email: string; name: string }

export function Feedback({ user, children }: { user: User | null; children: ReactNode }) {
  return (
    <BrainboxProvider transport={transport} identity={user ?? undefined}>
      {children}
      <BrainboxWidget />
    </BrainboxProvider>
  )
}`,
        },
        {
          file: "app/layout.tsx",
          lang: "tsx",
          code: `import { Feedback } from "./feedback"
import { getUser } from "@/lib/auth" // however your app knows who is signed in

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  return (
    <html lang="en">
      <body>
        <Feedback user={user}>{children}</Feedback>
      </body>
    </html>
  )
}`,
        },
      ],
    },
    {
      title: "Server rendering and your styles",
      blocks: [
        {
          p: "Nothing runs on the server. The provider starts Brainbox in an effect and the widget renders nothing until then, so a server-rendered layout stays side-effect free. Your server components pass through `<Feedback>` as children and stay server components.",
        },
        {
          p: "The widget draws into a shadow root on `<body>`, so Tailwind, your CSS reset and your global styles cannot reach it, and it cannot reach them.",
        },
      ],
    },
    {
      title: "Your own button",
      blocks: [
        {
          p: "Under the provider, `useBrainboxWidget()` opens the widget from anywhere. Use `<BrainboxWidget trigger=\"manual\" />` to hide our floating button and keep only yours.",
        },
        {
          file: "app/report-problem-button.tsx",
          lang: "tsx",
          code: `"use client"

import { useBrainboxWidget } from "@ganeshdole/brainbox-widget"

export function ReportProblemButton() {
  const { open } = useBrainboxWidget()
  return <button onClick={open}>Report a problem</button>
}`,
        },
        {
          p: "With the script tag, any element marked `data-brainbox` opens it, even in a server component: `screenshot` goes straight to marking up the page, `record` to a recording and `feature` to a feature request.",
        },
        { code: `<button data-brainbox="screenshot">Report a bug</button>`, lang: "html" },
      ],
    },
    {
      title: "Details from your app",
      blocks: [
        {
          p: "Pass `fields` to the provider for whatever you want beside every report, such as the plan or the account ID. They show in the report under the person who sent it, with your labels, in your order.",
        },
        {
          lang: "tsx",
          code: `<BrainboxProvider
  transport={transport}
  identity={user ?? undefined}
  fields={[
    { label: "Plan", value: account.plan, highlight: true },
    { label: "Account ID", value: account.id, type: "id" },
  ]}
>`,
        },
      ],
    },
    privacy,
    {
      title: "Only on preview deployments",
      blocks: [
        {
          p: "To try it with your team before your users see it, render it only outside production. On Vercel, `VERCEL_ENV` is `production`, `preview` or `development`, and a server component can read it.",
        },
        {
          file: "app/layout.tsx",
          lang: "tsx",
          code: `const showFeedback = process.env.VERCEL_ENV !== "production"

// in RootLayout's <body>:
{showFeedback && (
  <Script
    src="${WIDGET_SRC}"
    data-project="${PROJECT_KEY}"
    data-endpoint="${ENDPOINT}"
    strategy="afterInteractive"
  />
)}`,
        },
      ],
    },
  ],
}

const react: Article = {
  path: "/install/react",
  name: "React",
  parent,
  title: "Add a bug report widget to a React app",
  description:
    "Add Brainbox to a React app as components: a provider, the widget, and hooks for your own buttons. Bug reports arrive with a screenshot and console errors.",
  heading: "Bug reports from your React app",
  intro: [
    "Brainbox ships as React components as well as a script tag. In a React app the components are the better fit: the widget knows who is signed in, opens from your own buttons through a hook, and lets you swap any step of the flow for a component of yours.",
    "This page is for a client-rendered React app, such as one made with Vite. For server rendering see [Next.js](/install/nextjs) or [React Router and Remix](/install/react-router).",
  ],
  sections: [
    {
      title: "Install",
      blocks: [
        { code: "npm install @ganeshdole/brainbox-widget @ganeshdole/brainbox-react @ganeshdole/brainbox-core", lang: "sh" },
        {
          p: "React 19 is a peer dependency: the widget uses your React rather than bundling its own. The first load is a few KB; the screens and their stylesheet are a separate chunk, fetched when the launcher first shows.",
        },
      ],
    },
    {
      title: "Wrap your app",
      blocks: [
        {
          p: "`<BrainboxProvider>` owns one Brainbox. Make its transport once, outside any component: a new transport means a new instance. `identity` is who is reporting; when it changes, the next report says so.",
        },
        {
          file: "src/feedback.tsx",
          lang: "tsx",
          code: `import type { ReactNode } from "react"
import { brainboxTransport } from "@ganeshdole/brainbox-core"
import { BrainboxProvider } from "@ganeshdole/brainbox-react"
import { BrainboxWidget } from "@ganeshdole/brainbox-widget"
import { useCurrentUser } from "./auth" // yours

const transport = brainboxTransport({
  endpoint: "${ENDPOINT}",
  projectKey: "${PROJECT_KEY}",
})

export function Feedback({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  return (
    <BrainboxProvider
      transport={transport}
      identity={user ? { id: user.id, email: user.email, name: user.name } : undefined}
    >
      {children}
      <BrainboxWidget />
    </BrainboxProvider>
  )
}`,
        },
        {
          file: "src/main.tsx",
          lang: "tsx",
          code: `import { createRoot } from "react-dom/client"
import { App } from "./app"
import { Feedback } from "./feedback"

createRoot(document.getElementById("root")!).render(
  <Feedback>
    <App />
  </Feedback>,
)`,
        },
        {
          p: "`<BrainboxWidget />` renders into a shadow root on `<body>` wherever it sits in your tree, so your CSS can't restyle it and no parent's `overflow` or `transform` can clip its panels.",
        },
      ],
    },
    {
      title: "Your own button",
      blocks: [
        {
          p: "`useBrainboxWidget()` works anywhere under the provider. `open()` shows the chooser; `start()` goes straight into a screenshot, a recording or a feature request. Pass `trigger=\"manual\"` to the widget to hide our floating button.",
        },
        {
          file: "src/help-menu.tsx",
          lang: "tsx",
          code: `import { useBrainboxWidget } from "@ganeshdole/brainbox-widget"

export function HelpMenu() {
  const { open, start } = useBrainboxWidget()
  return (
    <menu>
      <button onClick={open}>Report a problem</button>
      <button onClick={() => start("feature")}>Request a feature</button>
    </menu>
  )
}`,
        },
      ],
    },
    {
      title: "Details from your app",
      blocks: [
        {
          p: "`fields` puts your own details beside every report: the plan, the account, the feature flag that was on. `highlight: true` shows a value under the reporter's name; `type: \"id\"` sets it in monospace, and `email`, `phone` and `url` become links.",
        },
        {
          lang: "tsx",
          code: `<BrainboxProvider
  transport={transport}
  identity={identity}
  fields={[
    { label: "Plan", value: account.plan, highlight: true },
    { label: "Account ID", value: account.id, type: "id" },
  ]}
>`,
        },
      ],
    },
    {
      title: "Replace one step with your own",
      blocks: [
        {
          p: "`components` swaps any step of the flow for a component of yours and keeps the rest of ours. Here the composer is yours; marking up, recording and sending stay Brainbox's. Define the object outside render, or the step remounts.",
        },
        {
          lang: "tsx",
          code: `import { useState } from "react"
import { BrainboxWidget, type ComposerProps } from "@ganeshdole/brainbox-widget"

function MyComposer({ screenshotUrl, onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState("")
  return (
    <div>
      {screenshotUrl && <img src={screenshotUrl} alt="" />}
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => onSubmit(text, null)}>Send</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}

const components = { Composer: MyComposer }

<BrainboxWidget components={components} />`,
        },
        {
          p: "Your component renders inside the widget's shadow root, so bring its CSS with it: a `<style>` inside it, or inline styles.",
        },
      ],
    },
    {
      title: "Or the script tag",
      blocks: [
        { p: "No npm install: paste the tag before `</body>` in `index.html`. It brings its own copy of React." },
        { file: "index.html", lang: "html", code: `<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n${tagLines("  ")}\n</body>` },
      ],
    },
    privacy,
  ],
}

const reactRouter: Article = {
  path: "/install/react-router",
  name: "React Router and Remix",
  parent,
  title: "Add a bug report widget to React Router or Remix",
  description:
    "Add Brainbox to a React Router or Remix app: one tag in root.tsx, or React components fed by your root loader. Reports include a screenshot and console errors.",
  heading: "Bug reports from your React Router app",
  intro: [
    "In React Router's framework mode, and in Remix, `app/root.tsx` renders the document for every route, so the widget goes there once. Use the tag for the quickest start, or the React components to say who is signed in.",
  ],
  sections: [
    {
      title: "The tag, in your root Layout",
      blocks: [
        { p: "Put it after `<Scripts />`. It runs once from the server-rendered HTML; hydration leaves it and the widget's element alone." },
        {
          file: "app/root.tsx",
          lang: "tsx",
          code: `import { Links, Meta, Scripts, ScrollRestoration } from "react-router"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <script
          src="${WIDGET_SRC}"
          data-project="${PROJECT_KEY}"
          data-endpoint="${ENDPOINT}"
        />
      </body>
    </html>
  )
}`,
        },
        { p: "On Remix, the imports come from `@remix-run/react` instead; the file is the same." },
      ],
    },
    {
      title: "With the signed-in user",
      blocks: [
        {
          p: "Load the user in the root loader and hand it to the React components. They start in an effect, so server rendering is unaffected.",
        },
        { code: "npm install @ganeshdole/brainbox-widget @ganeshdole/brainbox-react @ganeshdole/brainbox-core", lang: "sh" },
        {
          file: "app/feedback.tsx",
          lang: "tsx",
          code: `import type { ReactNode } from "react"
import { brainboxTransport } from "@ganeshdole/brainbox-core"
import { BrainboxProvider } from "@ganeshdole/brainbox-react"
import { BrainboxWidget } from "@ganeshdole/brainbox-widget"

const transport = brainboxTransport({
  endpoint: "${ENDPOINT}",
  projectKey: "${PROJECT_KEY}",
})

type User = { id: string; email: string; name: string }

export function Feedback({ user, children }: { user: User | null; children: ReactNode }) {
  return (
    <BrainboxProvider transport={transport} identity={user ?? undefined}>
      {children}
      <BrainboxWidget />
    </BrainboxProvider>
  )
}`,
        },
        {
          file: "app/root.tsx",
          lang: "tsx",
          code: `import { Outlet } from "react-router"
import type { Route } from "./+types/root"
import { Feedback } from "./feedback"
import { getUser } from "./auth.server" // yours

export async function loader({ request }: Route.LoaderArgs) {
  return { user: await getUser(request) }
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <Feedback user={loaderData.user}>
      <Outlet />
    </Feedback>
  )
}`,
        },
        { p: "On Remix, read the loader's data with `useLoaderData()` instead of the `loaderData` prop." },
      ],
    },
    {
      title: "Your own button",
      blocks: [
        { p: "Under `<Feedback>`, any route can open the widget with `useBrainboxWidget()`:" },
        {
          lang: "tsx",
          code: `import { useBrainboxWidget } from "@ganeshdole/brainbox-widget"

export function ReportProblemButton() {
  const { start } = useBrainboxWidget()
  return <button onClick={() => start("screenshot")}>Report a problem</button>
}`,
        },
      ],
    },
    privacy,
  ],
}

const vue: Article = {
  path: "/install/vue",
  name: "Vue",
  parent,
  title: "Add a bug report widget to a Vue app",
  description:
    "Add Brainbox to a Vue 3 app: one script tag in index.html, then say who is signed in from your auth store. Reports include a screenshot and console errors.",
  heading: "Bug reports from your Vue app",
  intro: [
    "Brainbox's widget is a script tag that works the same in any framework, Vue included. It draws into a shadow root of its own, so it never touches your components or your styles, and Vue Router's navigation leaves it alone.",
  ],
  sections: [
    {
      title: "The tag, in index.html",
      blocks: [
        { p: "In a Vite project, `index.html` is the page every route renders into. Put the tag before `</body>`." },
        {
          file: "index.html",
          lang: "html",
          code: `<body>\n  <div id="app"></div>\n  <script type="module" src="/src/main.ts"></script>\n${tagLines("  ")}\n</body>`,
        },
        {
          p: "Vite bundles only `type=\"module\"` scripts, so it leaves this one as it is. It runs before your app's module, which means `window.Brainbox` is there by the time your code is.",
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        {
          p: "Call `identify()` when you know the user, and every report after that says who sent it. A watcher on your auth store keeps it current:",
        },
        {
          file: "src/main.ts",
          lang: "ts",
          code: `import { watch } from "vue"
import { useAuthStore } from "./stores/auth" // yours

const auth = useAuthStore()
watch(
  () => auth.user,
  (user) => {
    if (user) window.Brainbox?.identify({ id: user.id, email: user.email, name: user.name })
  },
  { immediate: true },
)`,
        },
      ],
    },
    types("src/brainbox.d.ts"),
    ownButton("anywhere in your templates"),
    privacy,
  ],
}

const nuxt: Article = {
  path: "/install/nuxt",
  name: "Nuxt",
  parent,
  title: "Add a bug report widget to a Nuxt app",
  description:
    "Add Brainbox to Nuxt from nuxt.config, then identify the signed-in user in a client plugin. Bug reports include a screenshot, console errors and the browser.",
  heading: "Bug reports from your Nuxt app",
  intro: [
    "Nuxt writes the document's `<head>` and `<body>` for you, so the tag goes in `nuxt.config.ts` rather than in an HTML file. Nuxt's navigation only re-renders its own root element, so the widget stays put across pages.",
  ],
  sections: [
    {
      title: "The tag, from nuxt.config",
      blocks: [
        {
          p: "`app.head.script` adds a script to every page. `tagPosition: \"bodyClose\"` puts it before `</body>`, and the data attributes are passed through as written.",
        },
        {
          file: "nuxt.config.ts",
          lang: "ts",
          code: `export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          src: "${WIDGET_SRC}",
          "data-project": "${PROJECT_KEY}",
          "data-endpoint": "${ENDPOINT}",
          tagPosition: "bodyClose",
        },
      ],
    },
  },
})`,
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        {
          p: "A client-only plugin (the `.client` suffix) runs in the browser, after the tag. Watch your user and pass it on:",
        },
        {
          file: "app/plugins/brainbox.client.ts",
          lang: "ts",
          code: `export default defineNuxtPlugin(() => {
  const user = useCurrentUser() // your auth composable: a ref to the user, or null
  watch(
    user,
    (u) => {
      if (u) window.Brainbox?.identify({ id: u.id, email: u.email, name: u.name })
    },
    { immediate: true },
  )
})`,
        },
        { p: "On Nuxt 3 the folder is `plugins/` at the project root." },
      ],
    },
    types("app/types/brainbox.d.ts"),
    ownButton("in any component's template"),
    privacy,
  ],
}

const sveltekit: Article = {
  path: "/install/sveltekit",
  name: "SvelteKit",
  parent,
  title: "Add a bug report widget to a SvelteKit app",
  description:
    "Add Brainbox to SvelteKit in src/app.html, then identify the signed-in user from your root layout. Reports arrive with a screenshot and console errors.",
  heading: "Bug reports from your SvelteKit app",
  intro: [
    "`src/app.html` is the page template every route renders into, so the widget goes there once. SvelteKit's client-side navigation only replaces what's inside `%sveltekit.body%`, so the widget stays on the page.",
  ],
  sections: [
    {
      title: "The tag, in src/app.html",
      blocks: [
        { p: "After the element that wraps `%sveltekit.body%`:" },
        {
          file: "src/app.html",
          lang: "html",
          code: `<body data-sveltekit-preload-data="hover">
  <div style="display: contents">%sveltekit.body%</div>
${tagLines("  ")}
</body>`,
        },
        {
          p: "If you set a Content Security Policy in SvelteKit's `csp` option, add `https://app.brainbox.sh` to `script-src` and `connect-src`.",
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        { p: "Return the user from your root layout's `load`, then hand it to the widget in the layout component. Effects only run in the browser." },
        {
          file: "src/routes/+layout.svelte",
          lang: "svelte",
          code: `<script lang="ts">
  let { data, children } = $props()

  $effect(() => {
    const user = data.user
    if (user) window.Brainbox?.identify({ id: user.id, email: user.email, name: user.name })
  })
</script>

{@render children()}`,
        },
      ],
    },
    types("src/brainbox.d.ts"),
    ownButton("in any component"),
    privacy,
  ],
}

const astro: Article = {
  path: "/install/astro",
  name: "Astro",
  parent,
  title: "Add a bug report widget to an Astro site",
  description:
    "Add Brainbox to Astro in your shared layout with is:inline, identify signed-in users, and keep it through view transitions. Reports come with a screenshot.",
  heading: "Bug reports from your Astro site",
  intro: [
    "Astro bundles and rewrites most `<script>` tags. The widget is a ready-built script from our server, so it should go to the browser exactly as written: `is:inline` tells Astro to leave it alone.",
  ],
  sections: [
    {
      title: "The tag, in your layout",
      blocks: [
        { p: "Put it in the layout every page uses, before `</body>`:" },
        {
          file: "src/layouts/Layout.astro",
          lang: "astro",
          code: `<body>
  <slot />
  <script
    is:inline
    src="${WIDGET_SRC}"
    data-project="${PROJECT_KEY}"
    data-endpoint="${ENDPOINT}"
  ></script>
</body>`,
        },
        {
          p: "Astro already treats a script with attributes other than `src` as inline, but writing `is:inline` keeps it that way if someone trims the attributes later.",
        },
      ],
    },
    {
      title: "View transitions",
      blocks: [
        {
          p: "With `<ClientRouter />`, Astro swaps in the next page's `<body>` instead of loading it. The widget moves itself into each new body as it arrives, so it stays on the page, with whatever the user had open in it. Inline scripts don't run again on navigation, so nothing is loaded twice.",
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        {
          p: "On a server-rendered page, write the user into an inline script after the tag. Escape `<` so a name can't close the script early:",
        },
        {
          file: "src/layouts/Layout.astro",
          lang: "astro",
          code: `---
const user = Astro.locals.user // however your middleware sets it
const identity = user
  ? JSON.stringify({ id: user.id, email: user.email, name: user.name }).replace(/</g, "\\\\u003c")
  : null
---
{identity && <script is:inline set:html={"window.Brainbox.identify(" + identity + ")"} />}`,
        },
      ],
    },
    ownButton("in any `.astro` file or framework component"),
    privacy,
  ],
}

const angular: Article = {
  path: "/install/angular",
  name: "Angular",
  parent,
  title: "Add a bug report widget to an Angular app",
  description:
    "Add Brainbox to an Angular app in src/index.html and identify users from a service. What to avoid: angular.json scripts and autoCsp.",
  heading: "Bug reports from your Angular app",
  intro: [
    "The widget is a script tag, and in an Angular app the place for it is `src/index.html`, the page the app boots in. The router only re-renders inside `<app-root>`, so the widget stays put.",
  ],
  sections: [
    {
      title: "The tag, in src/index.html",
      blocks: [
        { file: "src/index.html", lang: "html", code: `<body>\n  <app-root></app-root>\n${tagLines("  ")}\n</body>` },
        {
          p: "Not in `angular.json`'s `scripts`: that option bundles files from your project into a script of its own, and can't load a URL or carry the data attributes the widget reads its settings from.",
        },
      ],
    },
    {
      title: "Content Security Policy",
      blocks: [
        {
          p: "Angular's `security.autoCsp` option rewrites the page's `<script src>` tags into a hashed loader that keeps only a few standard attributes, so `data-project` and `data-endpoint` don't survive and the widget can't find its settings. Leave `autoCsp` off on pages with the widget, or set your policy yourself and add `https://app.brainbox.sh` to `script-src` and `connect-src`.",
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        { p: "Wherever your app holds the current user, pass it on when it changes. With a signal, an `effect` does it:" },
        {
          file: "src/app/feedback.service.ts",
          lang: "ts",
          code: `import { Injectable, effect, inject } from "@angular/core"
import { AuthService } from "./auth.service" // yours

@Injectable({ providedIn: "root" })
export class FeedbackService {
  private auth = inject(AuthService)

  constructor() {
    effect(() => {
      const user = this.auth.user()
      if (user) window.Brainbox?.identify({ id: user.id, email: user.email, name: user.name })
    })
  }

  reportBug() {
    window.Brainbox?.start("screenshot")
  }
}`,
        },
        { p: "Inject the service once, in your root component, so it starts with the app." },
      ],
    },
    types("src/app/brainbox.d.ts"),
    ownButton("in any component's template"),
    privacy,
  ],
}

const rails: Article = {
  path: "/install/rails",
  name: "Ruby on Rails",
  parent,
  title: "Add a bug report widget to a Rails app",
  description:
    "Add Brainbox to a Rails app in the application layout, identify current_user safely, and keep it on the page through Turbo Drive. Reports include a screenshot.",
  heading: "Bug reports from your Rails app",
  intro: [
    "The widget goes in your application layout, once. Rails apps usually navigate with Turbo Drive, which swaps in each new page's `<body>` instead of loading it; the widget is built for that and stays on the page from one visit to the next.",
  ],
  sections: [
    {
      title: "The tag, in your layout",
      blocks: [
        { p: "`javascript_include_tag` writes the tag, with the data attributes from the `data:` hash:" },
        {
          file: "app/views/layouts/application.html.erb",
          lang: "erb",
          code: `<body>
  <%= yield %>

  <%= javascript_include_tag "${WIDGET_SRC}",
        data: { project: "${PROJECT_KEY}", endpoint: "${ENDPOINT}" } %>
</body>`,
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        {
          p: "Write `current_user` into a script after the tag. `json_escape` keeps a name with `</script>` in it from breaking out, and `raw` stops ERB escaping the JSON a second time:",
        },
        {
          file: "app/views/layouts/application.html.erb",
          lang: "erb",
          code: `<% if current_user %>
  <script>
    window.Brainbox.identify(<%= raw json_escape({ id: current_user.id.to_s, email: current_user.email, name: current_user.name }.to_json) %>)
  </script>
<% end %>`,
        },
        {
          p: "If you turned on Rails' Content Security Policy, give that script a nonce with `javascript_tag nonce: true`, and add `https://app.brainbox.sh` to `script_src` and `connect_src`.",
        },
      ],
    },
    {
      title: "Turbo Drive",
      blocks: [
        {
          p: "Turbo replaces `<body>` on every visit and runs the scripts in it again. The widget moves itself into each new body, with anything the user had open in it, and a second run of the tag does nothing, so there is still one widget. The identify script does run again, which keeps the user current after signing in or out.",
        },
        {
          p: "The widget's elements are marked `data-turbo-temporary`, so Turbo leaves them out of the page snapshots it caches for back and forward.",
        },
      ],
    },
    ownButton("in any view"),
    privacy,
  ],
}

const laravel: Article = {
  path: "/install/laravel",
  name: "Laravel",
  parent,
  title: "Add a bug report widget to a Laravel app",
  description:
    "Add Brainbox to a Laravel app in your Blade layout, identify the signed-in user with Js::from, and keep it through Livewire navigation. Works with Inertia too.",
  heading: "Bug reports from your Laravel app",
  intro: [
    "The widget goes in your main Blade layout, once, before `</body>`. That covers Blade and Livewire apps, and Inertia apps through their root template.",
  ],
  sections: [
    {
      title: "The tag, in your layout",
      blocks: [
        { p: "Usually `resources/views/layouts/app.blade.php`; for Inertia, the root template `resources/views/app.blade.php`." },
        {
          file: "resources/views/layouts/app.blade.php",
          lang: "blade",
          code: `<body>
    {{ $slot }}

${tagLines("    ")}
</body>`,
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        {
          p: "After the tag, pass the user with `Js::from`, which encodes it safely for a script:",
        },
        {
          file: "resources/views/layouts/app.blade.php",
          lang: "blade",
          code: `@auth
    <script>
        window.Brainbox.identify({{ Js::from([
            'id' => (string) auth()->id(),
            'email' => auth()->user()->email,
            'name' => auth()->user()->name,
        ]) }});
    </script>
@endauth`,
        },
      ],
    },
    {
      title: "Livewire and wire:navigate",
      blocks: [
        {
          p: "`wire:navigate` swaps in the next page's `<body>` and runs its scripts again. The widget moves itself into each new body, and a second run of the tag does nothing, so there is one widget, with anything the user had open still open. The identify script runs again too, which keeps the user current.",
        },
      ],
    },
    {
      title: "Inertia",
      blocks: [
        {
          p: "Inertia only re-renders its own root element, so the tag stays put. The Blade identify above runs on the first full load; to follow sign-ins that happen without one, identify from your shared props when the page changes:",
        },
        {
          file: "resources/js/app.ts",
          lang: "ts",
          code: `import { router } from "@inertiajs/vue3" // or @inertiajs/react

router.on("navigate", (event) => {
  const user = event.detail.page.props.auth?.user
  if (user) window.Brainbox?.identify({ id: String(user.id), email: user.email, name: user.name })
})`,
        },
      ],
    },
    ownButton("in any Blade view or component"),
    privacy,
  ],
}

const django: Article = {
  path: "/install/django",
  name: "Django",
  parent,
  title: "Add a bug report widget to a Django app",
  description:
    "Add Brainbox to a Django app in base.html, pass request.user safely with json_script, and keep it on the page with htmx hx-boost. Reports include a screenshot.",
  heading: "Bug reports from your Django app",
  intro: [
    "The widget goes in the base template your pages extend, before `</body>`. A small context processor tells it who is signed in.",
  ],
  sections: [
    {
      title: "The tag, in your base template",
      blocks: [
        {
          file: "templates/base.html",
          lang: "django",
          code: `<body>
  {% block content %}{% endblock %}

${tagLines("  ")}
</body>`,
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        { p: "Templates can't build a dictionary, so make it in a context processor:" },
        {
          file: "yourapp/context_processors.py",
          lang: "python",
          code: `def brainbox_user(request):
    user = request.user
    if not user.is_authenticated:
        return {}
    return {
        "brainbox_user": {
            "id": str(user.pk),
            "email": user.email,
            "name": user.get_full_name(),
        }
    }`,
        },
        { p: "Add `\"yourapp.context_processors.brainbox_user\"` to `context_processors` in your `TEMPLATES` setting. Then, after the tag, `json_script` writes the user as escaped JSON and a line of script passes it on:" },
        {
          file: "templates/base.html",
          lang: "django",
          code: `{% if brainbox_user %}
  {{ brainbox_user|json_script:"brainbox-user" }}
  <script>
    window.Brainbox.identify(JSON.parse(document.getElementById("brainbox-user").textContent))
  </script>
{% endif %}`,
        },
        { p: "With Django's Content Security Policy on, give that script `nonce=\"{{ csp_nonce }}\"` and allow `https://app.brainbox.sh` in `script-src` and `connect-src`." },
      ],
    },
    {
      title: "htmx and hx-boost",
      blocks: [
        {
          p: "`hx-boost` swaps each page's `<body>` content in place and runs its scripts. The widget puts itself back on the page after every swap, with anything the user had open, and a second run of the tag does nothing, so there is one widget.",
        },
      ],
    },
    ownButton("in any template"),
    privacy,
  ],
}

const wordpress: Article = {
  path: "/install/wordpress",
  name: "WordPress",
  parent,
  title: "Add a bug report widget to WordPress",
  description:
    "Add Brainbox to a WordPress site with a small must-use plugin, and say which logged-in user sent each report. Reports include a screenshot and console errors.",
  heading: "Bug reports from your WordPress site",
  intro: [
    "On WordPress, the cleanest home for the widget is a must-use plugin: a single file that loads on every page, needs no activating, and survives theme changes and updates.",
  ],
  sections: [
    {
      title: "A must-use plugin",
      blocks: [
        {
          p: "Create this file. `wp_footer` prints the tag before `</body>`, and for a logged-in user a line after it says who they are. `wp_json_encode` with `JSON_HEX_TAG` keeps a display name from breaking out of the script.",
        },
        {
          file: "wp-content/mu-plugins/brainbox.php",
          lang: "php",
          code: `<?php
/**
 * Plugin Name: Brainbox
 */

add_action( 'wp_footer', function () {
	?>
	${TAG}
	<?php
	if ( is_user_logged_in() ) {
		$user = wp_get_current_user();
		$identity = array(
			'id'    => (string) $user->ID,
			'email' => $user->user_email,
			'name'  => $user->display_name,
		);
		echo '<script>window.Brainbox.identify(' . wp_json_encode( $identity, JSON_HEX_TAG | JSON_HEX_AMP ) . ');</script>';
	}
} );`,
        },
      ],
    },
    {
      title: "Page caching",
      blocks: [
        {
          p: "A page cache that served one logged-in user's page to another would hand over the identify line too. Most caching plugins skip logged-in users by default; check yours does before you add the identify part.",
        },
      ],
    },
    {
      title: "Without code",
      blocks: [
        {
          p: "A header-and-footer code plugin works too: paste the tag into its footer box. You lose the identify line, so reports arrive without a name unless the user types one.",
        },
        { code: TAG, lang: "html" },
      ],
    },
    ownButton("in any post, page or block"),
    privacy,
  ],
}

const html: Article = {
  path: "/install/html",
  name: "Plain HTML",
  parent,
  title: "Add a bug report widget to any website",
  description:
    "Add Brainbox to any web page with one script tag: every option it takes, how to say who is signed in, and how to open it from your own buttons.",
  heading: "One script tag, any site",
  intro: [
    "Whatever made the page, the widget is the same tag before `</body>`. This page is the full reference for it: the attributes, the API it publishes, and the event it fires.",
  ],
  sections: [
    {
      title: "The tag",
      blocks: [
        { code: tagLines(""), lang: "html" },
        { p: "Your project key is in the dashboard. It is public by design: it only lets a page send reports to your project, and it ships in your HTML." },
      ],
    },
    {
      title: "Options",
      blocks: [
        {
          table: {
            head: ["Attribute", "Values", "Default"],
            rows: [
              ["`data-project`", "your project key", "required"],
              ["`data-endpoint`", "where reports are sent", "required"],
              ["`data-mode`", "`float` (our button) or `mount` (your own trigger)", "`float`"],
              ["`data-mount`", "CSS selector of your trigger, with `data-mode=\"mount\"`", ""],
              ["`data-position`", "`bottom-right`, `bottom-left`, `top-right`, `top-left`", "`bottom-right`"],
              ["`data-theme`", "`dark`, `light`, or `system` to follow the visitor's OS", "`dark`"],
              ["`data-feature-requests`", "`off` hides \"Suggest a feature\" in the chooser", "on"],
            ],
          },
        },
      ],
    },
    {
      title: "Who is signed in",
      blocks: [
        { p: "After the tag, call `identify()` with whatever you know about the user. Calls made before the widget has finished starting are kept and applied." },
        { code: `<script>\n  window.Brainbox.identify({ id: "u_123", email: "maya@example.com", name: "Maya Patel" })\n</script>`, lang: "html" },
        {
          p: "`setFields()` adds your own details to every report, shown under the person who sent it: `window.Brainbox.setFields([{ label: \"Plan\", value: \"Pro\" }])`.",
        },
      ],
    },
    ownButton("anywhere on the page"),
    {
      title: "After a report is sent",
      blocks: [
        { p: "The widget fires `brainbox:submitted` on `window`, with the report's id, for a thank-you of your own or your analytics:" },
        { code: `<script>\n  window.addEventListener("brainbox:submitted", (event) => {\n    console.log("report", event.detail.id)\n  })\n</script>`, lang: "html" },
      ],
    },
    {
      title: "Pages that swap their body",
      blocks: [
        {
          p: "Some tools navigate by replacing `<body>` instead of loading a page: Turbo, Livewire's `wire:navigate`, htmx's `hx-boost`, Astro's view transitions. The widget moves itself into each new body and ignores a second run of its tag, so it stays on the page, once.",
        },
      ],
    },
    privacy,
  ],
}

export const FRAMEWORK_GUIDES: readonly Article[] = [
  nextjs,
  react,
  reactRouter,
  vue,
  nuxt,
  sveltekit,
  astro,
  angular,
  rails,
  laravel,
  django,
  wordpress,
  html,
]
