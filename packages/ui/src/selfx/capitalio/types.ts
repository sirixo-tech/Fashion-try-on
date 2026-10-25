export type DashboardPoint = {
  date: string;
  generated: number;
  attempts: number;
  downloads: number;
  failed: number;
  successRate: number | null;
};

export type DashboardProduct = {
  id: string;
  name: string;
  category: string;
  generated: number;
  attempts: number;
  downloads: number;
  failed: number;
};

export type CapitalioDashboardMetrics = {
  generated: number;
  attempts: number;
  completed: number;
  failed: number;
  queued: number;
  processing: number;
  sessions: number;
  downloads: number;
  successRate: number | null;
  downloadRate: number | null;
  growthPercent: number | null;
  daily: DashboardPoint[];
  products: DashboardProduct[];
  stores?: Array<{
    id: string | null;
    name: string;
    generated: number;
    attempts: number;
    downloads: number;
    failed: number;
    successRate: number | null;
  }>;
};

export type DashboardAction = { label: string; onClick: () => void };

export type CapitalioDashboardProps = {
  metrics: CapitalioDashboardMetrics | null;
  loading?: boolean;
  unavailableMessage?: string;
  analysisAction?: DashboardAction;
  productsAction?: DashboardAction;
  activityAction?: DashboardAction;
  performanceScope?: "PLATFORM" | "STORE";
  onStoreSelect?: (storeId: string) => void;
  selectableStoreIds?: string[];
};
