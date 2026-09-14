"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ShieldCheck, ShieldAlert, X } from "lucide-react";
import type { KycStatus } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { api, ApiError } from "../../lib/api";
import { Badge, Button, Card } from "../ui";

/**
 * The verification journey, made reachable.
 *
 * KYC was a one-way door: personas start `pending`, the consent screen renders
 * exactly once on the way into the dashboard, and after verifying there was no
 * route back to it from anywhere in the app. So the consent record that the
 * project's own DPDP safeguards are built around — and that the pitch presents
 * as a headline ethical feature — was invisible to the person who gave it, and
 * the whole onboarding pillar disappeared from the running product after the
 * first sign-in.
 *
 * This view shows the verification state, exactly what is retained, and
 * explicitly what is not, and offers the KYC step itself when still pending.
 */
export function Verification({ copy, onStartKyc }: { copy: TranslationCopy; onStartKyc: () => void }) {
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<KycStatus>("/kyc/status")
      .then(result => { if (!cancelled) setStatus(result); })
      .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : copy.kycLoadFailed); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- copy is only read for the fallback message
  }, []);

  const verified = status?.kyc_status === "verified";
  const rows: Array<[string, string | null | undefined]> = [
    [copy.kycReference, status?.mock_ref],
    [copy.kycDocType, status?.doc_type === "pan" ? copy.panCard : status?.doc_type === "aadhaar" ? copy.aadhaar : status?.doc_type],
    [copy.kycConsentLanguage, status?.consent_locale],
    [copy.kycConsentDate, status?.consent_timestamp ? new Date(status.consent_timestamp).toLocaleString() : null],
  ];

  return (
    <div className="mt-7 animate-rise">
      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{copy.verification}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-[30px] font-bold">{copy.kycRecordTitle}</h2>
          <Badge tone={verified ? "success" : "gold"}>{verified ? copy.kycVerified : copy.kycPending}</Badge>
        </div>
        <p className="leading-relaxed text-muted">{copy.kycRecordIntro}</p>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

        {verified && (
          <div className="mt-6">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-5 border-b border-border py-3.5 last:border-b-0">
                <span className="text-muted">{label}</span>
                <strong className="max-w-[320px] break-words text-right">{value || "—"}</strong>
              </div>
            ))}
          </div>
        )}

        <Button onClick={onStartKyc} variant={verified ? "outline" : "primary"} className="mt-6">
          <ShieldCheck size={18} /> {verified ? copy.kycRerun : copy.kycCompleteNow}
        </Button>
        {verified && <p className="mt-2.5 text-xs leading-relaxed text-muted">{copy.kycRerunHint}</p>}
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="p-6">
          <p className="flex items-center gap-2 text-sm font-bold text-success"><BadgeCheck size={17} /> {copy.kycWeKeep}</p>
          <ul className="mt-3 space-y-2">
            {(status?.retained_fields ?? []).map(field => (
              <li key={field} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                <BadgeCheck size={15} className="mt-0.5 flex-none text-success" /> {field}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <p className="flex items-center gap-2 text-sm font-bold text-danger"><ShieldAlert size={17} /> {copy.kycWeNeverKeep}</p>
          <ul className="mt-3 space-y-2">
            {(status?.never_retained ?? []).map(field => (
              <li key={field} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                <X size={15} className="mt-0.5 flex-none text-danger" /> {field}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
