import { LoadingScreen } from "@selfx/ui";
import { SelfxBrandLogo } from "./selfx-brand-logo";

export function WorkspaceLoading({
  description,
  fullScreen = true,
}: {
  description?: string;
  fullScreen?: boolean;
}) {
  return (
    <LoadingScreen
      description={description}
      fullScreen={fullScreen}
      logo={<SelfxBrandLogo className="h-auto w-36" priority />}
    />
  );
}
