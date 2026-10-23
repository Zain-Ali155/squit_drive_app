"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@workspace/ui";
import type { PptxFiles, PptxViewer, ViewerOptions, ZipParseLimits } from "@aiden0z/pptx-renderer/browser";

export const validateDrivePptxPackage = (
  files: Pick<PptxFiles, "contentTypes" | "presentation" | "presentationRels" | "slides">
): void => {
  if (!files.contentTypes.trim() || !files.presentation.trim() || !files.presentationRels.trim() || files.slides.size === 0) {
    throw new Error("The presentation package is incomplete.");
  }
};

export const createDrivePptxViewerOptions = (
  zipLimits: ZipParseLimits,
  width: number,
  onSlideChange: (index: number) => void,
  onSlideError: (index: number, error: unknown) => void
): ViewerOptions => ({
  externalMedia: "block",
  zipLimits,
  pdfjs: false,
  width,
  fitMode: "contain",
  lazyMedia: true,
  lazySlides: true,
  onSlideChange,
  onSlideError
});

export const getDrivePptxContentWidth = (
  clientWidth: number,
  paddingLeft: number,
  paddingRight: number
): number => Math.max(1, clientWidth - paddingLeft - paddingRight);

export const cleanupDrivePptxViewer = (
  abort: () => void,
  viewer: Pick<PptxViewer, "destroy"> | undefined
): void => {
  abort();
  viewer?.destroy();
};

export const handleDrivePptxLoadError = (
  active: boolean,
  isAborted: () => boolean,
  destroyViewer: () => void,
  reportError: () => void
): void => {
  const shouldReport = active && !isAborted();
  destroyViewer();
  if (shouldReport) reportError();
};

export const DrivePptxPreview = ({ blob, fileName, onOpened }: Readonly<{ blob: Blob; fileName: string; onOpened?: () => void }>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PptxViewer | undefined>(undefined);
  const [slideCount, setSlideCount] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const controller = new AbortController();
    let active = true;
    let viewer: PptxViewer | undefined;
    let disposed = false;
    let slideError = false;
    const destroyViewer = (): void => {
      if (disposed) return;
      disposed = true;
      cleanupDrivePptxViewer(() => controller.abort(), viewer);
      if (viewerRef.current === viewer) viewerRef.current = undefined;
    };

    const load = async (): Promise<void> => {
      try {
        const input = await blob.arrayBuffer();
        if (!active) return;

        const { PptxViewer, RECOMMENDED_ZIP_LIMITS, buildPresentation, parseZipLazyMedia } = await import("@aiden0z/pptx-renderer/browser");
        if (!active) return;

        const zipLimits = RECOMMENDED_ZIP_LIMITS;
        const files = await parseZipLazyMedia(input, zipLimits);
        if (!active) return;
        validateDrivePptxPackage(files);
        const presentation = buildPresentation(files, { lazySlides: true });
        if (presentation.slides.length === 0) throw new Error("The presentation contains no slides.");
        if (!active) return;

        const containerStyle = window.getComputedStyle(container);
        viewer = new PptxViewer(container, {
          ...createDrivePptxViewerOptions(
            zipLimits,
            getDrivePptxContentWidth(
              container.clientWidth,
              Number.parseFloat(containerStyle.paddingLeft),
              Number.parseFloat(containerStyle.paddingRight)
            ),
            (index) => {
              if (active) setCurrentSlideIndex(index);
            },
            () => {
              if (active) {
                slideError = true;
                setError("Some slides in this PowerPoint file could not be rendered. Download it to view the full presentation.");
                setLoading(false);
              }
            }
          ),
          scrollContainer: container
        });
        viewerRef.current = viewer;
        viewer.load(presentation);
        await viewer.renderList({ windowed: true, batchSize: 4, showSlideLabels: true });

        if (!active) {
          destroyViewer();
          return;
        }
        if (viewer.slideCount === 0) throw new Error("The presentation contains no slides.");
        setSlideCount(viewer.slideCount);
        setCurrentSlideIndex(viewer.currentSlideIndex);
        setLoading(false);
        if (!slideError) onOpened?.();
      } catch {
        handleDrivePptxLoadError(
          active,
          () => controller.signal.aborted,
          destroyViewer,
          () => {
            setError("This PowerPoint file could not be previewed. Download it to open it in a compatible application.");
            setLoading(false);
          }
        );
      }
    };

    void load();
    return () => {
      active = false;
      destroyViewer();
    };
  }, [blob, onOpened]);

  const navigate = (index: number): void => {
    const viewer = viewerRef.current;
    if (!viewer || index < 0 || index >= slideCount) return;
    void viewer.goToSlide(index).catch(() => {
      setError("Could not navigate to that slide.");
    });
  };

  const changeZoom = (change: -25 | 25): void => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const nextZoom = Math.min(200, Math.max(50, viewer.zoomPercent + change));
    void viewer.setZoom(nextZoom).then(() => setZoomPercent(nextZoom)).catch(() => {
      setError("Could not change the slide preview zoom.");
    });
  };

  return (
    <section className="flex h-full min-h-[320px] min-w-0 w-full max-w-full flex-col" aria-label={`PowerPoint preview: ${fileName}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-100 px-3 py-2 sm:px-5">
        <div className="flex items-center gap-2">
          <Button aria-label="Previous slide" disabled={loading || currentSlideIndex <= 0} size="sm" type="button" variant="outline" onClick={() => navigate(currentSlideIndex - 1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span aria-live="polite" className="min-w-24 text-center text-sm text-muted-foreground">
            {slideCount > 0 ? `Slide ${currentSlideIndex + 1} of ${slideCount}` : "Slides"}
          </span>
          <Button aria-label="Next slide" disabled={loading || currentSlideIndex + 1 >= slideCount} size="sm" type="button" variant="outline" onClick={() => navigate(currentSlideIndex + 1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button aria-label="Zoom out" disabled={loading || zoomPercent <= 50} size="sm" type="button" variant="outline" onClick={() => changeZoom(-25)}>
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center text-sm text-muted-foreground">{zoomPercent}%</span>
          <Button aria-label="Zoom in" disabled={loading || zoomPercent >= 200} size="sm" type="button" variant="outline" onClick={() => changeZoom(25)}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      {loading && <p className="text-sm text-muted-foreground" role="status">Rendering slides…</p>}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <div
        aria-label="PowerPoint slides"
        aria-busy={loading}
        className="box-border min-h-0 w-full min-w-0 max-w-full flex-1 overflow-auto [scrollbar-gutter:stable] bg-[#e8eaed] p-3 sm:p-6"
        ref={containerRef}
        role="region"
        tabIndex={0}
      />
    </section>
  );
};
