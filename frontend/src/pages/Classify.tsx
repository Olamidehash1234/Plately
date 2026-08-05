import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/AppShell";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type View = "choose" | "camera" | "chosen" | "analysing";

const MEAL_TAGS = ["Breakfast", "Lunch", "Dinner", "Snack"];

/** The meal tag most likely to be right, based on the time of day. */
function suggestMealTag(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 22) return "Dinner";
  return "Snack";
}

export default function Classify() {
  const [view, setView] = useState<View>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mealTag, setMealTag] = useState(suggestMealTag);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelReason, setModelReason] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigate();

  // Warn up front if the model is unavailable, rather than letting the user
  // frame a photo and only then hit a 503.
  useEffect(() => {
    let cancelled = false;
    api
      .classifyStatus()
      .then((status) => {
        if (!cancelled && !status.ready) setModelReason(status.reason);
      })
      .catch(() => {
        // The classify attempt will surface a clearer error; don't pre-empt it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Release the camera and the object URL when leaving the page, otherwise the
  // device light stays on and the blob leaks.
  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [stopCamera, previewUrl]);

  const choosePreview = (nextFile: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setError(null);
    setView("chosen");
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Rear camera on a phone; harmless on a laptop.
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setView("camera");
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setCameraError(
        denied
          ? "Camera access was blocked. Allow it in your browser settings, or upload a photo instead."
          : "No camera is available on this device. Upload a photo instead.",
      );
    }
  };

  // Attach the stream once the <video> is actually mounted.
  useEffect(() => {
    if (view === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [view]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Could not capture the frame. Try again.");
          return;
        }
        stopCamera();
        choosePreview(new File([blob], "meal.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  const classify = async () => {
    if (!file) return;
    setError(null);
    setView("analysing");

    try {
      const result = await api.classify(file, { mealTag });
      navigate(`/meal-result/${result.meal.id}`, {
        state: {
          alternatives: result.alternatives,
          lowConfidence: result.low_confidence,
        },
        replace: true,
      });
    } catch (err) {
      setView("chosen");
      if (err instanceof ApiError && err.status === 503) {
        setError(
          `${err.message} Everything else works — this is the only feature that needs the trained model.`,
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Classification failed. Try again.",
        );
      }
    }
  };

  const reset = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setView("choose");
  };

  return (
    <AppShell mainClassName="flex flex-col">
      <div className="w-full max-w-3xl mx-auto px-container-padding-mobile py-stack-md md:py-8 flex-grow flex flex-col pb-28">
        {modelReason && view !== "analysing" && (
          <div className="mb-stack-md flex items-start gap-3 p-4 rounded-[14px] bg-secondary-container/30 border border-secondary-container">
            <Icon name="info" className="text-[20px] shrink-0 text-secondary" />
            <div className="font-body-md text-body-md text-on-background">
              <p className="font-semibold">Classification is unavailable</p>
              <p className="text-on-surface-variant">{modelReason}</p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-stack-md flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
          >
            <Icon name="error" className="text-[20px] shrink-0" />
            <span className="font-body-md text-body-md">{error}</span>
          </div>
        )}

        {/* Choose a source */}
        {view === "choose" && (
          <section className="flex flex-col items-center flex-grow space-y-stack-lg">
            <div className="w-full max-w-[500px] md:h-[500px] rounded-[24px] overflow-hidden relative border-4 border-dashed border-outline-variant animate-pulse-border bg-surface-container flex flex-col items-center justify-center gap-stack-md text-center px-8">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
                <Icon name="restaurant" className="text-primary text-3xl" />
              </div>
              <h1 className="font-headline-md text-headline-md text-on-background">
                Capture your meal
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Shoot from directly above, with the whole plate in frame.
              </p>
            </div>

            {cameraError && (
              <p className="font-body-md text-body-md text-on-surface-variant text-center max-w-md">
                {cameraError}
              </p>
            )}

            <div className="w-full max-w-[500px] flex flex-col gap-stack-md">
              <Button
                size="block"
                className="h-auto py-stack-md text-body-lg"
                onClick={startCamera}
              >
                <Icon name="photo_camera" />
                Take photo
              </Button>
              <Button
                variant="surface"
                size="block"
                className="h-auto py-stack-md"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="image" />
                Upload from gallery
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) choosePreview(selected);
                  // Reset so picking the same file twice still fires onChange.
                  event.target.value = "";
                }}
              />
            </div>
          </section>
        )}

        {/* Live camera */}
        {view === "camera" && (
          <section className="flex flex-col items-center flex-grow space-y-stack-lg">
            <div className="w-full max-w-md aspect-[3/4] rounded-[24px] overflow-hidden relative bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Rule-of-thirds guide */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "border-white/20",
                      i % 3 !== 2 && "border-r",
                      i < 6 && "border-b",
                    )}
                  />
                ))}
              </div>
              <div className="absolute bottom-stack-md left-0 w-full flex justify-center">
                <span className="bg-black/40 backdrop-blur-md text-white px-4 py-1.5 rounded-full font-label-sm text-label-sm">
                  Center your meal in the frame
                </span>
              </div>
            </div>

            <div className="w-full max-w-md flex flex-col gap-stack-md">
              <Button size="block" className="h-auto py-stack-md text-body-lg" onClick={capture}>
                <Icon name="camera" />
                Capture
              </Button>
              <Button variant="ghost" size="block" onClick={reset}>
                Cancel
              </Button>
            </div>
          </section>
        )}

        {/* Photo chosen */}
        {view === "chosen" && previewUrl && (
          <section className="flex flex-col items-center flex-grow">
            <div className="w-full max-w-md aspect-[3/4] rounded-[24px] overflow-hidden shadow-lg border border-outline-variant">
              <img
                className="w-full h-full object-cover"
                src={previewUrl}
                alt="The meal you are about to classify."
              />
            </div>

            <div className="w-full max-w-md mt-stack-lg space-y-stack-md">
              <div className="space-y-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Meal
                </span>
                <div className="flex flex-wrap gap-2">
                  {MEAL_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setMealTag(tag)}
                      className={cn(
                        "px-4 py-2 rounded-full font-label-md text-label-md border transition-colors",
                        mealTag === tag
                          ? "bg-primary text-on-primary border-primary"
                          : "bg-white text-on-surface-variant border-outline-variant hover:border-primary",
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                size="block"
                className="h-auto py-stack-md text-body-lg shadow-lg"
                onClick={classify}
              >
                Classify
              </Button>
              <Button variant="ghost" size="block" onClick={reset}>
                Choose a different photo
              </Button>
            </div>
          </section>
        )}

        {/* Analysing */}
        {view === "analysing" && (
          <section className="flex flex-col items-center flex-grow">
            <div className="w-full max-w-md space-y-stack-lg">
              <div className="w-full aspect-video rounded-[24px] overflow-hidden relative border border-outline-variant">
                {previewUrl && (
                  <img
                    className="w-full h-full object-cover grayscale opacity-50 blur-sm"
                    src={previewUrl}
                    alt=""
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-stack-md">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-primary font-label-md text-label-md uppercase tracking-widest">
                      Analysing your meal
                    </p>
                  </div>
                </div>
              </div>

              {/* Skeleton results */}
              <div className="space-y-stack-md p-stack-md bg-white rounded-[20px] border border-outline-variant shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 w-2/3">
                    <div className="h-6 w-3/4 skeleton-shimmer rounded-lg" />
                    <div className="h-4 w-1/2 skeleton-shimmer rounded-lg" />
                  </div>
                  <div className="h-10 w-10 skeleton-shimmer rounded-full" />
                </div>
                <div className="grid grid-cols-3 gap-stack-md pt-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-3 w-full skeleton-shimmer rounded-full" />
                      <div className="h-8 w-full skeleton-shimmer rounded-lg" />
                    </div>
                  ))}
                </div>
                <div className="h-2 w-full skeleton-shimmer rounded-full mt-4" />
                <div className="h-12 w-full skeleton-shimmer rounded-[14px] mt-6" />
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
