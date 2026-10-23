export const DriveTextPreview = ({ text, fileName }: Readonly<{ text: string; fileName: string }>) =>
  <pre
    aria-label={`Text preview: ${fileName}`}
    className="mx-auto min-h-full w-full max-w-5xl overflow-auto whitespace-pre-wrap break-words bg-white px-5 py-6 font-mono text-sm leading-7 text-slate-800 sm:px-10 sm:py-8"
    role="region"
    tabIndex={0}
  >
    {text}
  </pre>;
