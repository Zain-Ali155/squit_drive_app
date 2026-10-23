import type { SafeDocxAttributes, SafeDocxNode, SafeDocxTag } from "../types/drive.types.js";

export const maxDocxInputBytes = 15_000_000;
export const maxDocxExpandedBytes = 32_000_000;
export const maxDocxEntryBytes = 16_000_000;
export const maxDocxArchiveEntries = 1_024;

const safeTags = new Set([
  "blockquote", "br", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img", "li",
  "ol", "p", "s", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul"
]);
const blockedTags = new Set(["audio", "button", "embed", "form", "iframe", "input", "math", "object", "script", "style", "svg", "video"]);
const imageDataUrl = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;

type DocxMarkupNode = Readonly<{
  nodeType: number;
  textContent: string | null;
  tagName?: string;
  childNodes?: readonly DocxMarkupNode[];
  getAttribute?: (name: string) => string | null;
}>;

const boundedPositiveInteger = (value: string | null): number | undefined => {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 100 ? parsed : undefined;
};

export const getSafeDocxTextAlignment = (
  align: string | null,
  style: string | null,
  className?: string | null
): SafeDocxAttributes["textAlign"] => {
  const classAlignment = className?.trim().match(/(?:^|\s)docx-align-(left|center|right|justify)(?:\s|$)/u)?.[1];
  const candidate = classAlignment
    || align?.trim().toLowerCase()
    || style?.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/iu)?.[1]?.toLowerCase();
  return candidate === "left" || candidate === "center" || candidate === "right" || candidate === "justify"
    ? candidate
    : undefined;
};

export const mammothAlignmentStyleMap = Object.freeze([
  "p[style-name='Drive Align Left'] => p.docx-align-left:fresh",
  "p[style-name='Drive Align Center'] => p.docx-align-center:fresh",
  "p[style-name='Drive Align Right'] => p.docx-align-right:fresh",
  "p[style-name='Drive Align Justify'] => p.docx-align-justify:fresh"
]);

type MammothDocumentNode = Readonly<{
  type?: unknown;
  alignment?: unknown;
  styleId?: unknown;
  styleName?: unknown;
  children?: unknown;
}>;

export const transformDocxAlignment = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(transformDocxAlignment);
  if (typeof node !== "object" || node === null) return node;
  const element = node as MammothDocumentNode;
  const children = Array.isArray(element.children) ? element.children.map(transformDocxAlignment) : element.children;
  const transformed = { ...element, ...(children === undefined ? {} : { children }) };
  if (element.type !== "paragraph" || typeof element.alignment !== "string") return transformed;
  const alignment = element.alignment.toLowerCase();
  const styleName = alignment === "left" || alignment === "center" || alignment === "right"
    ? `Drive Align ${alignment[0]?.toUpperCase()}${alignment.slice(1)}`
    : alignment === "both" ? "Drive Align Justify" : undefined;
  return styleName ? { ...transformed, styleId: null, styleName } : transformed;
};

const safeImageAttributes = (element: DocxMarkupNode): SafeDocxAttributes | undefined => {
  const src = element.getAttribute?.("src");
  if (!src || !imageDataUrl.test(src)) return undefined;
  const alt = element.getAttribute?.("alt") ?? "";
  return Object.freeze({ src, alt });
};

const safeElementAttributes = (tag: SafeDocxTag, element: DocxMarkupNode): SafeDocxAttributes => {
  if (tag === "img") return safeImageAttributes(element) ?? Object.freeze({});
  const textAlign = getSafeDocxTextAlignment(
    element.getAttribute?.("align") ?? null,
    element.getAttribute?.("style") ?? null,
    element.getAttribute?.("class") ?? null
  );
  if (tag === "ol") {
    const start = boundedPositiveInteger(element.getAttribute?.("start") ?? null);
    return Object.freeze({ ...(start === undefined ? {} : { start }), ...(textAlign ? { textAlign } : {}) });
  }
  if (tag === "td" || tag === "th") {
    const colSpan = boundedPositiveInteger(element.getAttribute?.("colspan") ?? null);
    const rowSpan = boundedPositiveInteger(element.getAttribute?.("rowspan") ?? null);
    return Object.freeze({
      ...(colSpan ? { colSpan } : {}),
      ...(rowSpan ? { rowSpan } : {}),
      ...(textAlign ? { textAlign } : {})
    });
  }
  return Object.freeze(textAlign ? { textAlign } : {});
};

export const sanitizeDocxNodes = (nodes: readonly DocxMarkupNode[]): readonly SafeDocxNode[] =>
  nodes.flatMap((node): readonly SafeDocxNode[] => {
  if (node.nodeType === 3) {
    return node.textContent ? [Object.freeze({ type: "text", value: node.textContent })] : [];
  }
  if (node.nodeType !== 1 || !node.tagName) return [];
  const tagName = node.tagName.toLowerCase();
  if (blockedTags.has(tagName)) return [];
  const children = sanitizeDocxNodes(node.childNodes ?? []);
  if (!safeTags.has(tagName)) return children;
  const tag = tagName as SafeDocxTag;
  if (tag === "img") {
    const attributes = safeImageAttributes(node);
    return attributes ? [Object.freeze({ type: "element", tag, attributes, children: Object.freeze([]) })] : [];
  }
  return [Object.freeze({ type: "element", tag, attributes: safeElementAttributes(tag, node), children })];
});

const adaptDomNode = (node: Node): DocxMarkupNode => {
  const isElement = node.nodeType === 1;
  const element = isElement ? node as Element : undefined;
  return {
    nodeType: node.nodeType,
    textContent: node.textContent,
    ...(element ? {
      tagName: element.tagName,
      getAttribute: (name: string): string | null => element.getAttribute(name)
    } : {}),
    childNodes: Array.from(node.childNodes, adaptDomNode)
  };
};

export const sanitizeDocxMarkup = (markup: string): readonly SafeDocxNode[] => {
  const document = new DOMParser().parseFromString(markup, "text/html");
  return sanitizeDocxNodes(Array.from(document.body.childNodes, adaptDomNode));
};

const readUint16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number): number => view.getUint32(offset, true);

export const validateDocxArchive = (bytes: Uint8Array): void => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocdOffset = Math.max(0, bytes.byteLength - 22 - 65_535);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      const commentLength = readUint16(view, offset + 20);
      if (offset + 22 + commentLength === bytes.byteLength) {
        eocdOffset = offset;
        break;
      }
    }
  }
  if (eocdOffset < 0) throw new Error("invalid archive");

  const diskNumber = readUint16(view, eocdOffset + 4);
  const directoryDisk = readUint16(view, eocdOffset + 6);
  const entriesOnDisk = readUint16(view, eocdOffset + 8);
  const entryCount = readUint16(view, eocdOffset + 10);
  const directorySize = readUint32(view, eocdOffset + 12);
  const directoryOffset = readUint32(view, eocdOffset + 16);
  const directoryEnd = directoryOffset + directorySize;
  if (
    diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount
    || entryCount === 0 || entryCount === 0xffff || entryCount > maxDocxArchiveEntries
    || directorySize === 0xffffffff || directoryOffset === 0xffffffff
    || directoryEnd !== eocdOffset || directoryEnd > bytes.byteLength
  ) {
    throw new Error("unsupported archive structure");
  }

  let cursor = directoryOffset;
  let totalExpandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > directoryEnd || readUint32(view, cursor) !== 0x02014b50) {
      throw new Error("invalid archive directory");
    }
    const flags = readUint16(view, cursor + 8);
    const method = readUint16(view, cursor + 10);
    const compressedBytes = readUint32(view, cursor + 20);
    const expandedBytes = readUint32(view, cursor + 24);
    const fileNameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const entryEnd = cursor + 46 + fileNameLength + extraLength + commentLength;
    if (
      fileNameLength === 0 || entryEnd > directoryEnd || localHeaderOffset + 30 > directoryOffset
      || compressedBytes === 0xffffffff || expandedBytes === 0xffffffff
      || (flags & (1 | 0x40)) !== 0 || (method !== 0 && method !== 8)
    ) {
      throw new Error("unsupported archive entry");
    }

    const localHeader = localHeaderOffset;
    if (
      readUint32(view, localHeader) !== 0x04034b50
      || readUint16(view, localHeader + 8) !== method
      || readUint16(view, localHeader + 26) !== fileNameLength
    ) {
      throw new Error("invalid archive entry");
    }
    const localNameLength = readUint16(view, localHeader + 26);
    const localExtraLength = readUint16(view, localHeader + 28);
    const compressedDataEnd = localHeader + 30 + localNameLength + localExtraLength + compressedBytes;
    if (compressedDataEnd > directoryOffset) throw new Error("invalid archive entry size");
    if (expandedBytes > maxDocxEntryBytes) throw new Error("archive entry exceeds preview limit");
    totalExpandedBytes += expandedBytes;
    if (totalExpandedBytes > maxDocxExpandedBytes) throw new Error("archive exceeds preview limit");

    cursor = entryEnd;
  }
  if (cursor !== directoryEnd) throw new Error("invalid archive directory size");
};

export const convertDocxBlob = async (blob: Blob): Promise<readonly SafeDocxNode[]> => {
  try {
    if (blob.size === 0 || blob.size > maxDocxInputBytes) throw new Error("invalid document size");
    const arrayBuffer = await blob.arrayBuffer();
    validateDocxArchive(new Uint8Array(arrayBuffer));
    const mammoth = (await import("mammoth")).default;
    const convertImage = mammoth.images.imgElement(async (image) => {
      const contentType = image.contentType.toLowerCase();
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(contentType)) return { src: "" };
      return { src: `data:${contentType};base64,${await image.readAsBase64String()}` };
    });
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        externalFileAccess: false,
        convertImage,
        styleMap: [...mammothAlignmentStyleMap],
        transformDocument: transformDocxAlignment
      }
    );
    const nodes = sanitizeDocxMarkup(result.value);
    if (nodes.length === 0) throw new Error("empty preview");
    return nodes;
  } catch {
    throw new Error("This DOCX can’t be previewed. It may be malformed or use unsupported content. Download it to open in Word.");
  }
};
