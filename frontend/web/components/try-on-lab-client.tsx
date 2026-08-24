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
  Maximize2Icon,
  RotateCcwIcon,
  SparklesIcon,
} from "lucide-react";

import {
  Alert as ShadcnAlert,
  AlertDescription,
  AlertTitle,
  Button as ShadcnButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  FormActions,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  SectionCard,
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
        justify === "flex-start" && "h-auto justify-start whitespace-normal p-4 text-left",
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

function FileInput({
  label,
  placeholder,
  accept,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  accept: string;
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputId = `try-on-lab-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <label
        htmlFor={inputId}
        className="flex min-h-24 cursor-pointer flex-col justify-center rounded-lg border border-dashed bg-muted/30 p-4 text-sm transition-colors hover:border-primary hover:bg-[color-mix(in_srgb,var(--selfx-primary),white_94%)]"
      >
        <span className="font-semibold text-foreground">
          {value?.name ?? placeholder}
        </span>
        <span className="mt-1 text-muted-foreground">JPEG, PNG or WebP.</span>
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
      />
    </div>
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
        color === "green" && "border-emerald-200 bg-emerald-50 text-emerald-700",
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
            ? caught.message
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
  }, []);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Try-On Lab"
      />

      <PageSection>
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <ImageInputCard
            title="Upload model photo"
            target="person"
            slot={person}
            onChange={(file) => void handleFileChange(file, "person")}
            onPreviewOpen={setPreviewModal}
          />
          <ImageInputCard
            title="Upload garment image"
            target="garment"
            slot={garment}
            onChange={(file) => void handleFileChange(file, "garment")}
            onPreviewOpen={setPreviewModal}
          />
        </SimpleGrid>
      </PageSection>

      <PageSection>
        <SectionCard>
          <Stack gap="md">
            {error ? (
              <Alert color="red" title="Try-On failed">
                {error}
              </Alert>
            ) : null}
            {run?.errorMessage ? (
              <Alert color="red" title={run.errorCode ?? "TRYON_FAILED"}>
                {run.errorMessage}
              </Alert>
            ) : null}
            <FormActions>
              <Button
                variant="light"
                color="gray"
                onClick={reset}
                className="w-full sm:w-auto"
              >
                <RotateCcwIcon size={16} aria-hidden="true" />
                New Try-On
              </Button>
              <Button
                onClick={handleGenerateClick}
                disabled={!canGenerate}
                className="w-full sm:w-auto"
              >
                <SparklesIcon size={16} aria-hidden="true" />
                {submitting ? "Generating" : "Generate Try-On"}
              </Button>
            </FormActions>
          </Stack>
        </SectionCard>
      </PageSection>

      {run?.status === "COMPLETED" && run.resultImage ? (
        <PageSection>
          <SectionCard title="Try-On Result">
            <div className="mx-auto max-w-2xl">
              <PreviewPanel
                title="Generated Try-On"
                imageUrl={run.resultImage}
                onPreviewOpen={setPreviewModal}
              />
            </div>
            <FormActions align="apart">
              <Button
                variant="light"
                color="gray"
                onClick={tryAnotherGarment}
                className="w-full sm:w-auto"
              >
                Try Another Garment
              </Button>
              <Button
                variant="light"
                onClick={reset}
                className="w-full sm:w-auto"
              >
                <RotateCcwIcon size={16} aria-hidden="true" />
                New Try-On
              </Button>
            </FormActions>
          </SectionCard>
        </PageSection>
      ) : null}

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

function ImageInputCard({
  title,
  target,
  slot,
  onChange,
  onPreviewOpen,
}: {
  title: string;
  target: ImageQualityTarget;
  slot: ImageSlot;
  onChange: (file: File | null) => void;
  onPreviewOpen: (preview: { title: string; imageUrl: string }) => void;
}) {
  return (
    <SectionCard title={title}>
      <Stack gap="md">
        <FileInput
          label={target === "person" ? "Model photo" : "Garment image"}
          placeholder={
            slot.file ? "Change / re-upload" : "Choose JPEG, PNG or WebP"
          }
          accept={TRY_ON_LAB_BROWSER_ACCEPTED_IMAGE_TYPES.join(",")}
          value={slot.file}
          onChange={onChange}
        />
        {slot.previewUrl ? (
          <PreviewPanel
            title={`${title} preview`}
            imageUrl={slot.previewUrl}
            compact
            onPreviewOpen={onPreviewOpen}
          />
        ) : null}
      </Stack>
    </SectionCard>
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
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fit="contain" />
        ) : null}
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
