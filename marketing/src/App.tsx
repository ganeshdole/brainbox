import { Layout } from "@/components/site/layout"
import type { Page } from "@/pages"

export default function App({ page }: { page: Page }) {
  return <Layout>{page.render()}</Layout>
}
