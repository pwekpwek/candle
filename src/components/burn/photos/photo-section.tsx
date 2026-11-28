"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Notice } from "@/components/common/notice";
import { preparePhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { burnPhotoAdapter } from "./adapters";
import type { PhotoAdapter, PhotoLike } from "./adapters";
import { photoAlt } from "./photo-grid";
import { usePhotoUrls } from "./use-photo-urls";

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

type AddOutcome = { error?: string; stop?: boolean };

/** The burn test gallery (behaviour and text unchanged): `GallerySection` with the burn adapter. */
export function PhotoSection({ sessionId }: { sessionId: string }) {
  return <GallerySection ownerId={sessionId} adapter={burnPhotoAdapter} />;
}

/**
 * The photo gallery for any owner (burn test, investigation). The adapter says
 * where photos are listed, added and deleted, how many fit and what to say.
 */
export function GallerySection({
  ownerId,
  adapter,
  className,
}: {
  ownerId: string;
  adapter: PhotoAdapter;
  className?: string;
}) {
  const M = adapter.texts;
  const max = adapter.max;
  const [photos, setPhotos] = useState<PhotoLike[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = usePhotoUrls(photos);

  const reload = useCallback(async () => {
    try {
      setPhotos(await adapter.list(ownerId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [adapter, ownerId]);

  const readUsage = useCallback(async () => {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate && typeof estimate.usage === "number" && estimate.quota) {
        setUsage(M.storageUsage(formatBytes(estimate.usage), formatBytes(estimate.quota)));
      }
    } catch {
      setUsage(null);
    }
  }, [M]);

  useEffect(() => {
    // Initial load from the device; state is set after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    void readUsage();
  }, [reload, readUsage]);

  const full = photos.length >= max;

  async function addOne(file: File): Promise<AddOutcome> {
    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      switch (prepared.reason) {
        case "not-image":
          return { error: M.errorNotImage(file.name) };
        case "too-large":
          return { error: M.errorTooLarge(file.name) };
        case "too-big":
          return { error: M.errorTooBig(file.name) };
        default:
          return { error: M.errorUnsupported, stop: true };
      }
    }
    try {
      await adapter.add({
        ownerId,
        bytes: prepared.photo.bytes,
        width: prepared.photo.width,
        height: prepared.photo.height,
      });
      return {};
    } catch (error) {
      switch (errorCode(error)) {
        case "storage-full":
          return { error: M.errorStorageFull, stop: true };
        case "invalid":
          return { error: M.errorLimit(max), stop: true };
        case "not-found":
          return { error: M.errorNotFound, stop: true };
        default:
          return { error: M.errorStorage, stop: true };
      }
    }
  }

  async function onFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0 || busy) return;

    setBusy(true);
    setErrors([]);
    setStatus(null);
    const room = max - photos.length;
    const queue = files.slice(0, Math.max(0, room));
    const skipped = files.length - queue.length;
    const found: string[] = [];
    let added = 0;
    for (let i = 0; i < queue.length; i++) {
      setStatus(M.progress(i + 1, queue.length));
      const outcome = await addOne(queue[i]);
      if (outcome.error) found.push(outcome.error);
      else added += 1;
      if (outcome.stop) break;
    }
    setBusy(false);
    if (skipped > 0) setStatus(M.limitStopped(added, max));
    else setStatus(added > 0 ? M.addedSummary(added) : null);
    setErrors(found);
    await reload();
    void readUsage();
  }

  const openIndex = photos.findIndex((p) => p.id === openId);

  return (
    <section
      aria-labelledby={adapter.headingId}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={adapter.headingId} className="text-lg font-semibold">
          {M.heading}
        </h2>
        <span className="text-sm text-text-secondary">
          {M.count(photos.length, max)}
        </span>
      </div>

      {loadError ? <Notice variant="error">{M.loadError}</Notice> : null}

      {loaded && !loadError && photos.length === 0 ? (
        <p className="text-sm text-text-secondary">{M.empty}</p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, i) => (
            <li key={photo.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setOpenId(photo.id)}
                aria-label={M.openPhoto(i + 1, photos.length)}
                className="block min-h-11 w-full overflow-hidden rounded-md border border-border bg-muted"
              >
                {urls[photo.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[photo.id]}
                    alt={photoAlt(photo, i, photos.length, M)}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full" />
                )}
              </button>
              {photo.caption ? (
                <p className="mt-1 text-sm break-words text-text-secondary">{photo.caption}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        <Notice variant="info">{M.limitReached(max)}</Notice>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="photo-input"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <CameraIcon aria-hidden="true" />
            {M.addButton}
          </Button>
        </div>
      )}

      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        {status}
      </p>
      {errors.map((message, i) => (
        <Notice key={i} variant="error">
          {message}
        </Notice>
      ))}

      <p className="text-sm text-text-secondary">{M.privacyNote}</p>
      {usage ? <p className="text-sm text-text-secondary">{usage}</p> : null}

      <PhotoViewer
        adapter={adapter}
        photo={openIndex >= 0 ? photos[openIndex] : null}
        index={openIndex}
        total={photos.length}
        url={openIndex >= 0 ? urls[photos[openIndex].id] : undefined}
        onClose={() => setOpenId(null)}
        onDeleted={async () => {
          setOpenId(null);
          setErrors([]);
          setStatus(null);
          await reload();
          void readUsage();
        }}
      />
    </section>
  );
}

function PhotoViewer({
  adapter,
  photo,
  index,
  total,
  url,
  onClose,
  onDeleted,
}: {
  adapter: PhotoAdapter;
  photo: PhotoLike | null;
  index: number;
  total: number;
  url: string | undefined;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const M = adapter.texts;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setConfirming(false);
    setError(null);
    onClose();
  }

  async function remove() {
    if (!photo) return;
    setDeleting(true);
    setError(null);
    try {
      await adapter.remove(photo.id);
    } catch (e) {
      if (errorCode(e) !== "not-found") {
        setError(M.deleteError);
        setDeleting(false);
        return;
      }
    }
    setDeleting(false);
    setConfirming(false);
    await onDeleted();
  }

  return (
    <Dialog open={photo !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="sm:max-w-2xl">
        {photo ? (
          confirming ? (
            <>
              <DialogHeader>
                <DialogTitle>{M.deleteTitle}</DialogTitle>
                <DialogDescription>{M.deleteBody}</DialogDescription>
              </DialogHeader>
              {error ? <Notice variant="error">{error}</Notice> : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  autoFocus
                  disabled={deleting}
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                  }}
                >
                  {M.deleteCancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={deleting}
                  onClick={() => void remove()}
                >
                  {M.deleteConfirm}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{M.viewTitle(index + 1, total)}</DialogTitle>
                <DialogDescription className="sr-only">
                  {photoAlt(photo, index, total, M)}
                </DialogDescription>
              </DialogHeader>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={photoAlt(photo, index, total, M)}
                  width={photo.width}
                  height={photo.height}
                  className="mx-auto h-auto max-h-[65dvh] w-auto max-w-full rounded-md object-contain"
                />
              ) : null}
              {photo.caption ? (
                <p className="text-sm break-words text-text-secondary">{photo.caption}</p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="secondary" size="lg" onClick={close}>
                  {M.close}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setConfirming(true)}
                >
                  {M.delete}
                </Button>
              </DialogFooter>
            </>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
