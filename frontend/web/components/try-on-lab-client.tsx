"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ImageIcon,
  Maximize2Icon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  Alert,
  Badge,
  Box,
  Button,
  FileInput,
  FormActions,
  Group,
  Image,
  List,
  Modal,
  PageContainer,
  PageHeader,
  PageSection,
  Progress,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  StatusBadge,
  Text,
  ThemeIcon,
} from "@selfx/ui";
import {
  type GarmentInputAnalysisResult,
  type ImageQualityIssue,
  type ImageQualityIssueCode,
  type ImageQualityResult,
  type ImageQualityTarget,
  type SelfxGarmentPhotoType,
  type SelfxGenerationProfile,
  type SelfxGarmentIntent,
  type ResolvedGenerationPolicy,
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

type LabUiState =
  | "IDLE"
  | "ANALYZING"
  | "READY"
  | "SUBMITTING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

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

export function TryOnLabClient() {
  const session = useSession();
  const [person, setPerson] = useState<ImageSlot>(emptySlot);
  const [garment, setGarment] = useState<ImageSlot>(emptySlot);
  const [garmentAnalysis, setGarmentAnalysis] =
    useState<GarmentInputAnalysisResult | null>(null);
  const [disambiguationIntent, setDisambiguationIntent] =
    useState<SelfxGarmentIntent | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedGarmentIntent, setAdvancedGarmentIntent] =
    useState<SelfxGarmentIntent | null>(null);
  const [advancedGarmentPhotoType, setAdvancedGarmentPhotoType] =
    useState<SelfxGarmentPhotoType | null>(null);
  const [advancedGenerationProfile, setAdvancedGenerationProfile] =
    useState<SelfxGenerationProfile | null>(null);
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
    setAdvancedGarmentIntent(null);
    setAdvancedGarmentPhotoType(null);
    setAdvancedGenerationProfile(null);
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewUrl("person", previewUrlsRef);
      revokePreviewUrl("garment", previewUrlsRef);
    };
  }, []);

  const internalLabOverride = useMemo(
    () =>
      advancedGarmentIntent ||
      advancedGarmentPhotoType ||
      advancedGenerationProfile
        ? {
            garmentIntent: advancedGarmentIntent ?? undefined,
            garmentPhotoType: advancedGarmentPhotoType ?? undefined,
            generationProfile: advancedGenerationProfile ?? undefined,
          }
        : null,
    [
      advancedGarmentIntent,
      advancedGarmentPhotoType,
      advancedGenerationProfile,
    ],
  );

  const resolvedPolicy = useMemo(
    () =>
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: garmentAnalysis,
        userDisambiguationIntent: disambiguationIntent,
        internalLabOverride,
      }),
    [disambiguationIntent, garmentAnalysis, internalLabOverride],
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

  const uiState: LabUiState = useMemo(() => {
    if (submitting) {
      return "SUBMITTING";
    }
    if (analyzing) {
      return "ANALYZING";
    }
    if (run?.status === "COMPLETED") {
      return "COMPLETED";
    }
    if (run?.status === "FAILED") {
      return "FAILED";
    }
    if (run?.status === "PROCESSING") {
      return "PROCESSING";
    }
    if (run?.status === "QUEUED") {
      return "QUEUED";
    }
    if (canGenerate) {
      return "READY";
    }
    return "IDLE";
  }, [analyzing, canGenerate, run?.status, submitting]);

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
        eyebrow="Internal development"
        title="Try-On Lab"
        description="Upload a person image and garment image to validate the core SelfX VTO loop before production catalog, assets, queues and kiosk capture are implemented."
        status={
          <Group gap="xs" wrap="wrap">
            <StatusBadge status={uiState} label={stateLabel(uiState)} />
            <Badge color="gray" variant="light">
              Internal Lab
            </Badge>
          </Group>
        }
      />

      <PageSection>
        <Alert
          color="blue"
          title="Internal testing only"
          icon={<AlertCircleIcon size={18} aria-hidden="true" />}
        >
          Upload only images you are authorized to process.
        </Alert>
      </PageSection>

      <PageSection>
        <SectionHeader
          title="Images"
          description="Add the person photo and garment photo for this internal lab run."
        />
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <ImageInputCard
            title="Person photo"
            target="person"
            slot={person}
            onChange={(file) => void handleFileChange(file, "person")}
            onPreviewOpen={setPreviewModal}
          />
          <ImageInputCard
            title="Garment photo"
            target="garment"
            slot={garment}
            onChange={(file) => void handleFileChange(file, "garment")}
            onPreviewOpen={setPreviewModal}
          />
        </SimpleGrid>
      </PageSection>

      <PageSection>
        <SectionCard
          title="Generate Try-On"
          description="Try-On settings are selected automatically."
        >
          <Stack gap="lg">
            <PolicySummary policy={resolvedPolicy} />
            <AdvancedSettings
              opened={advancedOpen}
              onToggle={() => setAdvancedOpen((value) => !value)}
              garmentIntent={advancedGarmentIntent}
              garmentPhotoType={advancedGarmentPhotoType}
              generationProfile={advancedGenerationProfile}
              onGarmentIntentChange={setAdvancedGarmentIntent}
              onGarmentPhotoTypeChange={setAdvancedGarmentPhotoType}
              onGenerationProfileChange={setAdvancedGenerationProfile}
            />
            <FormActions>
              <Button
                variant="light"
                color="gray"
                leftSection={<RotateCcwIcon size={16} aria-hidden="true" />}
                onClick={reset}
                w={{ base: "100%", sm: "auto" }}
              >
                New Try-On
              </Button>
              <Button
                leftSection={<SparklesIcon size={16} aria-hidden="true" />}
                onClick={handleGenerateClick}
                disabled={!canGenerate}
                w={{ base: "100%", sm: "auto" }}
              >
                Generate Try-On
              </Button>
            </FormActions>
          </Stack>
        </SectionCard>
      </PageSection>

      <PageSection>
        <SectionCard
          title="Generation state"
          description={stateDescription(uiState)}
        >
          <Stack gap="md">
            <Progress
              value={progressValue(uiState)}
              animated={["SUBMITTING", "QUEUED", "PROCESSING"].includes(
                uiState,
              )}
              color={uiState === "FAILED" ? "red" : "blue"}
            />
            {error ? (
              <Alert color="red" title="Try-On Lab error">
                {error}
              </Alert>
            ) : null}
            {run?.errorMessage ? (
              <Alert color="red" title={run.errorCode ?? "TRYON_FAILED"}>
                {run.errorMessage}
              </Alert>
            ) : null}
            {run ? (
              <Text size="sm" c="dimmed">
                SelfX run ID: {run.id}
              </Text>
            ) : null}
          </Stack>
        </SectionCard>
      </PageSection>

      {run ? (
        <PageSection>
          <RunSummary run={run} />
        </PageSection>
      ) : null}

      {run?.status === "COMPLETED" && run.resultImage ? (
        <PageSection>
          <SectionCard
            title="Result comparison"
            description="Ephemeral development output. No history or permanent media storage is implemented in this slice."
          >
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <PreviewPanel
                title="Person"
                imageUrl={person.previewUrl}
                onPreviewOpen={setPreviewModal}
              />
              <PreviewPanel
                title="Garment"
                imageUrl={garment.previewUrl}
                onPreviewOpen={setPreviewModal}
              />
              <PreviewPanel
                title="Generated Try-On"
                imageUrl={run.resultImage}
                onPreviewOpen={setPreviewModal}
              />
            </SimpleGrid>
            <FormActions align="apart">
              <Button
                variant="light"
                color="gray"
                onClick={tryAnotherGarment}
                w={{ base: "100%", sm: "auto" }}
              >
                Try Another Garment
              </Button>
              <Button
                variant="light"
                leftSection={<RotateCcwIcon size={16} aria-hidden="true" />}
                onClick={reset}
                w={{ base: "100%", sm: "auto" }}
              >
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
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {DISAMBIGUATION_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="light"
              color="gray"
              justify="flex-start"
              h="auto"
              p="md"
              onClick={() => {
                const selectedPolicy = resolveGenerationPolicy({
                  garmentSource: "DIRECT_UPLOAD",
                  directUploadAnalysis: garmentAnalysis,
                  userDisambiguationIntent: option.value,
                  internalLabOverride,
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
            mah="75vh"
            w="100%"
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
    <SectionCard
      title={title}
      description={
        target === "person"
          ? "Use a clear person photo. Body-region validation comes later."
          : "Use a clear garment reference photo."
      }
    >
      <Stack gap="md">
        <FileInput
          label={title}
          placeholder={
            slot.file ? "Change / re-upload" : "Choose JPEG, PNG or WebP"
          }
          accept={TRY_ON_LAB_BROWSER_ACCEPTED_IMAGE_TYPES.join(",")}
          value={slot.file}
          onChange={onChange}
          leftSection={<ImageIcon size={16} aria-hidden="true" />}
        />
        {slot.previewUrl ? (
          <PreviewPanel
            title={`${title} preview`}
            imageUrl={slot.previewUrl}
            compact
            onPreviewOpen={onPreviewOpen}
          />
        ) : null}
        <QualitySummary result={slot.quality} />
      </Stack>
    </SectionCard>
  );
}

function PolicySummary({ policy }: { policy: ResolvedGenerationPolicy }) {
  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        <Badge color="blue" variant="light">
          {labelForIntent(policy.garmentIntent)}
        </Badge>
        <Badge color="gray" variant="light">
          {labelForPhotoType(policy.garmentPhotoType)}
        </Badge>
        <Badge color="gray" variant="light">
          {labelForProfile(policy.generationProfile)}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed">
        {policy.disambiguationRequired
          ? "This garment image may include more than one clothing area."
          : "Automatic resolution will be recorded with this lab run."}
      </Text>
    </Stack>
  );
}

function AdvancedSettings({
  opened,
  onToggle,
  garmentIntent,
  garmentPhotoType,
  generationProfile,
  onGarmentIntentChange,
  onGarmentPhotoTypeChange,
  onGenerationProfileChange,
}: {
  opened: boolean;
  onToggle: () => void;
  garmentIntent: SelfxGarmentIntent | null;
  garmentPhotoType: SelfxGarmentPhotoType | null;
  generationProfile: SelfxGenerationProfile | null;
  onGarmentIntentChange: (value: SelfxGarmentIntent | null) => void;
  onGarmentPhotoTypeChange: (value: SelfxGarmentPhotoType | null) => void;
  onGenerationProfileChange: (value: SelfxGenerationProfile | null) => void;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Stack gap={2}>
          <Text fw={700}>Advanced settings</Text>
          <Text size="sm" c="dimmed">
            Internal Lab override for testing only.
          </Text>
        </Stack>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<SlidersHorizontalIcon size={16} aria-hidden="true" />}
          onClick={onToggle}
        >
          {opened ? "Hide" : "Show"}
        </Button>
      </Group>
      {opened ? (
        <Stack gap="md">
          <SegmentedControl
            value={garmentIntent ?? "AUTOMATIC"}
            onChange={(value) =>
              onGarmentIntentChange(
                value === "AUTOMATIC" ? null : (value as SelfxGarmentIntent),
              )
            }
            data={[
              { label: "Automatic", value: "AUTOMATIC" },
              { label: "Auto", value: "AUTO" },
              { label: "Top", value: "TOP" },
              { label: "Bottom", value: "BOTTOM" },
              { label: "One-piece", value: "ONE_PIECE" },
              { label: "Full outfit", value: "FULL_OUTFIT" },
            ]}
          />
          <SegmentedControl
            value={garmentPhotoType ?? "AUTOMATIC"}
            onChange={(value) =>
              onGarmentPhotoTypeChange(
                value === "AUTOMATIC" ? null : (value as SelfxGarmentPhotoType),
              )
            }
            data={[
              { label: "Automatic", value: "AUTOMATIC" },
              { label: "Auto photo", value: "AUTO" },
              { label: "Flat lay", value: "FLAT_LAY" },
              { label: "On model", value: "ON_MODEL" },
            ]}
          />
          <SegmentedControl
            value={generationProfile ?? "AUTOMATIC"}
            onChange={(value) =>
              onGenerationProfileChange(
                value === "AUTOMATIC"
                  ? null
                  : (value as SelfxGenerationProfile),
              )
            }
            data={[
              { label: "Automatic", value: "AUTOMATIC" },
              { label: "Performance", value: "PERFORMANCE" },
              { label: "Balanced", value: "BALANCED" },
              { label: "Quality", value: "QUALITY" },
            ]}
          />
        </Stack>
      ) : null}
    </Stack>
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
          border: "1px solid var(--mantine-color-gray-3)",
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
          background: "var(--mantine-color-gray-0)",
          cursor: imageUrl ? "zoom-in" : "default",
          padding: 0,
        }}
        h={compact ? { base: 220, sm: 260, xl: 300 } : undefined}
        mah={compact ? 320 : 420}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fit="contain" h="100%" w="100%" />
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

function RunSummary({ run }: { run: TryOnLabRunResponse }) {
  const telemetry = run.telemetry;
  const qualityWarnings =
    telemetry.qualityWarningCodes.length > 0
      ? telemetry.qualityWarningCodes.join(", ")
      : "None";
  const elapsed =
    typeof telemetry.elapsedMs === "number"
      ? `${telemetry.elapsedMs} ms`
      : "In progress";

  return (
    <SectionCard
      title="Run summary"
      description="Automatic settings were used for this development run."
    >
      <Stack gap="md">
        <Group gap="xs" wrap="wrap">
          <StatusBadge
            status={telemetry.status}
            label={stateLabel(telemetry.status)}
          />
          <Text size="sm" c="dimmed">
            {run.status === "COMPLETED"
              ? "Try-On result is ready."
              : stateDescription(run.status)}
          </Text>
          <Text size="sm" c="dimmed">
            Elapsed: {elapsed}
          </Text>
        </Group>

        <Box
          component="details"
          style={{
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "var(--mantine-radius-md)",
            padding: "var(--mantine-spacing-sm)",
          }}
        >
          <Box
            component="summary"
            style={{
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Run diagnostics
          </Box>
          <Text size="sm" c="dimmed" mt="xs">
            Current-run telemetry only. Provider identifiers, credentials, raw
            images and Base64 payloads stay hidden.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mt="md">
            <DetailItem label="Status" value={telemetry.status} />
            <DetailItem
              label="Provider"
              value={telemetry.providerDisplayName}
            />
            <DetailItem
              label="Model / profile"
              value={`${telemetry.model} / ${telemetry.profile}`}
            />
            <DetailItem
              label="Garment"
              value={`${telemetry.garmentIntent} / ${telemetry.garmentPhotoType}`}
            />
            <DetailItem
              label="Resolution"
              value={`${telemetry.categoryResolutionSource} / ${telemetry.photoTypeResolutionSource}`}
            />
            <DetailItem
              label="Source"
              value={`${telemetry.garmentSource} / ${telemetry.profileResolutionSource}`}
            />
            <DetailItem
              label="Analysis"
              value={
                telemetry.garmentAnalysisBodyCoverage
                  ? `${telemetry.garmentAnalysisBodyCoverage} / ${formatOptionalMetric(
                      telemetry.analysisConfidence,
                    )}`
                  : "Unavailable"
              }
            />
            <DetailItem label="Elapsed" value={elapsed} />
            <DetailItem label="Quality warnings" value={qualityWarnings} />
            <DetailItem
              label="Override accepted"
              value={telemetry.qualityOverrideAccepted ? "Yes" : "No"}
            />
            <DetailItem
              label="Disambiguation"
              value={telemetry.disambiguationResolved ? "Selected" : "None"}
            />
            <DetailItem label="Channel" value={telemetry.channel} />
          </SimpleGrid>
        </Box>
      </Stack>
    </SectionCard>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600}>
        {value}
      </Text>
    </Stack>
  );
}

function QualitySummary({ result }: { result: ImageQualityResult | null }) {
  if (!result) {
    return (
      <Text size="sm" c="dimmed">
        Quality analysis appears after image selection.
      </Text>
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

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        <ThemeIcon
          color={
            blocking.length > 0
              ? "red"
              : warnings.length > 0
                ? "yellow"
                : "green"
          }
          variant="light"
          radius="xl"
        >
          {blocking.length > 0 ? (
            <AlertCircleIcon size={16} />
          ) : warnings.length > 0 ? (
            <TriangleAlertIcon size={16} />
          ) : (
            <CheckCircle2Icon size={16} />
          )}
        </ThemeIcon>
        <Badge
          color={
            blocking.length > 0
              ? "red"
              : warnings.length > 0
                ? "yellow"
                : "green"
          }
        >
          {blocking.length > 0
            ? "blocked"
            : warnings.length > 0
              ? "warnings"
              : "ready"}
        </Badge>
        <Text size="sm" c="dimmed">
          {analysisUnavailable
            ? "Score unavailable"
            : `Score ${result.score}/100`}
        </Text>
      </Group>
      {result.issues.length > 0 ? (
        <List size="sm" spacing={4}>
          {result.issues.map((issue) => (
            <List.Item key={issue.code}>{issue.message}</List.Item>
          ))}
        </List>
      ) : (
        <Text size="sm" c="dimmed">
          Resolution, exposure and contrast look usable for this lab.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {formatMetric(result.metrics.width)}x
        {formatMetric(result.metrics.height)}, sharpness{" "}
        {formatMetric(result.metrics.sharpness)}, brightness{" "}
        {formatMetric(result.metrics.brightness)}, contrast{" "}
        {formatMetric(result.metrics.contrast)}
      </Text>
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
      <List size="sm" spacing={4}>
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

function formatOptionalMetric(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "not analyzed";
}

function labelForIntent(intent: SelfxGarmentIntent): string {
  switch (intent) {
    case "AUTO":
      return "Automatic garment";
    case "TOP":
      return "Upper garment";
    case "BOTTOM":
      return "Lower garment";
    case "ONE_PIECE":
      return "One-piece";
    case "FULL_OUTFIT":
      return "Full outfit";
  }
}

function labelForPhotoType(photoType: SelfxGarmentPhotoType): string {
  switch (photoType) {
    case "AUTO":
      return "Automatic photo type";
    case "FLAT_LAY":
      return "Flat lay";
    case "ON_MODEL":
      return "On model";
  }
}

function labelForProfile(profile: SelfxGenerationProfile): string {
  switch (profile) {
    case "PERFORMANCE":
      return "Performance profile";
    case "BALANCED":
      return "Balanced profile";
    case "QUALITY":
      return "Quality profile";
  }
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

function stateLabel(state: LabUiState): string {
  return state.toLowerCase().replace("_", " ");
}

function stateDescription(state: LabUiState): string {
  switch (state) {
    case "IDLE":
      return "Add both images, review quality and generate.";
    case "ANALYZING":
      return "Analyzing images...";
    case "READY":
      return "Ready to submit.";
    case "SUBMITTING":
      return "Submitting Try-On...";
    case "QUEUED":
      return "Try-On request is queued.";
    case "PROCESSING":
      return "Generating Try-On...";
    case "COMPLETED":
      return "Try-On ready.";
    case "FAILED":
      return "Try-On failed.";
  }
}

function progressValue(state: LabUiState): number {
  switch (state) {
    case "IDLE":
      return 0;
    case "ANALYZING":
      return 18;
    case "READY":
      return 28;
    case "SUBMITTING":
      return 40;
    case "QUEUED":
      return 55;
    case "PROCESSING":
      return 75;
    case "COMPLETED":
      return 100;
    case "FAILED":
      return 100;
  }
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
