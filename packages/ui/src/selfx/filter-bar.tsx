import type { ReactNode } from "react";

import { Button } from "@selfx/ui/components/button";
import { Card, CardContent } from "@selfx/ui/components/card";

export function FilterBar({
  search,
  filters,
  sort,
  actions,
  onClear,
  clearLabel = "Clear",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  actions?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        {search}
        {filters}
        {sort}
        {onClear ? (
          <Button variant="ghost" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
        {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
