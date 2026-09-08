import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return {
    shop: session.shop,
  };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <main style={{ padding: "32px", maxWidth: 960 }}>
      <h1>SelfX Virtual Try-On</h1>

      <section style={{ marginTop: 24 }}>
        <h2>Store Connection</h2>
        <p>Shopify store: {shop}</p>
        <p>Status: Connected</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Catalog Sync</h2>
        <p>Sync status: Pending</p>
        <p>Products imported: 0</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <button type="button" disabled>
          Add Try-On to Store
        </button>
        <p style={{ color: "#666", marginTop: 8 }}>
          Theme editor deep link will be connected in the next step.
        </p>
      </section>
    </main>
  );
}
