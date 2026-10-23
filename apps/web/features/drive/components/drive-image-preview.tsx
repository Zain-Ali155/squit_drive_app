"use client";

import Image from "next/image";

type DriveImagePreviewProps = Readonly<{
  fileName: string;
  src: string;
  onError: () => void;
  onLoad?: () => void;
}>;

export const DriveImagePreview = ({ fileName, src, onError, onLoad }: DriveImagePreviewProps) =>
  <div
    aria-label={`Image preview: ${fileName}`}
    className="relative h-full min-h-0 w-full overflow-auto bg-[#e8eaed]"
    role="region"
    tabIndex={0}
  >
    <div className="grid h-full min-h-0 place-items-center p-4 sm:p-8">
      <div className="relative h-full min-h-0 w-full max-w-full">
        <Image
          alt={fileName}
          className="object-contain"
          fill
          sizes="100vw"
          src={src}
          unoptimized
          onError={onError}
          onLoad={onLoad}
        />
      </div>
    </div>
  </div>;
