"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";
import { EditorForm } from "./editor-form";
import { loadEditor, type EditorTarget, type LoadResult } from "./load-editor";

const E = MESSAGES.editor;

export type FormulaEditorProps = EditorTarget;

/**
 * The formula editor for both routes (F1, F4). Loads what it starts from (a
 * stored draft, the example, or the version being revised), then hands over
 * to the form. Loading, not-found and load-failure states keep the page frame.
 */
export function FormulaEditor(props: FormulaEditorProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  // One load per attempt, even when React runs the effect twice in development.
  const loading = useRef<{ attempt: number; promise: Promise<LoadResult> } | null>(null);
  const first = useRef(props);

  useEffect(() => {
    if (loading.current?.attempt !== attempt) {
      loading.current = { attempt, promise: loadEditor(first.current) };
    }
    let live = true;
    loading.current.promise.then((result) => {
      if (live) setState(result);
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  const fromExample = state?.status === "ready" && state.start.fromExample;
  useEffect(() => {
    // The example is now unsaved work, so the address goes back to the plain editor.
    if (fromExample) router.replace("/formulas/new");
  }, [fromExample, router]);

  const revise = props.mode === "revise";
  const frameTitle = revise ? E.reviseTitle : E.title;
  const frameDescription = revise ? E.reviseDescription : E.newDescription;

  if (state === null) {
    return (
      <>
        <PageHeader title={frameTitle} description={frameDescription} />
        <p className="text-sm text-text-secondary">{E.loading}</p>
      </>
    );
  }

  if (state.status === "notFound") {
    return (
      <>
        <PageHeader title={E.notFoundTitle} />
        <p className="max-w-[60ch] text-sm text-text-secondary">{E.notFoundBody}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">{E.backToSaved}</Link>
        </Button>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <PageHeader title={frameTitle} description={frameDescription} />
        <Notice
          variant="error"
          title={E.loadFailedTitle}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setState(null);
                setAttempt((n) => n + 1);
              }}
            >
              {E.retry}
            </Button>
          }
        >
          {E.loadFailed}
        </Notice>
      </>
    );
  }

  return <EditorForm start={state.start} />;
}
