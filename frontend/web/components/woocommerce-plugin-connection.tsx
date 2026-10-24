"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  ConfirmDialog,
  Input,
  TableContainer,
  Textarea,
  buttonVariants,
} from "@selfx/ui";
import { SafeApiError } from "@/lib/api";
import {
  createIntegrationCredential,
  revokeIntegrationCredential,
  type IntegrationCredential,
  type StoreIntegration,
} from "@/lib/integrations";
import { RegionalDateTime } from "@/lib/regional-settings";

export function WooCommercePluginConnection({
  accessToken,
  integration,
  canManage,
  onCredential,
}: {
  accessToken: string;
  integration: StoreIntegration;
  canManage: boolean;
  onCredential: (credential: IntegrationCredential) => void;
}) {
  const [name, setName] = useState("WordPress catalog sync");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!canManage) setSecret(null);
  }, [canManage]);
  const permitted = useRef(canManage);
  permitted.current = canManage;

  async function generate() {
    if (!canManage || busy || integration.status !== "ACTIVE" || !name.trim())
      return;
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const result = await createIntegrationCredential(
        accessToken,
        integration.id,
        {
          name: name.trim(),
          scopes: ["catalog:sync", "tryon:create"],
        },
      );
      if (active.current && permitted.current) {
        setSecret(result.secret);
        onCredential(result.credential);
      }
    } catch (caught) {
      if (active.current)
        setError(
          caught instanceof SafeApiError
            ? caught.message
            : "The plugin token could not be created.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function revoke(credentialId: string) {
    if (!canManage || busy) return;
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const result = await revokeIntegrationCredential(
        accessToken,
        credentialId,
      );
      if (active.current) onCredential(result);
    } catch (caught) {
      if (active.current)
        setError(
          caught instanceof SafeApiError
            ? caught.message
            : "The plugin token could not be revoked.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <TableContainer
      title="WordPress plugin"
      description="One-way catalog sync from WooCommerce to this Store and its assigned kiosks."
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Download the plugin and install it in WordPress → Plugins → Add New →
          Upload Plugin.
        </li>
        <li>
          Open WooCommerce → SelfX and choose Connect to SelfX. Sign in, choose
          this Store, approve the website and return to WordPress.
        </li>
        <li>
          After sync completes, enable eligible imported products for Try-On in
          SelfX Products.
        </li>
      </ol>
      <p className="my-4">
        <a
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href="/downloads/selfx-woocommerce-0.3.0.zip"
          download
        >
          Download WooCommerce plugin
        </a>
      </p>
      <p className="text-sm text-muted-foreground">
        Product updates and deletions sync automatically. Use Sync now in
        WordPress to reconcile the catalog. Eligible product pages show Try it
        on; shoppers return to WooCommerce to choose options and purchase.
        Existing token-based connections can be managed below.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {canManage && integration.status === "ACTIVE" ? (
        <div className="my-4 flex flex-wrap items-end gap-3">
          <label className="space-y-2 text-sm">
            <span>Token name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              disabled={busy}
            />
          </label>
          <Button
            onClick={() => void generate()}
            disabled={busy || !name.trim()}
          >
            Generate plugin token
          </Button>
        </div>
      ) : null}
      {canManage && secret ? (
        <div className="my-4 space-y-2 rounded-lg border p-4">
          <p className="text-sm">
            Copy this token into WordPress now. It is shown only once; after
            closing it, generate a replacement if needed.
          </p>
          <label className="block space-y-2 text-sm">
            <span>New WooCommerce token</span>
            <Textarea
              readOnly
              value={secret}
              onFocus={(event) => event.target.select()}
              spellCheck={false}
            />
          </label>
          <Button size="sm" variant="outline" onClick={() => setSecret(null)}>
            Hide token
          </Button>
        </div>
      ) : null}
      <ul className="mt-4 divide-y" aria-label="Plugin tokens">
        {integration.credentials.map((credential) => (
          <li
            key={credential.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <div>
              <p className="font-medium">{credential.name}</p>
              <p className="text-muted-foreground">
                {credential.status === "REVOKED" ? "Revoked" : "Active"} · Last
                used:{" "}
                {credential.lastUsedAt ? (
                  <RegionalDateTime value={credential.lastUsedAt} />
                ) : (
                  "Never"
                )}
              </p>
            </div>
            {canManage && credential.status === "ACTIVE" ? (
              <ConfirmDialog
                title="Revoke plugin token?"
                description="The WordPress connection using this token will stop syncing. Connect it with a new token to resume."
                confirmLabel="Revoke token"
                destructive
                onConfirm={() => void revoke(credential.id)}
                trigger={
                  <Button variant="outline" size="sm" disabled={busy}>
                    Revoke {credential.name}
                  </Button>
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      {!integration.credentials.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No plugin tokens created.
        </p>
      ) : null}
    </TableContainer>
  );
}
