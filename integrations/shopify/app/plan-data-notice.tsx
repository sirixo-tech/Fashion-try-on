export function PlanDataNotice({
  plansError,
  creditSummaryError,
  retrying,
  onRetry,
}: {
  plansError: string | null;
  creditSummaryError: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (!plansError && !creditSummaryError) return null;
  return (
    <s-banner heading="Plan information couldn’t be loaded" tone="warning">
      <s-stack gap="base">
        {plansError ? <s-text>{plansError}</s-text> : null}
        {creditSummaryError ? <s-text>{creditSummaryError}</s-text> : null}
        <s-button
          type="button"
          variant="secondary"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Retrying…" : "Retry loading plans"}
        </s-button>
      </s-stack>
    </s-banner>
  );
}
