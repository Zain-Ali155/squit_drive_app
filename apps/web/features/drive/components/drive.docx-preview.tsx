import { createElement, type ReactNode } from "react";
import type { SafeDocxNode, SafeDocxTag } from "../types/drive.types.js";

const tagClassNames: Readonly<Partial<Record<SafeDocxTag, string>>> = Object.freeze({
  blockquote: "my-4 border-l-2 border-border pl-4 italic text-muted-foreground",
  div: "my-2 leading-relaxed",
  em: "italic",
  h1: "mb-4 mt-8 text-3xl font-semibold tracking-tight",
  h2: "mb-3 mt-7 text-2xl font-semibold tracking-tight",
  h3: "mb-2 mt-6 text-xl font-semibold",
  h4: "mb-2 mt-5 text-lg font-semibold",
  h5: "mb-2 mt-4 font-semibold",
  h6: "mb-2 mt-4 text-sm font-semibold",
  img: "mx-auto my-5 h-auto max-h-[60vh] max-w-full rounded-md object-contain",
  li: "my-1 pl-1 leading-7",
  ol: "my-3 ml-6 list-decimal",
  p: "my-3 whitespace-pre-wrap leading-7",
  s: "line-through",
  strong: "font-semibold",
  table: "my-4 min-w-full border-collapse text-left text-sm",
  td: "border border-border px-3 py-2 align-top",
  th: "border border-border bg-muted px-3 py-2 text-left font-semibold",
  ul: "my-3 ml-6 list-disc"
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
    ? createElement("div", { className: "my-4 max-w-full overflow-x-auto", key: `${key}.scroll` }, element)
    : element;
};

export const SafeDocxPreview = ({ nodes }: Readonly<{ nodes: readonly SafeDocxNode[] }>) =>
  <div className="min-h-full px-4 py-6 sm:px-8 sm:py-10">
    <article aria-label="Word document preview" className="mx-auto min-h-[min(70vh,900px)] w-full max-w-[850px] bg-white px-6 py-8 text-[15px] leading-7 text-slate-800 shadow-lg sm:px-12 sm:py-14" role="region" tabIndex={0}>
      {nodes.map((node, index) => renderNode(node, String(index)))}
    </article>
  </div>;
