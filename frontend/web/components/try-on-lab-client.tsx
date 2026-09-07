"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ImageIcon,
  InfoIcon,
  Loader2Icon,
  Maximize2Icon,
  PlayIcon,
  RotateCcwIcon,
  ShirtIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UploadIcon,
  UserRoundIcon,
} from "lucide-react";

import {
  Alert as ShadcnAlert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button as ShadcnButton,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  PageContainer,
  PageHeader,
  PageSection,
  cn,
} from "@selfx/ui";
import {
  type GarmentInputAnalysisResult,
  type ImageQualityIssue,
  type ImageQualityIssueCode,
  type ImageQualityResult,
  type ImageQualityTarget,
  type SelfxGarmentIntent,
  type TryOnLabRunResponse,
  resolveGenerationPolicy,
} from "@selfx/shared";

import {
  qualityResultHasBlockingIssue,
  TRY_ON_LAB_BROWSER_ACCEPTED_IMAGE_TYPES,
  validateBrowserImageFile,
} from "@/lib/image-quality/analyzer";
import { createTryOnLabRun, getTryOnLabRun } from "@/lib/try-on-lab-api";
import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

type ImageSlot = {
  file: File | null;
  previewUrl: string | null;
  quality: ImageQualityResult | null;
};

type ImagePreviewModalState = {
  title: string;
  imageUrl: string;
} | null;

const emptySlot: ImageSlot = {
  file: null,
  previewUrl: null,
  quality: null,
};

const DISAMBIGUATION_OPTIONS: {
  label: string;
  value: SelfxGarmentIntent;
  description: string;
}[] = [
  {
    label: "Upper garment",
    value: "TOP",
    description: "Shirts, tops, jackets and similar upper-body items.",
  },
  {
    label: "Lower garment",
    value: "BOTTOM",
    description: "Pants, skirts, shorts and similar lower-body items.",
  },
  {
    label: "One-piece",
    value: "ONE_PIECE",
    description: "Dresses, jumpsuits and single garments covering both areas.",
  },
  {
    label: "Full outfit",
    value: "FULL_OUTFIT",
    description: "Use the complete outfit shown in the reference image.",
  },
];

function Stack({
  children,
  gap = "md",
  align,
  className,
}: {
  children: ReactNode;
  gap?: "xs" | "sm" | "md" | "lg" | 2;
  align?: "flex-start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        gap === "xs"
          ? "gap-1.5"
          : gap === "sm"
            ? "gap-2"
            : gap === "lg"
              ? "gap-5"
              : gap === 2
                ? "gap-0.5"
                : "gap-4",
        align === "flex-start" && "items-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Group({
  children,
  gap = "md",
  justify,
  align,
  wrap,
  className,
}: {
  children: ReactNode;
  gap?: "xs" | "sm" | "md";
  justify?: "space-between" | "flex-end";
  align?: "center";
  wrap?: "wrap";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex",
        gap === "xs" ? "gap-2" : gap === "sm" ? "gap-3" : "gap-4",
        justify === "space-between" && "justify-between",
        justify === "flex-end" && "justify-end",
        align === "center" && "items-center",
        wrap === "wrap" && "flex-wrap",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SimpleGrid({
  children,
  cols,
  className,
}: {
  children: ReactNode;
  cols: { base?: number; sm?: number; md?: number; lg?: number };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols.base === 1 && "grid-cols-1",
        cols.sm === 2 && "sm:grid-cols-2",
        cols.md === 3 && "md:grid-cols-3",
        cols.lg === 2 && "lg:grid-cols-2",
        cols.lg === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Text({
  children,
  size = "sm",
  c,
  fw,
  tt,
  className,
}: {
  children: ReactNode;
  size?: "xs" | "sm";
  c?: "dimmed";
  fw?: 600 | 700;
  tt?: "uppercase";
  className?: string;
}) {
  return (
    <p
      className={cn(
        size === "xs" ? "text-xs" : "text-sm",
        c === "dimmed" && "text-muted-foreground",
        fw === 600 && "font-semibold",
        fw === 700 && "font-bold",
        tt === "uppercase" && "uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

function Button({
  children,
  variant,
  color,
  onClick,
  disabled,
  justify,
  className,
}: {
  children: ReactNode;
  variant?: "light" | "subtle" | "default";
  color?: "gray";
  onClick?: () => void;
  disabled?: boolean;
  justify?: "flex-start";
  className?: string;
}) {
  const mappedVariant =
    variant === "light" || variant === "subtle" || color === "gray"
      ? "outline"
      : "default";

  return (
    <ShadcnButton
      variant={mappedVariant}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        justify === "flex-start" &&
          "h-auto justify-start whitespace-normal p-4 text-left",
        className,
      )}
    >
      {children}
    </ShadcnButton>
  );
}

function Alert({
  children,
  color,
  title,
  icon,
}: {
  children: ReactNode;
  color?: "blue" | "red";
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <ShadcnAlert variant={color === "red" ? "destructive" : "info"}>
      <div className="flex gap-3">
        {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
        <div>
          {title ? <AlertTitle>{title}</AlertTitle> : null}
          <AlertDescription>{children}</AlertDescription>
        </div>
      </div>
    </ShadcnAlert>
  );
}

function Modal({
  opened,
  onClose,
  title,
  children,
  size,
}: {
  opened: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  centered?: boolean;
  size?: "xl";
}) {
  return (
    <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(size === "xl" && "sm:max-w-4xl")}>
        <DialogHeader>
          {title ? <DialogTitle>{title}</DialogTitle> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Image({
  src,
  alt,
  fit = "contain",
  className,
}: {
  src: string;
  alt: string;
  fit?: "contain";
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "h-full w-full",
        fit === "contain" && "object-contain",
        className,
      )}
    />
  );
}

function Box({
  component = "div",
  children,
  style,
  className,
  ...props
}: {
  component?: "button" | "div" | "details" | "summary";
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  [key: string]: unknown;
}) {
  const Element = component;
  return createElement(Element, { className, style, ...props }, children);
}

function ThemeIcon({
  children,
  color,
  style,
}: {
  children: ReactNode;
  color?: "red" | "yellow" | "green" | "dark";
  variant?: "light";
  radius?: string;
  size?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border",
        color === "red" && "border-red-200 bg-red-50 text-red-700",
        color === "yellow" && "border-amber-200 bg-amber-50 text-amber-700",
        color === "green" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        color === "dark" && "border-border bg-background text-foreground",
      )}
      style={style}
    >
      {children}
    </span>
  );
}

const List = Object.assign(
  function ListRoot({ children }: { children: ReactNode; size?: string }) {
    return <ul className="list-disc space-y-1 pl-5 text-sm">{children}</ul>;
  },
  {
    Item({ children }: { children: ReactNode }) {
      return <li>{children}</li>;
    },
  },
);

export function TryOnLabClient() {
  const session = useSession();
  const [person, setPerson] = useState<ImageSlot>(emptySlot);
  const [garment, setGarment] = useState<ImageSlot>(emptySlot);
  const [garmentAnalysis, setGarmentAnalysis] =
    useState<GarmentInputAnalysisResult | null>(null);
  const [disambiguationIntent, setDisambiguationIntent] =
    useState<SelfxGarmentIntent | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [run, setRun] = useState<TryOnLabRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [warningModalOpened, setWarningModalOpened] = useState(false);
  const [ambiguityModalOpened, setAmbiguityModalOpened] = useState(false);
  const [qualityOverrideAccepted, setQualityOverrideAccepted] = useState(false);
  const [previewModal, setPreviewModal] =
    useState<ImagePreviewModalState>(null);
  const previewUrlsRef = useRef<Record<ImageQualityTarget, string | null>>({
    person: null,
    garment: null,
  });
  const analysisVersionRef = useRef<Record<ImageQualityTarget, number>>({
    person: 0,
    garment: 0,
  });

  const resetGarmentResolutionState = useCallback(() => {
    setGarmentAnalysis(null);
    setDisambiguationIntent(null);
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewUrl("person", previewUrlsRef);
      revokePreviewUrl("garment", previewUrlsRef);
    };
  }, []);

  const resolvedPolicy = useMemo(
    () =>
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: garmentAnalysis,
        userDisambiguationIntent: disambiguationIntent,
        internalLabOverride: null,
      }),
    [disambiguationIntent, garmentAnalysis],
  );

  const canGenerate =
    session.status === "authenticated" &&
    Boolean(person.file) &&
    Boolean(garment.file) &&
    !qualityResultHasBlockingIssue(person.quality) &&
    !qualityResultHasBlockingIssue(garment.quality) &&
    !submitting &&
    !analyzing;

  const qualityWarnings = useMemo(
    () => ({
      person: person.quality?.issues.filter(isWarningIssue) ?? [],
      garment: garment.quality?.issues.filter(isWarningIssue) ?? [],
    }),
    [garment.quality, person.quality],
  );

  const hasQualityWarnings =
    qualityWarnings.person.length > 0 || qualityWarnings.garment.length > 0;

  const handleFileChange = useCallback(
    async (file: File | null, target: ImageQualityTarget) => {
      setError(null);
      setRun(null);
      setWarningModalOpened(false);
      setAmbiguityModalOpened(false);
      setQualityOverrideAccepted(false);
      const setter = target === "person" ? setPerson : setGarment;
      const analysisVersion = analysisVersionRef.current[target] + 1;
      analysisVersionRef.current[target] = analysisVersion;
      if (target === "garment") {
        resetGarmentResolutionState();
      }

      if (!file) {
        revokePreviewUrl(target, previewUrlsRef);
        setter(emptySlot);
        return;
      }

      revokePreviewUrl(target, previewUrlsRef);
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current[target] = previewUrl;
      const browserValidation = validateBrowserImageFile(file);
      setter({ file, previewUrl, quality: browserValidation });

      if (browserValidation) {
        return;
      }

      setAnalyzing(true);
      try {
        const { createOpenCvImageQualityAnalyzer } =
          await import("@/lib/image-quality/opencv-analyzer");
        const analyzer = createOpenCvImageQualityAnalyzer();
        const quality = await analyzer.analyze(file, target);
        if (analysisVersionRef.current[target] !== analysisVersion) {
          return;
        }
        setter({ file, previewUrl, quality });
        if (target === "garment" && !qualityResultHasBlockingIssue(quality)) {
          const { createGarmentInputAnalyzer } =
            await import("@/lib/garment-analysis/garment-input-analyzer");
          const garmentAnalyzer = createGarmentInputAnalyzer();
          try {
            const analysis = await garmentAnalyzer.analyze(file);
            if (analysisVersionRef.current[target] !== analysisVersion) {
              return;
            }
            setGarmentAnalysis(analysis);
          } finally {
            garmentAnalyzer.dispose?.();
          }
        }
      } finally {
        if (analysisVersionRef.current[target] === analysisVersion) {
          setAnalyzing(false);
        }
      }
    },
    [resetGarmentResolutionState],
  );

  const handleSubmit = useCallback(
    async (
      overrideAccepted = qualityOverrideAccepted,
      policy = resolvedPolicy,
    ) => {
      if (session.status !== "authenticated" || !person.file || !garment.file) {
        return;
      }

      setSubmitting(true);
      setError(null);
      setRun(null);

      const formData = new FormData();
      formData.append("personImage", person.file);
      formData.append("garmentImage", garment.file);
      formData.append("garmentSource", policy.garmentSource);
      formData.append("garmentIntent", policy.garmentIntent);
      formData.append("category", policy.category);
      formData.append("garmentPhotoType", policy.garmentPhotoType);
      formData.append("generationProfile", policy.generationProfile);
      formData.append(
        "categoryResolutionSource",
        policy.categoryResolutionSource,
      );
      formData.append(
        "photoTypeResolutionSource",
        policy.photoTypeResolutionSource,
      );
      formData.append(
        "profileResolutionSource",
        policy.profileResolutionSource,
      );
      formData.append(
        "analysisConfidence",
        policy.analysisConfidence === null
          ? ""
          : String(policy.analysisConfidence),
      );
      formData.append(
        "disambiguationRequired",
        policy.disambiguationRequired ? "true" : "false",
      );
      formData.append(
        "disambiguationResolved",
        policy.disambiguationResolved ? "true" : "false",
      );
      formData.append(
        "garmentAnalysisBodyCoverage",
        policy.analysisBodyCoverage ?? "",
      );
      formData.append(
        "garmentAnalysisReasonCodes",
        JSON.stringify(policy.analysisReasonCodes),
      );
      formData.append(
        "qualityWarningCodes",
        JSON.stringify(collectQualityWarningCodes(qualityWarnings)),
      );
      formData.append(
        "qualityOverrideAccepted",
        overrideAccepted ? "true" : "false",
      );

      try {
        const created = await createTryOnLabRun(formData, session.accessToken);
        setRun(created);

        let latest = created;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if (latest.status === "COMPLETED" || latest.status === "FAILED") {
            break;
          }

          await wait(2_000);
          latest = await getTryOnLabRun(created.id, session.accessToken);
          setRun(latest);
        }
      } catch (caught) {
        const message =
          caught instanceof SafeApiError
            ? customerSafeErrorMessage(caught.message)
            : "Try-On Lab request failed.";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      garment.file,
      person.file,
      qualityOverrideAccepted,
      qualityWarnings,
      resolvedPolicy,
      session,
    ],
  );

  const handleGenerateClick = useCallback(() => {
    if (!canGenerate) {
      return;
    }

    if (
      resolvedPolicy.disambiguationRequired &&
      !resolvedPolicy.disambiguationResolved
    ) {
      setAmbiguityModalOpened(true);
      return;
    }

    if (hasQualityWarnings && !qualityOverrideAccepted) {
      setWarningModalOpened(true);
      return;
    }

    void handleSubmit();
  }, [
    canGenerate,
    handleSubmit,
    hasQualityWarnings,
    qualityOverrideAccepted,
    resolvedPolicy.disambiguationRequired,
    resolvedPolicy.disambiguationResolved,
  ]);

  const reset = useCallback(() => {
    analysisVersionRef.current.person += 1;
    analysisVersionRef.current.garment += 1;
    revokePreviewUrl("person", previewUrlsRef);
    revokePreviewUrl("garment", previewUrlsRef);
    setPerson(emptySlot);
    setGarment(emptySlot);
    setRun(null);
    setError(null);
    setWarningModalOpened(false);
    setAmbiguityModalOpened(false);
    setQualityOverrideAccepted(false);
    setPreviewModal(null);
    resetGarmentResolutionState();
  }, [resetGarmentResolutionState]);

  const tryAnotherGarment = useCallback(() => {
    analysisVersionRef.current.garment += 1;
    revokePreviewUrl("garment", previewUrlsRef);
    setGarment(emptySlot);
    setRun(null);
    setError(null);
    setWarningModalOpened(false);
    setAmbiguityModalOpened(false);
    setQualityOverrideAccepted(false);
    setPreviewModal(null);
    resetGarmentResolutionState();
  }, [resetGarmentResolutionState]);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Try-On Lab"
        title="Garment Lab"
        description="Validate garment Try-On with guided inputs and clear result feedback."
        status={
          <GarmentLabStatusBadge
            run={run}
            analyzing={analyzing}
            submitting={submitting}
            ready={canGenerate}
          />
        }
      />

      <PageSection>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShirtIcon className="size-5 text-primary" aria-hidden="true" />
                Inputs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border bg-muted/25 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <SparklesIcon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold">Capture clear inputs</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Use a clear person photo and a well-framed garment image for
                    the best result.
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ImageInputCard
                  title="Person Image"
                  target="person"
                  slot={person}
                  className="lg:order-2"
                  onChange={(file) => void handleFileChange(file, "person")}
                  onPreviewOpen={setPreviewModal}
                />
                <ImageInputCard
                  title="Garment Image"
                  target="garment"
                  slot={garment}
                  className="lg:order-1"
                  onChange={(file) => void handleFileChange(file, "garment")}
                  onPreviewOpen={setPreviewModal}
                />
              </div>

              {error ? (
                <Alert color="red" title="Try-On failed">
                  {error}
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                <ShadcnButton
                  type="button"
                  className="min-w-52"
                  onClick={handleGenerateClick}
                  disabled={!canGenerate}
                >
                  {submitting ? (
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                  ) : (
                    <PlayIcon aria-hidden="true" />
                  )}
                  {submitting ? "Creating Try-On" : "Generate Try-On"}
                </ShadcnButton>
                <ShadcnButton
                  type="button"
                  variant="outline"
                  className="min-w-32"
                  onClick={reset}
                  disabled={submitting}
                >
                  <RotateCcwIcon aria-hidden="true" />
                  New Try-On
                </ShadcnButton>
              </div>
              <p className="text-xs text-muted-foreground">
                By generating, you confirm you are authorized to use these
                images.
              </p>
            </CardContent>
          </Card>

          <Card className="xl:sticky xl:top-4">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <SparklesIcon
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                Try-On Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <GarmentResultPanel
                run={run}
                submitting={submitting}
                onPreviewOpen={setPreviewModal}
              />
              {run?.status === "COMPLETED" && run.resultImage ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <ShadcnButton
                    type="button"
                    variant="outline"
                    onClick={tryAnotherGarment}
                  >
                    Try Another Garment
                  </ShadcnButton>
                  <ShadcnButton type="button" variant="outline" onClick={reset}>
                    <RotateCcwIcon aria-hidden="true" />
                    New Try-On
                  </ShadcnButton>
                </div>
              ) : null}
              <div className="flex gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
                <InfoIcon
                  className="mt-0.5 size-4 shrink-0 text-sky-600"
                  aria-hidden="true"
                />
                {canGenerate
                  ? "Inputs are ready. Generate the Try-On securely through SelfX."
                  : "Add valid person and garment images to prepare a Try-On."}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageSection>

      <Modal
        opened={warningModalOpened}
        onClose={() => setWarningModalOpened(false)}
        title="Image quality warning"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            One or more uploaded images may not meet the recommended quality
            guidelines. You can continue, but the Try-On result may be less
            accurate.
          </Text>
          <WarningGroup title="Person photo" issues={qualityWarnings.person} />
          <WarningGroup
            title="Garment photo"
            issues={qualityWarnings.garment}
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              color="gray"
              onClick={() => setWarningModalOpened(false)}
            >
              Re-upload
            </Button>
            <Button
              onClick={() => {
                setQualityOverrideAccepted(true);
                setWarningModalOpened(false);
                void handleSubmit(true);
              }}
            >
              Proceed anyway
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={ambiguityModalOpened}
        onClose={() => setAmbiguityModalOpened(false)}
        title="We found multiple clothing areas in this image. Which item would you like to try on?"
        centered
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {DISAMBIGUATION_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="light"
              color="gray"
              justify="flex-start"
              onClick={() => {
                const selectedPolicy = resolveGenerationPolicy({
                  garmentSource: "DIRECT_UPLOAD",
                  directUploadAnalysis: garmentAnalysis,
                  userDisambiguationIntent: option.value,
                  internalLabOverride: null,
                });
                setDisambiguationIntent(option.value);
                setAmbiguityModalOpened(false);
                if (hasQualityWarnings && !qualityOverrideAccepted) {
                  setWarningModalOpened(true);
                  return;
                }
                void handleSubmit(qualityOverrideAccepted, selectedPolicy);
              }}
            >
              <Stack gap={2} align="flex-start">
                <Text fw={700}>{option.label}</Text>
                <Text size="xs" c="dimmed">
                  {option.description}
                </Text>
              </Stack>
            </Button>
          ))}
        </SimpleGrid>
      </Modal>

      <Modal
        opened={Boolean(previewModal)}
        onClose={() => setPreviewModal(null)}
        title={previewModal?.title}
        size="xl"
        centered
      >
        {previewModal ? (
          <Image
            src={previewModal.imageUrl}
            alt={`${previewModal.title} enlarged preview`}
            fit="contain"
            className="max-h-[75vh] w-full"
          />
        ) : null}
      </Modal>
    </PageContainer>
  );
}

function GarmentLabStatusBadge({
  run,
  analyzing,
  submitting,
  ready,
}: {
  run: TryOnLabRunResponse | null;
  analyzing: boolean;
  submitting: boolean;
  ready: boolean;
}) {
  if (submitting || run?.status === "QUEUED" || run?.status === "PROCESSING") {
    return (
      <Badge variant="secondary">
        <Loader2Icon className="animate-spin" aria-hidden="true" />
        Creating Try-On
      </Badge>
    );
  }
  if (analyzing) {
    return (
      <Badge variant="secondary">
        <Loader2Icon className="animate-spin" aria-hidden="true" />
        Checking images
      </Badge>
    );
  }
  if (run?.status === "COMPLETED") {
    return <Badge className="bg-emerald-600 text-white">Completed</Badge>;
  }
  if (run?.status === "FAILED") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return ready ? (
    <Badge className="bg-emerald-600 text-white">Ready to run</Badge>
  ) : (
    <Badge variant="secondary">Inputs needed</Badge>
  );
}

function GarmentResultPanel({
  run,
  submitting,
  onPreviewOpen,
}: {
  run: TryOnLabRunResponse | null;
  submitting: boolean;
  onPreviewOpen: (preview: { title: string; imageUrl: string }) => void;
}) {
  if (run?.status === "COMPLETED" && run.resultImage) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Result comparison</div>
        <PreviewPanel
          title="Generated Try-On"
          imageUrl={run.resultImage}
          onPreviewOpen={onPreviewOpen}
        />
      </div>
    );
  }

  if (run?.status === "FAILED") {
    return (
      <div className="grid min-h-64 place-items-center rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">
        <div className="max-w-60 space-y-3">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10">
            <AlertCircleIcon className="size-6" aria-hidden="true" />
          </span>
          <div>
            <div className="font-semibold">Try-On failed</div>
            <p className="mt-1 text-sm leading-5">
              {safeRunErrorMessage(run.errorMessage)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (submitting || run?.status === "QUEUED" || run?.status === "PROCESSING") {
    return (
      <div className="grid min-h-64 place-items-center rounded-md border bg-muted/20 p-6 text-center">
        <div className="max-w-56 space-y-3">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
          </span>
          <div>
            <div className="font-semibold text-foreground">
              Creating your Try-On
            </div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Your images are being processed securely by SelfX.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-64 place-items-center rounded-md border bg-muted/20 p-6 text-center">
      <div className="max-w-56 space-y-3">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <ImageIcon className="size-6" aria-hidden="true" />
        </span>
        <div>
          <div className="font-semibold text-foreground">No result yet</div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Add person and garment images, then generate a Try-On to see the
            result here.
          </p>
        </div>
      </div>
    </div>
  );
}

function ImageInputCard({
  title,
  target,
  slot,
  className,
  onChange,
  onPreviewOpen,
}: {
  title: string;
  target: ImageQualityTarget;
  slot: ImageSlot;
  className?: string;
  onChange: (file: File | null) => void;
  onPreviewOpen: (preview: { title: string; imageUrl: string }) => void;
}) {
  const inputId = `garment-lab-${target}-image`;
  const SlotIcon = target === "person" ? UserRoundIcon : ShirtIcon;
  const accent =
    target === "person"
      ? {
          border: "border-violet-300/80",
          icon: "bg-violet-100 text-violet-600",
        }
      : {
          border: "border-orange-300/80",
          icon: "bg-orange-100 text-orange-600",
        };
  const previewTitle = target === "person" ? "Person photo" : "Garment photo";

  return (
    <section
      className={cn(
        "min-h-[27rem] rounded-lg border border-dashed bg-muted/20 p-4",
        accent.border,
        className,
      )}
    >
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept={TRY_ON_LAB_BROWSER_ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
      />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md",
                accent.icon,
              )}
            >
              <SlotIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-muted-foreground">
                {target === "person"
                  ? "Clear, well-lit person photo for the Try-On."
                  : "Product image for automatic garment resolution."}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                JPG, PNG or WebP; up to 8 MB.
              </div>
            </div>
          </div>
          <label
            htmlFor={inputId}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-primary transition-colors hover:bg-primary/10"
            title={slot.file ? "Change image" : "Choose image"}
          >
            <UploadIcon className="size-5" aria-hidden="true" />
            <span className="sr-only">
              {slot.file ? `Change ${title}` : `Choose ${title}`}
            </span>
          </label>
        </div>

        {slot.previewUrl ? (
          <button
            type="button"
            className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-md border bg-background p-0"
            aria-label={`Open ${previewTitle} preview larger`}
            onClick={() =>
              onPreviewOpen({ title: previewTitle, imageUrl: slot.previewUrl! })
            }
          >
            <Image
              src={slot.previewUrl}
              alt={`${previewTitle} preview`}
              fit="contain"
            />
            <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-md border bg-background/90 text-foreground shadow-sm">
              <Maximize2Icon className="size-4" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <label
            htmlFor={inputId}
            className="grid aspect-[4/3] cursor-pointer place-items-center rounded-md border bg-background transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-full",
                  accent.icon,
                )}
              >
                <UploadIcon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-medium text-foreground">Choose image</span>
              <span>Click to upload</span>
            </span>
          </label>
        )}

        {slot.file ? (
          <div className="truncate text-xs text-muted-foreground">
            {slot.file.name}
          </div>
        ) : null}
        <QualitySummary result={slot.quality} />
      </div>
    </section>
  );
}

function PreviewPanel({
  title,
  imageUrl,
  compact = false,
  onPreviewOpen,
}: {
  title: string;
  imageUrl: string | null;
  compact?: boolean;
  onPreviewOpen: (preview: { title: string; imageUrl: string }) => void;
}) {
  return (
    <Stack gap="xs">
      <Text fw={700}>{title}</Text>
      <Box
        component={imageUrl ? "button" : "div"}
        type={imageUrl ? "button" : undefined}
        aria-label={imageUrl ? `Open ${title} larger preview` : undefined}
        onClick={
          imageUrl ? () => onPreviewOpen({ title, imageUrl }) : undefined
        }
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          aspectRatio: "4 / 5",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          background: "var(--muted)",
          cursor: imageUrl ? "zoom-in" : "default",
          padding: 0,
        }}
        className={compact ? "max-h-80" : "max-h-[420px]"}
      >
        {imageUrl ? <Image src={imageUrl} alt={title} fit="contain" /> : null}
        {imageUrl ? (
          <ThemeIcon
            color="dark"
            variant="light"
            size="sm"
            style={{ position: "absolute", right: 8, top: 8 }}
          >
            <Maximize2Icon size={14} aria-hidden="true" />
          </ThemeIcon>
        ) : null}
      </Box>
    </Stack>
  );
}

function QualitySummary({ result }: { result: ImageQualityResult | null }) {
  if (!result) {
    return (
      <div className="text-xs text-muted-foreground">
        Image checks appear after selection.
      </div>
    );
  }

  const blocking = result.issues.filter(
    (issue) => issue.severity === "BLOCKING",
  );
  const warnings = result.issues.filter(
    (issue) => issue.severity === "WARNING",
  );
  const analysisUnavailable = result.issues.some(
    (issue) => issue.code === "IMAGE_QUALITY_ANALYSIS_UNAVAILABLE",
  );
  const tone =
    blocking.length > 0
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : warnings.length > 0
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-emerald-600/30 bg-emerald-50 text-emerald-800";

  return (
    <div className={cn("space-y-2 rounded-md border p-3 text-xs", tone)}>
      <div className="flex flex-wrap items-center gap-2 font-medium">
        {blocking.length > 0 ? (
          <AlertCircleIcon className="size-4" aria-hidden="true" />
        ) : warnings.length > 0 ? (
          <TriangleAlertIcon className="size-4" aria-hidden="true" />
        ) : (
          <CheckCircle2Icon className="size-4" aria-hidden="true" />
        )}
        <span>
          {blocking.length > 0
            ? "Image blocked"
            : warnings.length > 0
              ? "Review suggested"
              : "Image ready"}
        </span>
        <span className="font-normal opacity-80">
          {analysisUnavailable
            ? "Score unavailable"
            : `Score ${result.score}/100`}
        </span>
      </div>
      {result.issues.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {result.issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      ) : (
        <div>Resolution, exposure and contrast look usable.</div>
      )}
      <div className="opacity-75">
        {formatMetric(result.metrics.width)}x
        {formatMetric(result.metrics.height)}, sharpness{" "}
        {formatMetric(result.metrics.sharpness)}, brightness{" "}
        {formatMetric(result.metrics.brightness)}, contrast{" "}
        {formatMetric(result.metrics.contrast)}
      </div>
    </div>
  );
}

function WarningGroup({
  title,
  issues,
}: {
  title: string;
  issues: ImageQualityIssue[];
}) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs">
      <Text fw={700}>{title}</Text>
      <List size="sm">
        {issues.map((issue) => (
          <List.Item key={`${title}-${issue.code}`}>{issue.message}</List.Item>
        ))}
      </List>
    </Stack>
  );
}

function isWarningIssue(issue: ImageQualityIssue): boolean {
  return issue.severity === "WARNING";
}

function collectQualityWarningCodes(warnings: {
  person: ImageQualityIssue[];
  garment: ImageQualityIssue[];
}): ImageQualityIssueCode[] {
  return [
    ...new Set(
      [...warnings.person, ...warnings.garment].map((issue) => issue.code),
    ),
  ];
}

function formatMetric(value: number | null): string {
  return value === null ? "not analyzed" : String(value);
}

function safeRunErrorMessage(message?: string): string {
  if (!message || /fashn|provider|model|prediction/i.test(message)) {
    return "We could not create this Try-On. Check both images and try again.";
  }
  return message;
}

function customerSafeErrorMessage(message: string): string {
  return /fashn|provider|model|prediction/i.test(message)
    ? "Try-On could not be completed right now. Try again shortly."
    : message;
}

function revokePreviewUrl(
  target: ImageQualityTarget,
  ref: { current: Record<ImageQualityTarget, string | null> },
): void {
  const previewUrl = ref.current[target];
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    ref.current[target] = null;
  }
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
