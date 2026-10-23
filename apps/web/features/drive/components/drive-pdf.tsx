"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@workspace/ui";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

const minZoom = 0.75;
const maxZoom = 2;
const zoomStep = 0.25;
const maxPagePixels = 32_000_000;

export const adjustDrivePdfZoom = (current: number, direction: -1 | 1): number =>
  Math.min(maxZoom, Math.max(minZoom, current + direction * zoomStep));

export const getDrivePdfFitScale = (pageWidth: number, availableWidth: number): number =>
  Number.isFinite(pageWidth) && Number.isFinite(availableWidth) && pageWidth > 0 && availableWidth > 0
    ? Math.min(1, availableWidth / pageWidth)
    : 1;

export const DrivePdfPreview = ({ blob, fileName, onOpened }: Readonly<{ blob: Blob; fileName: string; onOpened?: () => void }>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | undefined>(undefined);
  const renderTaskRef = useRef<RenderTask | undefined>(undefined);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy>();
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const container = pageContainerRef.current;
    if (!container) return;

    const updateWidth = (): void => setContainerWidth(container.clientWidth);
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false
      });
      loadingTaskRef.current = loadingTask;
      const loadedDocument = await loadingTask.promise;
      if (!active) {
        await loadedDocument.destroy();
        return;
      }
      setDocumentProxy(loadedDocument);
      setPageNumber(1);
      setLoading(false);
      onOpened?.();
    };

    void load().catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "This PDF could not be opened.");
      setLoading(false);
    });

    return () => {
      active = false;
      renderTaskRef.current?.cancel();
      const task = loadingTaskRef.current;
      loadingTaskRef.current = undefined;
      if (task) void task.destroy().catch(() => undefined);
    };
  }, [blob, onOpened]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!documentProxy || !canvas) return;

    let active = true;
    let renderTask: RenderTask | undefined;
    const pageContainer = pageContainerRef.current;
    if (pageContainer) {
      pageContainer.scrollLeft = 0;
      pageContainer.scrollTop = 0;
    }
    setRendering(true);
    setError(undefined);

    const render = async (): Promise<void> => {
      const page = await documentProxy.getPage(pageNumber);
      if (!active) return;
      const container = pageContainerRef.current;
      const containerStyle = container ? window.getComputedStyle(container) : undefined;
      const availableWidth = container
        ? container.clientWidth
          - Number.parseFloat(containerStyle?.paddingLeft ?? "0")
          - Number.parseFloat(containerStyle?.paddingRight ?? "0")
        : 0;
      const fitScale = getDrivePdfFitScale(page.getViewport({ scale: 1 }).width, availableWidth || containerWidth);
      const viewport = page.getViewport({ scale: fitScale * zoom });
      if (viewport.width * viewport.height > maxPagePixels) {
        throw new Error("This PDF page is too large to render at the selected zoom. Reduce the zoom or download the file.");
      }
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not create a PDF preview surface.");
      renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      if (active) setRendering(false);
    };

    void render().catch((cause: unknown) => {
      if (!active || (cause instanceof Error && cause.name === "RenderingCancelledException")) return;
      setError(cause instanceof Error ? cause.message : "This PDF page could not be rendered.");
      setRendering(false);
    });

    return () => {
      active = false;
      renderTask?.cancel();
      if (renderTaskRef.current === renderTask) renderTaskRef.current = undefined;
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [containerWidth, documentProxy, pageNumber, zoom]);

  const changeZoom = (direction: -1 | 1): void => {
    setZoom((current) => adjustDrivePdfZoom(current, direction));
  };

  return (
    <section aria-label={`PDF preview: ${fileName}`} className="flex h-full min-h-[320px] min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-100 px-3 py-2 sm:px-5">
        <div className="flex items-center gap-2">
          <Button aria-label="Previous PDF page" disabled={!documentProxy || pageNumber <= 1 || loading} size="sm" variant="outline" onClick={() => setPageNumber((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" /> Previous</Button>
          <span aria-live="polite" className="min-w-24 text-center text-sm text-muted-foreground">
            {documentProxy ? `Page ${pageNumber} of ${documentProxy.numPages}` : "Loading pages"}
          </span>
          <Button aria-label="Next PDF page" disabled={!documentProxy || pageNumber >= documentProxy.numPages || loading} size="sm" variant="outline" onClick={() => { if (documentProxy) setPageNumber((current) => Math.min(documentProxy.numPages, current + 1)); }}>Next <ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Button aria-label="Zoom out" disabled={zoom <= minZoom} size="icon" variant="outline" onClick={() => changeZoom(-1)}><Minus aria-hidden="true" /></Button>
          <span aria-live="polite" className="min-w-20 text-center text-sm tabular-nums">{zoom === 1 ? "Fit width" : `${Math.round(zoom * 100)}%`}</span>
          <Button aria-label="Zoom in" disabled={zoom >= maxZoom} size="icon" variant="outline" onClick={() => changeZoom(1)}><Plus aria-hidden="true" /></Button>
        </div>
      </div>
      <div aria-label={`PDF page preview: ${fileName}`} className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[#e8eaed] p-4 sm:p-8" ref={pageContainerRef} role="region" tabIndex={0}>
        {(loading || rendering) && <p className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded bg-background/90 px-3 py-1 text-sm text-muted-foreground" role="status">{loading ? "Loading PDF…" : "Rendering page…"}</p>}
        {error && <p className="m-auto max-w-xl rounded-md border border-destructive/30 bg-background p-4 text-sm text-destructive" role="alert">{error}</p>}
        <canvas
          ref={canvasRef}
          aria-label={documentProxy ? `Page ${pageNumber} of ${documentProxy.numPages}` : "PDF page"}
          className={error ? "hidden" : "mx-auto h-auto max-w-none shrink-0 bg-white shadow-lg"}
        />
      </div>
    </section>
  );
};
