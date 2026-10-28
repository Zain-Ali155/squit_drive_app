"use client";

import { useEffect, useRef, useState } from "react";
import { validateDocxArchive, maxDocxInputBytes } from "../utils/drive.docx";

const allowedImageSource = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;
const blockedElements = "audio, base, button, embed, form, iframe, input, link, math, meta, object, script, source, svg, video";

const sanitizeRenderedDocx = (body: HTMLElement, styles: HTMLElement): void => {
  body.querySelectorAll(blockedElements).forEach((element) => element.remove());
  body.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on") || name === "srcset") {
        element.removeAttribute(attribute.name);
      } else if (name === "src" && (element.tagName !== "IMG" || !allowedImageSource.test(value))) {
        element.removeAttribute(attribute.name);
      } else if (name === "href") {
        if (value.startsWith("#")) continue;
        try {
          const url = new URL(value);
          if (url.protocol === "https:" || url.protocol === "mailto:") {
            element.setAttribute("target", "_blank");
            element.setAttribute("rel", "noopener noreferrer");
            continue;
          }
        } catch {
          // Remove malformed or relative external links from untrusted documents.
        }
        element.removeAttribute(attribute.name);
      } else if (name === "style") {
        const safeStyle = value.split(";").filter((declaration) =>
          !/(?:url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|position\s*:\s*fixed)/iu.test(declaration)
        ).join(";");
        if (safeStyle) element.setAttribute("style", safeStyle);
        else element.removeAttribute("style");
      }
    }
  });
  styles.querySelectorAll("style").forEach((style) => {
    const safeCss = (style.textContent ?? "")
      .replace(/@import[^;]+;?/giu, "")
      .replace(/url\s*\((?!\s*["']?data:[^)]*;base64,)[^)]*\)/giu, "none")
      .replace(/expression\s*\([^)]*\)/giu, "none");
    style.textContent = safeCss;
  });
};

export const DriveDocxDocumentPreview = ({ blob, fileName, onOpened }: Readonly<{
  blob: Blob;
  fileName: string;
  onOpened?: () => void;
}>) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const body = bodyRef.current;
    const styles = stylesRef.current;
    if (!body || !styles) return;
    let active = true;

    const render = async (): Promise<void> => {
      try {
        if (blob.size === 0 || blob.size > maxDocxInputBytes) throw new Error("invalid document size");
        validateDocxArchive(new Uint8Array(await blob.arrayBuffer()));
        if (!active) return;
        const { renderAsync } = await import("docx-preview");
        if (!active) return;
        await renderAsync(blob, body, styles, {
          className: "squid-docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderChanges: false,
          renderComments: false,
          renderAltChunks: false,
          useBase64URL: true,
          debug: false,
          experimental: false
        });
        if (!active) return;
        sanitizeRenderedDocx(body, styles);
        setLoading(false);
        onOpened?.();
      } catch {
        if (active) {
          setError("This Word document could not be previewed safely. Download it to open in Word.");
          setLoading(false);
        }
      }
    };

    void render();
    return () => {
      active = false;
      body.replaceChildren();
      styles.replaceChildren();
    };
  }, [blob, onOpened]);

  return (
    <section aria-label={`Word document preview: ${fileName}`} className="relative flex h-full min-h-[320px] min-w-0 flex-col overflow-hidden">
      <div aria-hidden="true" className="contents" ref={stylesRef} />
      <div className="min-h-0 flex-1 overflow-auto bg-[#e8eaed] p-3 sm:p-6" tabIndex={0}>
        <div className="mx-auto min-h-full min-w-0" ref={bodyRef} />
      </div>
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-slate-700" role="status">Preparing Word document…</div>}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-[#e8eaed] p-5"><p className="max-w-lg rounded-lg border border-amber-300 bg-white p-4 text-sm text-slate-700" role="alert">{error}</p></div>}
    </section>
  );
};
