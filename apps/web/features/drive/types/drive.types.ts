export type DrivePreviewKind = "image" | "pdf" | "docx" | "pptx" | "text" | "csv";

export type DriveUploadProgress = Readonly<{ loaded: number; total: number }>;

export type SafeDocxTag =
  | "blockquote" | "br" | "div" | "em" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "hr" | "img" | "li"
  | "ol" | "p" | "s" | "span" | "strong" | "sub" | "sup" | "table" | "tbody" | "td" | "tfoot" | "th"
  | "thead" | "tr" | "u" | "ul";

export type SafeDocxAttributes = Readonly<{
  alt?: string;
  src?: string;
  colSpan?: number;
  rowSpan?: number;
  start?: number;
  textAlign?: "left" | "center" | "right" | "justify";
}>;

export type SafeDocxNode =
  | Readonly<{ type: "text"; value: string }>
  | Readonly<{ type: "element"; tag: SafeDocxTag; attributes: SafeDocxAttributes; children: readonly SafeDocxNode[] }>;
