"use client";

import { useState } from "react";
import type { Dashboard } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { api, ApiError } from "../../lib/api";
import { Badge, Button, Card } from "../ui";

export function Offers({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  const [accepted, setAccepted] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const accept = async (id: string) => {
    try {
      setError("");
      setSubmitting(id);
      const result = await api<{ accepted: boolean; message?: string; reason?: string }>(`/offers/${id}/accept`, { method: "POST" });
      setAccepted(result.accepted ? result.message || copy.requestRecorded : result.reason || copy.offerPaused);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.requestFailed);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="mt-7 animate-rise">
      <Card className="p-6">
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">{copy.personalized}</p>
        <h2 className="text-[30px] font-bold">{copy.recommendations}</h2>
        <p className="leading-relaxed text-muted">{copy.recommendationText}</p>
        {data.offers.length ? data.offers.map(offer => (
          <div key={offer.id} className="border-b border-border py-4.5 py-[18px] last:border-b-0">
            <div className="flex items-center justify-between gap-4">
              <strong className="text-lg">{offer.product_code.replaceAll("_", " ")}</strong>
              <Badge tone={offer.blocked_by_ethics ? "danger" : "success"}>{offer.blocked_by_ethics ? "Paused by ethics" : "Recommended"}</Badge>
            </div>
            <p className="leading-relaxed text-muted">{offer.reason}</p>
            <Button variant="outline" disabled={offer.blocked_by_ethics || submitting === offer.id} onClick={() => void accept(offer.id)} className="px-3.5 py-2.5">
              {offer.blocked_by_ethics ? copy.paused : submitting === offer.id ? copy.recording : copy.request}
            </Button>
          </div>
        )) : <p className="text-muted">{copy.noOffersYet}</p>}
        {accepted && <p role="status" className="mt-4.5 font-bold text-primary">{accepted}</p>}
        {error && <p role="alert" className="mt-4.5 font-bold text-danger">{error}</p>}
      </Card>
    </div>
  );
}
