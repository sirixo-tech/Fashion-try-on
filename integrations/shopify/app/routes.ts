import { type RouteConfig, route } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

const routes = [
  route("apps/selfx-tryon/launch", "routes/apps.selfx-tryon.launch.tsx", {
    id: "routes/apps.selfx-tryon.launch",
  }),
  ...(await flatRoutes({
    ignoredRouteFiles: ["**/apps.selfx-tryon.launch.tsx"],
  })),
] satisfies RouteConfig;

export default routes;
