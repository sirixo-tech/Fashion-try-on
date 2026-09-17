"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2Icon,
  CreditCardIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  StoreIcon,
} from "lucide-react";

import {
  Button,
  Input,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import {
  getCurrentMerchantStore,
  hasCurrentStorePermission,
} from "@/lib/current-store";
import { useSession } from "@/lib/session";
import {
  getEffectiveStorePermissions,
  getStore,
  listStores,
  type AdminStore,
  type AdminStoreDetail,
  type EffectiveStorePermissions,
} from "@/lib/stores";

type StoreOption = { id: string; name: string };
type LocationRow = {
  id: string;
  name: string;
  contact: string;
  address: string;
  timezone: string;
  kiosks: number;
  status: "ACTIVE" | "INACTIVE";
  defaultLocation: boolean;
};

export default function LocationsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeAccess, setStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [store, setStore] = useState<AdminStoreDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platformPermissions = platformAccess?.permissions ?? [];
  const canChooseStoreScope = Boolean(
    platformAccess?.isSuperadmin || platformPermissions.includes("STORES_VIEW"),
  );
  const canViewLocations = Boolean(
    store &&
      planAllowsTeamLocations(store.subscription.subscription?.pricingPlan
        ?.storeLocationLimit) &&
      (platformAccess?.isSuperadmin ||
        platformPermissions.includes("STORES_VIEW") ||
        hasCurrentStorePermission(storeAccess, ["stores.view"])),
  );
  const canManageLocations = Boolean(
    store &&
      planAllowsTeamLocations(store.subscription.subscription?.pricingPlan
        ?.storeLocationLimit) &&
      (platformAccess?.isSuperadmin ||
        platformPermissions.includes("STORES_UPDATE") ||
        hasCurrentStorePermission(storeAccess, ["stores.update"])),
  );
  const locationLimit =
    store?.subscription.subscription?.pricingPlan?.storeLocationLimit ?? null;
  const teamLocationsUnlocked =
    store === null ? false : planAllowsTeamLocations(locationLimit);
  const locations = useMemo(() => {
    if (!store || !teamLocationsUnlocked) {
      return [];
    }
    return [locationFromStore(store)];
  }, [store, teamLocationsUnlocked]);
  const filteredLocations = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return locations;
    }
    return locations.filter((location) =>
      [
        location.name,
        location.contact,
        location.address,
        location.timezone,
        location.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanQuery),
    );
  }, [locations, query]);
  const limitReached =
    teamLocationsUnlocked &&
    locationLimit !== null &&
    locations.length >= locationLimit;
  const planUsage = !store
    ? "-"
    : teamLocationsUnlocked
      ? `${locations.length} / ${locationLimit ?? "Custom"}`
      : "Locked";
  const selectedStoreName = storeOptions.find((item) => item.id === storeId)
    ?.name;

  useEffect(() => {
    if (!accessToken) {
      setPlatformAccess(null);
      setStoreOptions([]);
      setStoreId("");
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadContext() {
      setError(null);
      try {
        const nextAccess = await getCurrentPlatformAccess(token);
        if (cancelled) {
          return;
        }
        setPlatformAccess(nextAccess);

        if (
          nextAccess.isSuperadmin ||
          nextAccess.permissions.includes("STORES_VIEW")
        ) {
          const stores = await listStores(token, { pageSize: 100 });
          if (!cancelled) {
            const options = stores.data.map(storeOptionFromAdminStore);
            setStoreOptions(options);
            setStoreId((current) => current || options[0]?.id || "");
          }
          return;
        }

        const currentStore = await getCurrentMerchantStore(token);
        if (!cancelled) {
          const options = currentStore
            ? [{ id: currentStore.id, name: currentStore.name }]
            : [];
          setStoreOptions(options);
          setStoreId((current) => current || options[0]?.id || "");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(messageFor(caught));
          setPlatformAccess({ isSuperadmin: false, permissions: [] });
        }
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !storeId) {
      setStoreAccess(null);
      return;
    }

    const token = accessToken;
    const selectedStoreId = storeId;
    let cancelled = false;

    getEffectiveStorePermissions(token, selectedStoreId)
      .then((nextAccess) => {
        if (!cancelled) {
          setStoreAccess(nextAccess);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setStoreAccess(null);
          setError(messageFor(caught));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, storeId]);

  const loadStore = useCallback(async () => {
    if (!accessToken || !storeId) {
      setStore(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setStore(await getStore(accessToken, storeId));
    } catch (caught) {
      setError(messageFor(caught));
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, storeId]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Team & locations"
        title="Locations"
        description={
          store
            ? `${store.name} branch and location controls.`
            : "Manage Store locations and branch limits."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/app/billing" />} variant="outline">
              <CreditCardIcon aria-hidden="true" />
              View plans
            </Button>
            <Button variant="outline" onClick={() => void loadStore()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button
              disabled={
                !canManageLocations || !teamLocationsUnlocked || limitReached
              }
            >
              <PlusIcon aria-hidden="true" />
              Add location
            </Button>
          </div>
        }
      />

      {error ? (
        <PageSection>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {error}
          </div>
        </PageSection>
      ) : null}

      {canChooseStoreScope && storeOptions.length > 1 ? (
        <PageSection>
          <div className="max-w-sm">
            <SelectMenu
              ariaLabel="Store"
              value={storeId}
              options={storeOptions.map((option) => ({
                value: option.id,
                label: option.name,
              }))}
              onChange={setStoreId}
            />
          </div>
        </PageSection>
      ) : null}

      {!loading && store && !teamLocationsUnlocked ? (
        <LockedTeamLocationsNotice />
      ) : (
        <>
          <PageSection>
            <StatGrid>
              <StatCard
                icon={<MapPinIcon aria-hidden="true" />}
                label="Locations"
                value={String(locations.length)}
                secondaryValue={
                  selectedStoreName ?? store?.name ?? "Current Store"
                }
              />
              <StatCard
                icon={<CreditCardIcon aria-hidden="true" />}
                label="Plan usage"
                value={planUsage}
                secondaryValue={
                  store?.subscription.subscription?.pricingPlan?.name ?? "Trial"
                }
              />
              <StatCard
                icon={<StoreIcon aria-hidden="true" />}
                label="Kiosks"
                value={String(store?.totalKiosks ?? 0)}
                secondaryValue={`${store?.activeKiosks ?? 0} active`}
              />
              <StatCard
                icon={<Building2Icon aria-hidden="true" />}
                label="Default"
                value={locations[0]?.name ?? "-"}
                secondaryValue="Primary location"
              />
            </StatGrid>
          </PageSection>

          {limitReached ? (
            <PageSection>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <div className="font-semibold">Location limit reached</div>
                <p className="mt-1 text-sm">
                  Your plan allows {locationLimit} location
                  {locationLimit === 1 ? "" : "s"}. View plans to add more
                  branches.
                </p>
                <Button
                  className="mt-4"
                  render={<Link href="/app/billing" />}
                  variant="outline"
                  size="sm"
                >
                  <CreditCardIcon aria-hidden="true" />
                  View plans
                </Button>
              </div>
            </PageSection>
          ) : null}

          <PageSection>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <label className="relative block w-full max-w-md">
                  <span className="sr-only">Search locations</span>
                  <SearchIcon
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={16}
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    placeholder="Search name, address, phone..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <Button render={<Link href="/app/billing" />} variant="outline">
                  <CreditCardIcon aria-hidden="true" />
                  View plans
                </Button>
              </div>

              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                <div className="font-semibold">One Store, many locations</div>
                <p className="mt-1">
                  Products, staff and kiosks remain Store-owned. Branch controls
                  will scope operational work to individual locations as this
                  module expands.
                </p>
              </div>

              <div className="mt-4">
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Timezone</TableHead>
                        <TableHead>Kiosks</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7}>
                            Loading locations...
                          </TableCell>
                        </TableRow>
                      ) : !canViewLocations ? (
                        <TableRow>
                          <TableCell colSpan={7}>
                            You do not have permission to view Store locations.
                          </TableCell>
                        </TableRow>
                      ) : filteredLocations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7}>
                            {locations.length === 0
                              ? "No locations are available yet."
                              : "No locations match your search."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLocations.map((location) => (
                          <TableRow key={location.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                                  <MapPinIcon size={18} aria-hidden="true" />
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {location.name}
                                  </div>
                                  {location.defaultLocation ? (
                                    <div className="text-xs text-muted-foreground">
                                      Default location
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{location.contact}</TableCell>
                            <TableCell>{location.address}</TableCell>
                            <TableCell>{location.timezone}</TableCell>
                            <TableCell>{location.kiosks}</TableCell>
                            <TableCell>
                              <StatusBadge
                                status={location.status}
                                label={location.status}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                render={
                                  <Link href={`/app/stores/${storeId}`} />
                                }
                                variant="outline"
                                size="sm"
                              >
                                <PencilIcon aria-hidden="true" />
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            </div>
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}

function LockedTeamLocationsNotice() {
  return (
    <PageSection>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <div className="font-semibold">Team and locations are locked</div>
        <p className="mt-1 text-sm">
          This Store plan only includes trial Try-On credits. Choose a plan with
          Store locations to manage branches and Store staff.
        </p>
        <Button
          className="mt-4"
          render={<Link href="/app/billing" />}
          variant="outline"
          size="sm"
        >
          <CreditCardIcon aria-hidden="true" />
          View plans
        </Button>
      </div>
    </PageSection>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function locationFromStore(store: AdminStoreDetail): LocationRow {
  return {
    id: `${store.id}:default`,
    name: "Main",
    contact: store.contactPhone || store.contactEmail || "-",
    address: storeAddress(store) || "-",
    timezone: store.timezone,
    kiosks: store.totalKiosks,
    status: store.status,
    defaultLocation: true,
  };
}

function storeAddress(store: AdminStoreDetail): string {
  return [
    store.address,
    store.city,
    store.stateRegion,
    store.postalCode,
    store.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Locations could not be loaded.";
}

function planAllowsTeamLocations(limit: number | null | undefined): boolean {
  return limit === null || (typeof limit === "number" && limit > 0);
}
