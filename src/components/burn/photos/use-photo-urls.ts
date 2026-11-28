"use client";

import { useEffect, useState } from "react";
import type { PhotoLike } from "./adapters";

/**
 * Object URLs for stored photos, keyed by photo id. They are made after
 * mount (never while prerendering) and revoked when the photos change or
 * the component unmounts.
 */
export function usePhotoUrls(photos: PhotoLike[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const made: Record<string, string> = {};
    for (const photo of photos) {
      made[photo.id] = URL.createObjectURL(
        new Blob([photo.bytes as BlobPart], { type: photo.mimeType }),
      );
    }
    // The URLs can only exist in the browser, so they are made after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(made);
    return () => {
      for (const url of Object.values(made)) URL.revokeObjectURL(url);
    };
  }, [photos]);

  return urls;
}
