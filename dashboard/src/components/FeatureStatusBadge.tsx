import type { FeatureStatus } from "@ganeshdole/brainbox-shared";

import { statusLabel } from "../lib/feature";
import { Badge } from "./ui/badge";

const VARIANT: Record<FeatureStatus, "default" | "info" | "success"> = {
  under_review: "default",
  planned: "info",
  in_progress: "info",
  shipped: "success",
  declined: "default",
};

/** Where a feature stands, as a small mono pill. */
export function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  return (
    <Badge variant={VARIANT[status]} className={status === "declined" ? "line-through" : undefined}>
      {statusLabel(status)}
    </Badge>
  );
}
