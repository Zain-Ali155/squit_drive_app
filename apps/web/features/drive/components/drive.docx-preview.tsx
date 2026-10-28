import { createElement, type ReactNode } from "react";
import type { SafeDocxNode, SafeDocxTag } from "../types/drive.types.js";

const tagClassNames: Readonly<Partial<Record<SafeDocxTag, string>>> = Object.freeze({
  blockquote: "my-3 border-l-2 border-border pl-4 italic text-muted-foreground",
  div: "my-1 min-w-0 leading-relaxed",
  em: "italic",
  h1: "mb-2 mt-5 text-2xl font-semibold tracking-tight",
  h2: "mb-2 mt-5 text-xl font-semibold tracking-tight",
  h3: "mb-2 mt-4 text-lg font-semibold",
  h4: "mb-1.5 mt-3 text-base font-semibold",
  h5: "mb-1.5 mt-3 text-sm font-semibold",
  h6: "mb-1.5 mt-3 text-sm font-semibold",
  img: "my-1 inline-block h-auto max-h-[50vh] max-w-full object-contain align-middle",
  li: "my-0 min-w-0 pl-1 leading-6",
  ol: "my-2 ml-6 list-decimal marker:text-slate-500",
  p: "my-1 min-w-0 whitespace-pre-wrap break-words leading-6",
  s: "line-through",
  strong: "font-semibold",
  table: "my-3 w-full max-w-full table-auto border-collapse text-left text-sm",
  td: "break-words border border-border px-2 py-1.5 align-top",
  th: "break-words border border-border bg-muted px-2 py-1.5 text-left font-semibold",
  ul: "my-2 ml-6 list-disc marker:text-slate-500"
});

const renderNode = (node: SafeDocxNode, key: string): ReactNode => {
  if (node.type === "text") return node.value;
  const { textAlign, ...attributes } = node.attributes;
  const props = {
    ...attributes,
    ...(tagClassNames[node.tag] ? { className: tagClassNames[node.tag] } : {}),
    ...(textAlign ? { style: { textAlign } } : {}),
    key
  };
  const element = createElement(node.tag, props, ...node.children.map((child, index) => renderNode(child, `${key}.${index}`)));
  return node.tag === "table"
    ? createElement("div", { className: "my-3 max-w-full overflow-x-auto rounded-md border border-slate-200", key: `${key}.scroll` }, element)
    : element;
};

export const SafeDocxPreview = ({ nodes }: Readonly<{ nodes: readonly SafeDocxNode[] }>) =>
  <div className="min-h-full bg-[#e8eaed] px-3 py-4 sm:px-8 sm:py-8">
    <article aria-label="Word document preview" className="mx-auto min-h-[min(70vh,900px)] w-full max-w-[850px] break-words border border-slate-200 bg-white px-5 py-6 text-[15px] leading-6 text-slate-800 shadow-md [overflow-wrap:anywhere] sm:px-12 sm:py-12" role="region" tabIndex={0}>
      {nodes.map((node, index) => renderNode(node, String(index)))}
    </article>
  </div>;
