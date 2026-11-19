"use client";

import { cn } from "@/lib/utils";
import { MESSAGES } from "@/lib/messages";
import type { BurnPhoto } from "@/lib/types";
import { usePhotoUrls } from "./use-photo-urls";

const M = MESSAGES.burnPhotos;

export function photoAlt(photo: BurnPhoto, index: number, total: number): string {
  return photo.caption ?? M.photoAlt(index + 1, total);
}

/**
 * Read-only photos. "screen": a thumbnail grid. "print": larger images, two
 * per row, never split across a page break.
 */
export function PhotoGrid({
  photos,
  variant = "screen",
}: {
  photos: BurnPhoto[];
  variant?: "screen" | "print";
}) {
  const urls = usePhotoUrls(photos);
  if (photos.length === 0) return null;
  const print = variant === "print";
  return (
    <ul
      data-variant={variant}
      className={cn(
        "grid list-none gap-3 p-0",
        print ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
      )}
    >
      {photos.map((photo, i) => (
        <li key={photo.id} className="min-w-0 break-inside-avoid">
          <figure className="m-0 break-inside-avoid">
            {urls[photo.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[photo.id]}
                alt={photoAlt(photo, i, photos.length)}
                loading="lazy"
                width={photo.width}
                height={photo.height}
                className={cn(
                  "w-full rounded-md border border-border bg-muted",
                  print ? "h-auto" : "aspect-square object-cover",
                )}
              />
            ) : (
              <div className="aspect-square w-full rounded-md bg-muted" />
            )}
            {photo.caption ? (
              <figcaption className="mt-1 text-sm break-words text-text-secondary">
                {photo.caption}
              </figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}
