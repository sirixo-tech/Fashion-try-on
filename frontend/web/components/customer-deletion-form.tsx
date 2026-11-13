"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Input,
  Label,
} from "@selfx/ui";
import { selfxApiUrl } from "@/lib/api";

// Public customer requests must not invoke the merchant session refresh hooks.
class DeletionRequestError extends Error {}
async function deletionRequest<T>(
  action: "request" | "confirm",
  body: object,
): Promise<T> {
  const response = await fetch(
    selfxApiUrl(`/api/v1/customer/account-deletion/${action}`),
    {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    const messages: Record<string, string> = {
      CUSTOMER_CODE_INVALID:
        "This code is invalid or expired. Check the code or request another one.",
      CUSTOMER_RATE_LIMITED:
        "Too many attempts. Please try again in 15 minutes.",
      CUSTOMER_PAYMENT_PENDING:
        "A payment is still pending. Contact SelfX support before deleting your account.",
    };
    throw new DeletionRequestError(
      messages[data?.error?.code] ??
        "The request could not be completed. Please try again or contact SelfX support.",
    );
  }
  return data as T;
}

export function CustomerDeletionForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [proof, setProof] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);

  async function submit(event: FormEvent, resend = false) {
    event.preventDefault();
    if (inFlight.current) return;
    const confirming = Boolean(proof) && !resend;
    if (confirming && (!confirmation || !/^\d{6}$/.test(code))) {
      setError(
        "Enter the six-digit code and confirm that you want to delete your customer account.",
      );
      return;
    }
    if (resend && Date.now() < resendAt) {
      setError("Wait at least 60 seconds before requesting another code.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (confirming) {
        const result = await deletionRequest<{ message: string }>("confirm", {
          email: email.trim(),
          code,
          deletionProof: proof,
          confirmation: "DELETE",
        });
        setProof("");
        setCode("");
        setEmail("");
        setConfirmation(false);
        setMessage(result.message);
        setDone(true);
      } else {
        const result = await deletionRequest<{
          message: string;
          deletionProof: string;
          resendAfterSeconds: number;
        }>("request", {
          email: email.trim(),
          website,
          ...(proof ? { deletionProof: proof } : {}),
        });
        setProof(result.deletionProof);
        setMessage(result.message);
        setCode("");
        setResendAt(Date.now() + result.resendAfterSeconds * 1000);
      }
    } catch (failure) {
      setError(
        failure instanceof DeletionRequestError
          ? failure.message
          : "The request could not be completed. Please try again or contact SelfX support.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div role="status">
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!done && (
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deletion-email">Registered customer email</Label>
            <Input
              id="deletion-email"
              type="email"
              autoComplete="email"
              maxLength={320}
              required
              value={email}
              disabled={busy || Boolean(proof)}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="hidden" aria-hidden="true">
            <label htmlFor="deletion-website">Leave this field empty</label>
            <input
              id="deletion-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              maxLength={200}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          {proof && (
            <>
              <div className="space-y-2">
                <Label htmlFor="deletion-code">
                  Deletion verification code
                </Label>
                <Input
                  id="deletion-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  disabled={busy}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  aria-describedby="deletion-code-help"
                />
                <p
                  id="deletion-code-help"
                  className="text-sm text-muted-foreground"
                >
                  Use the deletion code requested in this browser tab. Sign-in
                  and password-reset codes will not work.
                </p>
              </div>
              <label className="flex items-start gap-3 text-sm leading-6">
                <Checkbox
                  className="mt-1"
                  required
                  checked={confirmation}
                  disabled={busy}
                  onCheckedChange={(checked) => setConfirmation(checked)}
                />
                <span>
                  I understand that this permanently closes my SelfX customer
                  account and removes access to its photos and saved looks.
                </span>
              </label>
            </>
          )}
          <Button
            type="submit"
            variant={proof ? "destructive" : "default"}
            className="h-auto w-full whitespace-normal"
            disabled={busy}
          >
            {busy
              ? "Please wait…"
              : proof
                ? "Verify and delete my customer account"
                : "Request deletion code"}
          </Button>
          {proof && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={(event) => void submit(event, true)}
              >
                Resend code
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setProof("");
                  setCode("");
                  setConfirmation(false);
                  setMessage("");
                  setError("");
                }}
              >
                Use another email
              </Button>
            </div>
          )}
        </form>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Sending a request alone does not delete an account. Keep verification
        codes private. Verification details stay in this tab’s memory and are
        cleared when you leave.
      </p>
    </div>
  );
}
