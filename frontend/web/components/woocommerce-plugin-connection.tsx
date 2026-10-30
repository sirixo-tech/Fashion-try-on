"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  KeyRoundIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConfirmDialog,
  Input,
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

export function WooCommercePluginSetup() {
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>WordPress plugin</CardTitle>
          <p className="text-sm text-muted-foreground">
            Install once. Products stay in sync automatically.
          </p>
        </div>
        <a
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-fit shrink-0",
          })}
          href="/downloads/selfx-woocommerce.zip"
          download
        >
          <DownloadIcon aria-hidden="true" />
          Download WooCommerce plugin
        </a>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="grid gap-5 md:grid-cols-3">
          {[
            {
              title: "Install the plugin",
              description:
                "In WordPress, go to Plugins → Add New → Upload Plugin. Upload the ZIP and activate it.",
            },
            {
              title: "Connect your Store",
              description:
                "Open WooCommerce → SelfX, choose Connect to SelfX and approve this Store. The connection finishes automatically.",
            },
            {
              title: "Enable Try-On",
              description:
                "After sync completes, enable eligible imported products in SelfX Products. Shoppers can then try them on.",
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground">
          <ArrowRightIcon
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <p>
            WooCommerce manages product details, options, cart and checkout.
            SelfX manages Try-On. Sync progress is shown in WooCommerce → SelfX;
            use Sync now there to reconcile the catalog.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

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
    <div className="space-y-6">
      <WooCommercePluginSetup />
      <Card className="gap-0 py-0">
        <Collapsible
          onOpenChange={(open) => {
            if (!open) setSecret(null);
          }}
        >
          <CollapsibleTrigger className="rounded-xl px-5 py-4 sm:px-6">
            <span className="flex items-center gap-3">
              <KeyRoundIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                Advanced connection / API tokens
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  For manual setup and connection troubleshooting
                </span>
              </span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t px-5 pb-5 pt-4 sm:px-6">
              <p className="text-sm leading-6 text-muted-foreground">
                The plugin creates its token automatically when you connect.
                Generate a manual token only when configuring an existing
                token-based installation.
              </p>
              {error ? (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {canManage && integration.status === "ACTIVE" ? (
                <div className="my-4 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-2 text-sm">
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
                    Copy this token into WordPress now. It is shown only once;
                    after closing it, generate a replacement if needed.
                  </p>
                  <label className="flex flex-col gap-2 text-sm">
                    <span>New WooCommerce token</span>
                    <Textarea
                      readOnly
                      value={secret}
                      onFocus={(event) => event.target.select()}
                      spellCheck={false}
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSecret(null)}
                  >
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
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {credential.name}
                        <Badge variant="secondary">
                          {credential.status === "REVOKED"
                            ? "Revoked"
                            : credential.expiresAt &&
                                Date.parse(credential.expiresAt) <= Date.now()
                              ? "Expired"
                              : "Active"}
                        </Badge>
                      </p>
                      <p className="text-muted-foreground">
                        Last used:{" "}
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
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={`Revoke ${credential.name}`}
                          >
                            Revoke
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
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
