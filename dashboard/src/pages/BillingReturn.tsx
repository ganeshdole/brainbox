import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { api } from "../lib/api";

// Dodo redirects the browser back as soon as payment succeeds, but the webhook
// that actually records the subscription arrives separately and can land a
// moment later. Without this poll a customer who just paid would be shown the
// plan picker again - so we wait for our own record to catch up.
const POLL_INTERVAL_MS = 1_500;
const GIVE_UP_AFTER_MS = 30_000;

type Phase = "waiting" | "active" | "slow" | "failed";

export function BillingReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Dodo appends ?status= to the return url. A cancelled or failed payment
  // never produces a webhook, so polling for one would just burn 30 seconds.
  const status = params.get("status");
  const paymentFailed = status !== null && status !== "succeeded" && status !== "active";

  // Derived at first render rather than set from inside the effect - the answer
  // is already known from the url, and setState in an effect body cascades.
  const [phase, setPhase] = useState<Phase>(() => (paymentFailed ? "failed" : "waiting"));

  useEffect(() => {
    if (paymentFailed) return;

    // Per run, not a ref: StrictMode runs this twice, and a shared flag reset
    // by the second run revived the first run's loop, so two polled at once.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      if (cancelled) return;
      try {
        const state = await api.getBillingState();
        if (cancelled) return;
        if (state.hasAccess) {
          setPhase("active");
          // Brief pause so the confirmation is readable rather than a flash.
          timer = setTimeout(() => {
            if (!cancelled) navigate("/", { replace: true });
          }, 900);
          return;
        }
      } catch {
        // Keep polling: a transient failure here is far more likely than a
        // genuinely missing subscription right after a successful payment.
      }
      if (cancelled) return;
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        setPhase("slow");
        return;
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigate, paymentFailed]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        {phase === "waiting" && (
          <>
            <Spinner />
            <h1 className="mt-6 text-lg font-semibold tracking-tight text-emphasis">
              Confirming your payment
            </h1>
            <p className="mt-2 text-sm text-muted">
              This usually takes a couple of seconds. Don&rsquo;t close this tab.
            </p>
          </>
        )}

        {phase === "active" && (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-emphasis">
              You&rsquo;re in. Taking you to your projects&hellip;
            </h1>
          </>
        )}

        {phase === "slow" && (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-emphasis">
              Payment received &mdash; still activating
            </h1>
            <p className="mt-2 text-sm text-muted">
              Your payment went through, but we haven&rsquo;t finished setting up the
              account yet. It usually resolves on its own within a minute.
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Check again
            </Button>
          </>
        )}

        {phase === "failed" && (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-emphasis">
              Payment didn&rsquo;t go through
            </h1>
            <p className="mt-2 text-sm text-muted">
              Nothing was charged. You can pick a plan and try again.
            </p>
            <Button className="mt-6" onClick={() => navigate("/billing", { replace: true })}>
              Back to plans
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
