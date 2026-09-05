"use client";

import { useEffect, useRef, useState } from "react";
import type {
  JewelleryTryOnLabRunResponse,
  SelfxJewelleryCaptureRequirements,
  SelfxJewelleryPersonSemanticEvidence,
  SelfxJewelleryType,
} from "@selfx/shared";
import {
  CircleDotIcon,
  CircleCheckIcon,
  EarIcon,
  GemIcon,
  HandIcon,
  ImageIcon,
  InfoIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UploadIcon,
  WatchIcon,
  type LucideIcon,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageContainer,
  PageHeader,
  PageSection,
  cn,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  readImageDimensions,
  type ImageDimensions,
} from "@/lib/image-dimensions";
import {
  createJewelleryTryOnLabRun,
  getJewelleryCaptureRequirements,
  getJewelleryTryOnLabRun,
} from "@/lib/try-on-lab-api";
import {
  createJewelleryPersonAnalyzer,
  type JewelleryPersonAnalyzer,
} from "@/lib/jewellery-analysis/jewellery-person-analyzer";
import { useSession } from "@/lib/session";

const jewelleryTypeOptions: Array<{
  value: SelfxJewelleryType;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    value: "RING",
    label: "Ring",
    icon: CircleDotIcon,
    iconClassName: "text-orange-600",
  },
  {
    value: "EARRING",
    label: "Earrings",
    icon: EarIcon,
    iconClassName: "text-rose-600",
  },
  {
    value: "NECKLACE",
    label: "Necklace",
    icon: GemIcon,
    iconClassName: "text-teal-600",
  },
  {
    value: "BRACELET",
    label: "Bracelet",
    icon: WatchIcon,
    iconClassName: "text-sky-600",
  },
];

type ImageSlot = {
  file: File | null;
  previewUrl: string | null;
  dimensions: ImageDimensions | null;
  dimensionReadFailed: boolean;
};

const emptyImageSlot: ImageSlot = {
  file: null,
  previewUrl: null,
  dimensions: null,
  dimensionReadFailed: false,
};

const providerMinImageDimension = 640;
const providerMaxImageDimension = 4096;
const personResizeMinDimension = 480;
const labMaxImageBytes = 8 * 1024 * 1024;

export default function JewelleryTryOnLabPage() {
  const session = useSession();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const personAnalysisVersionRef = useRef(0);
  const personAnalyzerRef = useRef<JewelleryPersonAnalyzer | null>(null);
  const personPreviewRef = useRef<string | null>(null);
  const jewelleryPreviewRef = useRef<string | null>(null);
  const [personImage, setPersonImage] = useState<ImageSlot>(emptyImageSlot);
  const [jewelleryImage, setJewelleryImage] =
    useState<ImageSlot>(emptyImageSlot);
  const [jewelleryType, setJewelleryType] =
    useState<SelfxJewelleryType>("RING");
  const [requirements, setRequirements] =
    useState<SelfxJewelleryCaptureRequirements | null>(null);
  const [personSemanticEvidence, setPersonSemanticEvidence] =
    useState<SelfxJewelleryPersonSemanticEvidence | null>(null);
  const [analyzingPerson, setAnalyzingPerson] = useState(false);
  const [run, setRun] = useState<JewelleryTryOnLabRunResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      clearPollTimer(pollTimerRef);
      revokePreview(personPreviewRef.current);
      revokePreview(jewelleryPreviewRef.current);
      personAnalyzerRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    if (session.status !== "authenticated") {
      setRequirements(null);
      return;
    }
    let cancelled = false;
    void getJewelleryCaptureRequirements(jewelleryType, session.accessToken)
      .then((nextRequirements) => {
        if (!cancelled) {
          setRequirements(nextRequirements);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setRequirements(null);
          setError(messageFor(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jewelleryType, session.accessToken, session.status]);

  useEffect(() => {
    if (personImage.file && !imageTechnicalIssue(personImage, "person")) {
      void analyzePersonImage(personImage.file, jewelleryType);
    } else {
      setPersonSemanticEvidence(null);
      setAnalyzingPerson(false);
    }
    // Re-run semantic checks whenever the selected jewellery type changes.
  }, [jewelleryType, personImage.file]);

  async function analyzePersonImage(
    file: File,
    selectedJewelleryType: SelfxJewelleryType,
  ) {
    const version = ++personAnalysisVersionRef.current;
    setAnalyzingPerson(true);
    setPersonSemanticEvidence(null);
    personAnalyzerRef.current ??= createJewelleryPersonAnalyzer();
    const evidence = await personAnalyzerRef.current.analyze(
      file,
      selectedJewelleryType,
    );
    if (version === personAnalysisVersionRef.current) {
      setPersonSemanticEvidence(evidence);
      setAnalyzingPerson(false);
    }
  }

  function updatePersonImage(nextSlot: ImageSlot) {
    personAnalysisVersionRef.current += 1;
    revokePreview(personPreviewRef.current);
    personPreviewRef.current = nextSlot.previewUrl;
    setPersonImage(nextSlot);
    setPersonSemanticEvidence(null);
    setAnalyzingPerson(false);
    setError(null);
    setRun(null);
  }

  function updateJewelleryImage(nextSlot: ImageSlot) {
    revokePreview(jewelleryPreviewRef.current);
    jewelleryPreviewRef.current = nextSlot.previewUrl;
    setJewelleryImage(nextSlot);
    setError(null);
    setRun(null);
  }

  function selectJewelleryType(nextType: SelfxJewelleryType) {
    setJewelleryType(nextType);
    setError(null);
    setRun(null);
  }

  function resetLab() {
    clearPollTimer(pollTimerRef);
    personAnalysisVersionRef.current += 1;
    revokePreview(personPreviewRef.current);
    revokePreview(jewelleryPreviewRef.current);
    personPreviewRef.current = null;
    jewelleryPreviewRef.current = null;
    setPersonImage(emptyImageSlot);
    setJewelleryImage(emptyImageSlot);
    setPersonSemanticEvidence(null);
    setAnalyzingPerson(false);
    setRun(null);
    setError(null);
  }

  async function submitRun() {
    if (session.status !== "authenticated") {
      setError("Sign in before running the Jewellery Lab.");
      return;
    }
    if (!personImage.file || !jewelleryImage.file) {
      setError("Add both a person image and a jewellery image.");
      return;
    }
    const technicalIssue =
      imageTechnicalIssue(jewelleryImage, "jewellery") ??
      imageTechnicalIssue(personImage, "person");
    if (technicalIssue) {
      setError(technicalIssue);
      return;
    }
    if (!personSemanticEvidence || analyzingPerson) {
      setError("Wait for the person-photo check to finish.");
      return;
    }

    clearPollTimer(pollTimerRef);
    setSubmitting(true);
    setError(null);
    setRun(null);

    try {
      const formData = new FormData();
      formData.append("personImage", personImage.file);
      formData.append("jewelleryImage", jewelleryImage.file);
      formData.append("jewelleryType", jewelleryType);
      formData.append(
        "personSemanticEvidence",
        JSON.stringify(personSemanticEvidence),
      );

      const created = await createJewelleryTryOnLabRun(
        formData,
        session.accessToken,
      );
      setRun(created);

      if (created.status === "QUEUED" || created.status === "PROCESSING") {
        pollTimerRef.current = setInterval(() => {
          void pollRun(created.id, session.accessToken);
        }, 2500);
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function pollRun(runId: string, accessToken: string) {
    try {
      const nextRun = await getJewelleryTryOnLabRun(runId, accessToken);
      setRun(nextRun);
      if (nextRun.status === "COMPLETED" || nextRun.status === "FAILED") {
        clearPollTimer(pollTimerRef);
      }
    } catch (caught) {
      clearPollTimer(pollTimerRef);
      setError(messageFor(caught));
    }
  }

  const busy =
    submitting || run?.status === "QUEUED" || run?.status === "PROCESSING";
  const semanticIssue = semanticEvidenceIssue(
    personSemanticEvidence,
    requirements,
  );
  const dimensionIssue =
    imageTechnicalIssue(jewelleryImage, "jewellery") ??
    imageTechnicalIssue(personImage, "person");
  const readyToRun = Boolean(
    personImage.file &&
    jewelleryImage.file &&
    personSemanticEvidence &&
    !analyzingPerson &&
    !dimensionIssue &&
    !semanticIssue,
  );
  const workflowStep = !jewelleryImage.file ? 1 : !personImage.file ? 2 : 3;
  const selectedType = jewelleryTypeOptions.find(
    (option) => option.value === jewelleryType,
  )!;
  const SelectedTypeIcon = selectedType.icon;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Try-On Lab"
        title="Jewellery Lab"
        description="Validate jewellery Try-On with guided inputs and clear result feedback."
        status={<RunStatusBadge run={run} readyToRun={readyToRun} />}
      />

      {error ? (
        <PageSection>
          <Alert variant="destructive">
            <ShieldAlertIcon aria-hidden="true" />
            <AlertTitle>Jewellery Lab request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GemIcon className="size-5 text-primary" aria-hidden="true" />
                  Inputs
                </CardTitle>
                <WorkflowSteps activeStep={workflowStep} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Jewellery Type</div>
                <div
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                  role="group"
                  aria-label="Jewellery types"
                >
                  {jewelleryTypeOptions.map((option) => {
                    const TypeIcon = option.icon;
                    const selected = option.value === jewelleryType;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="outline"
                        aria-pressed={selected}
                        className={cn(
                          "h-11 justify-center border-border bg-background px-3",
                          selected &&
                            "border-primary bg-primary/5 text-primary ring-1 ring-primary/30",
                        )}
                        onClick={() => selectJewelleryType(option.value)}
                      >
                        <TypeIcon
                          className={cn("size-4", option.iconClassName)}
                          aria-hidden="true"
                        />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {requirements ? (
                <div className="grid gap-3 rounded-md border bg-muted/25 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <div className="grid size-11 place-items-center rounded-md bg-primary/10">
                    <SelectedTypeIcon
                      className={cn("size-6", selectedType.iconClassName)}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">{requirements.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {requirements.instruction}
                    </div>
                  </div>
                  <div className="flex max-w-64 items-start gap-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    <InfoIcon
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    Clear, unobstructed framing gives the best placement.
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <ImageUploadCard
                  title="Jewellery Image"
                  description="Product image for the selected jewellery type."
                  imageKind="jewellery"
                  slot={jewelleryImage}
                  accent="orange"
                  onChange={updateJewelleryImage}
                />
                <ImageUploadCard
                  title="Person Image"
                  description={
                    jewelleryImage.file
                      ? (requirements?.instruction ??
                        "Add the person photo required for this jewellery type.")
                      : "Select the jewellery image first."
                  }
                  imageKind="person"
                  slot={personImage}
                  disabled={!jewelleryImage.file}
                  accent="violet"
                  onChange={updatePersonImage}
                />
              </div>

              {analyzingPerson ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  Checking person-photo framing...
                </div>
              ) : semanticIssue ? (
                <Alert variant="destructive">
                  <ShieldAlertIcon aria-hidden="true" />
                  <AlertTitle>Use another person photo</AlertTitle>
                  <AlertDescription>{semanticIssue}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                <Button
                  type="button"
                  className="min-w-56"
                  disabled={!readyToRun || busy}
                  onClick={() => void submitRun()}
                >
                  {busy ? (
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                  ) : (
                    <PlayIcon aria-hidden="true" />
                  )}
                  Run Jewellery Try-On
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-32"
                  disabled={busy}
                  onClick={resetLab}
                >
                  <RotateCcwIcon aria-hidden="true" />
                  Reset
                </Button>
              </div>
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
              <ResultPanel run={run} busy={busy} />
              <div className="flex gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
                <InfoIcon
                  className="mt-0.5 size-4 shrink-0 text-sky-600"
                  aria-hidden="true"
                />
                {readyToRun
                  ? "Inputs are ready. Run the Try-On to send them securely through SelfX."
                  : "Add valid jewellery and person images to prepare a Try-On."}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageSection>
    </PageContainer>
  );
}

function WorkflowSteps({ activeStep }: { activeStep: number }) {
  const steps = ["Upload Jewellery", "Upload Person", "Review & Run"];
  return (
    <ol
      className="flex min-w-0 items-center gap-2 text-xs"
      aria-label="Jewellery Try-On workflow"
    >
      {steps.map((label, index) => {
        const step = index + 1;
        const active = step === activeStep;
        const complete = step < activeStep;
        return (
          <li key={label} className="contents">
            {index > 0 ? (
              <span
                className={cn(
                  "h-px min-w-3 flex-1 bg-border",
                  complete && "bg-primary/40",
                )}
                aria-hidden="true"
              />
            ) : null}
            <div
              className={cn(
                "flex shrink-0 items-center gap-2 text-muted-foreground",
                (active || complete) && "font-medium text-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border bg-muted text-[0.7rem] font-semibold",
                  active && "border-primary bg-primary text-primary-foreground",
                  complete && "border-primary/30 bg-primary/10 text-primary",
                )}
              >
                {complete ? (
                  <CircleCheckIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  step
                )}
              </span>
              <span className="hidden whitespace-nowrap sm:inline">
                {label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ImageUploadCard({
  title,
  description,
  imageKind,
  slot,
  disabled = false,
  accent,
  onChange,
}: {
  title: string;
  description: string;
  imageKind: "person" | "jewellery";
  slot: ImageSlot;
  disabled?: boolean;
  accent: "orange" | "violet";
  onChange: (slot: ImageSlot) => void;
}) {
  const status = imageDimensionStatus(slot, imageKind);
  const SlotIcon = imageKind === "jewellery" ? GemIcon : HandIcon;
  const requirement =
    imageKind === "jewellery"
      ? "Required: 640-4096 px per side. JPG, PNG or WebP; up to 8 MB."
      : "Supported: 640-4096 px per side; up to 8 MB.";

  return (
    <label
      className={cn(
        "block min-h-[27rem] rounded-lg border border-dashed bg-muted/20 p-4 transition-colors",
        accent === "orange" ? "border-orange-300/80" : "border-violet-300/80",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-muted/40",
      )}
      aria-disabled={disabled}
    >
      <input
        className="sr-only"
        type="file"
        disabled={disabled}
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void createImageSlot(file).then(onChange);
        }}
      />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md",
                accent === "orange"
                  ? "bg-orange-100 text-orange-600"
                  : "bg-violet-100 text-violet-600",
              )}
            >
              <SlotIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-muted-foreground">{description}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {requirement}
              </div>
            </div>
          </div>
          <UploadIcon
            className={cn(
              "size-5 shrink-0",
              accent === "orange" ? "text-orange-600" : "text-violet-600",
            )}
            aria-hidden="true"
          />
        </div>
        <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md border bg-background">
          {slot.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.previewUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-full",
                  accent === "orange"
                    ? "bg-orange-100 text-orange-600"
                    : "bg-violet-100 text-violet-600",
                )}
              >
                {disabled ? (
                  <ImageIcon className="size-5" aria-hidden="true" />
                ) : (
                  <UploadIcon className="size-5" aria-hidden="true" />
                )}
              </span>
              <span className="font-medium text-foreground">
                {disabled ? "Add jewellery first" : "Choose image"}
              </span>
              <span>
                {disabled ? "Person upload unlocks next" : "Click to upload"}
              </span>
            </div>
          )}
        </div>
        {slot.file ? (
          <div className="space-y-2">
            <div className="truncate text-xs text-muted-foreground">
              {slot.file.name}
            </div>
            {slot.dimensions ? (
              <div className="text-xs font-medium text-foreground">
                Resolution: {slot.dimensions.width} x {slot.dimensions.height}{" "}
                px
              </div>
            ) : null}
            {status ? (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium",
                  status.blocking
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-emerald-600/30 bg-emerald-50 text-emerald-800",
                )}
              >
                {status.blocking ? (
                  <ShieldAlertIcon
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleCheckIcon
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span>{status.message}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </label>
  );
}

async function createImageSlot(file: File | null): Promise<ImageSlot> {
  if (!file) {
    return emptyImageSlot;
  }
  const previewUrl = URL.createObjectURL(file);
  try {
    return {
      file,
      previewUrl,
      dimensions: await readImageDimensions(file),
      dimensionReadFailed: false,
    };
  } catch {
    return {
      file,
      previewUrl,
      dimensions: null,
      dimensionReadFailed: true,
    };
  }
}

function imageTechnicalIssue(
  slot: ImageSlot,
  imageKind: "person" | "jewellery",
): string | null {
  const status = imageDimensionStatus(slot, imageKind);
  return status?.blocking ? status.message : null;
}

function imageDimensionStatus(
  slot: ImageSlot,
  imageKind: "person" | "jewellery",
): { blocking: boolean; message: string } | null {
  if (!slot.file) {
    return null;
  }
  if (slot.file.size > labMaxImageBytes) {
    return {
      blocking: true,
      message: "Image is too large. Use a file up to 8 MB.",
    };
  }
  if (slot.dimensionReadFailed || !slot.dimensions) {
    return {
      blocking: true,
      message: "Image resolution could not be read. Upload a valid image.",
    };
  }

  const shortestEdge = Math.min(slot.dimensions.width, slot.dimensions.height);
  const longestEdge = Math.max(slot.dimensions.width, slot.dimensions.height);
  const minimumSourceEdge =
    imageKind === "person"
      ? personResizeMinDimension
      : providerMinImageDimension;
  if (shortestEdge < minimumSourceEdge) {
    return {
      blocking: true,
      message:
        imageKind === "person"
          ? "Image is too small. Upload a person photo at least 480 px on each side."
          : "Image is too small. Upload a jewellery image at least 640 x 640 px.",
    };
  }

  const downscale = Math.min(1, providerMaxImageDimension / longestEdge);
  if (shortestEdge * downscale < providerMinImageDimension) {
    return {
      blocking: true,
      message: "Image proportions are outside the supported 640-4096 px range.",
    };
  }
  if (
    imageKind === "person" &&
    (shortestEdge < providerMinImageDimension ||
      longestEdge > providerMaxImageDimension)
  ) {
    return {
      blocking: false,
      message: "Ready. SelfX will resize this photo for Jewellery Try-On.",
    };
  }
  if (longestEdge > providerMaxImageDimension) {
    return {
      blocking: false,
      message: "Ready. SelfX will reduce this image to the supported size.",
    };
  }
  return { blocking: false, message: "Ready for Jewellery Try-On." };
}

function ResultPanel({
  run,
  busy,
}: {
  run: JewelleryTryOnLabRunResponse | null;
  busy: boolean;
}) {
  if (!run) {
    return (
      <div className="grid min-h-64 place-items-center rounded-md border bg-muted/20 p-6 text-center">
        <div className="max-w-56 space-y-3">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden="true" />
          </span>
          <div>
            <div className="font-semibold text-foreground">No result yet</div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Add jewellery and person images, then run the Try-On to see the
              result here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (run.resultImage) {
    return (
      <div className="overflow-hidden rounded-md border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={run.resultImage}
          alt="Generated jewellery Try-On result"
          className="max-h-[32rem] w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid min-h-64 place-items-center rounded-md border p-6 text-center",
        run.status === "FAILED"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "bg-muted/20 text-muted-foreground",
      )}
    >
      <div className="max-w-60 space-y-3">
        <span
          className={cn(
            "mx-auto grid size-14 place-items-center rounded-full",
            run.status === "FAILED"
              ? "bg-destructive/10"
              : "bg-primary/10 text-primary",
          )}
        >
          {busy ? (
            <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
          ) : (
            <SparklesIcon className="size-6" aria-hidden="true" />
          )}
        </span>
        <div>
          <div className="font-semibold">{statusLabel(run.status)}</div>
          {run.status === "FAILED" ? (
            <p className="mt-1 text-sm leading-5">
              We could not create this Try-On. Check both images and try again.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-5">
              SelfX is creating your jewellery Try-On.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: JewelleryTryOnLabRunResponse["status"]): string {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function RunStatusBadge({
  run,
  readyToRun,
}: {
  run: JewelleryTryOnLabRunResponse | null;
  readyToRun: boolean;
}) {
  if (!run) {
    return readyToRun ? (
      <Badge className="bg-emerald-600 text-white">Ready to run</Badge>
    ) : (
      <Badge variant="secondary">Inputs needed</Badge>
    );
  }
  if (run.status === "COMPLETED") {
    return <Badge className="bg-emerald-600 text-white">Completed</Badge>;
  }
  if (run.status === "FAILED") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return (
    <Badge variant="secondary">
      <Loader2Icon className="animate-spin" aria-hidden="true" />
      {statusLabel(run.status)}
    </Badge>
  );
}

function clearPollTimer(ref: {
  current: ReturnType<typeof setInterval> | null;
}): void {
  if (ref.current) {
    clearInterval(ref.current);
    ref.current = null;
  }
}

function revokePreview(previewUrl: string | null): void {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    if (/perfect corp|provider/i.test(caught.message)) {
      return "Jewellery Try-On could not be completed right now. Try again shortly.";
    }
    return caught.message;
  }
  return "Jewellery Lab request failed.";
}

function semanticEvidenceIssue(
  evidence: SelfxJewelleryPersonSemanticEvidence | null,
  requirements: SelfxJewelleryCaptureRequirements | null,
): string | null {
  if (!evidence) {
    return null;
  }
  if (!evidence.analysisAvailable) {
    return "We could not verify this photo. Upload another person photo.";
  }
  if (!evidence.subjectPresent) {
    return requirements?.jewelleryType === "RING" ||
      requirements?.jewelleryType === "BRACELET"
      ? "Keep your hand and wrist clearly visible and upload another photo."
      : "Keep your face clearly visible and upload another photo.";
  }
  if (evidence.confidence === null || evidence.confidence < 0.55) {
    return "We could not verify this photo. Upload another person photo.";
  }
  if (!evidence.requiredRegionVisible) {
    return (
      requirements?.instruction ??
      "Keep the required area clearly visible and upload another photo."
    );
  }
  if (
    requirements?.requiredChecks.includes("FRONT_FACING") &&
    evidence.frontFacing !== true
  ) {
    return "Face the camera directly and upload another photo.";
  }
  if (
    requirements?.requiredChecks.includes("RELEVANT_REGION_UNOBSTRUCTED") &&
    evidence.relevantRegionUnobstructed !== true
  ) {
    return "Keep the required area uncovered and upload another photo.";
  }
  return null;
}
