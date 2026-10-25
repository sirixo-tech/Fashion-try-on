"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Restrict parsing to metric numbers. Dates, ratios, plan names and placeholders
// stay literal. Preserve the caller's exact final formatting.
function numericMetric(value: string | number) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const formatter = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });
    return {
      target: value,
      integer: Number.isInteger(value),
      format: (n: number) => formatter.format(n),
    };
  }
  const match = value.match(
    /^([₹$€£]?\s*)([+-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?)(%?)$/,
  );
  if (!match) return null;
  const [, prefix, numeric, suffix] = match;
  const target = Number(numeric!.replaceAll(",", ""));
  if (!Number.isFinite(target)) return null;
  const decimals = numeric!.split(".")[1]?.length ?? 0;
  const indian = /,\d{2},/.test(numeric!);
  const formatter = new Intl.NumberFormat(indian ? "en-IN" : "en-US", {
    useGrouping: numeric!.includes(","),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: numeric!.startsWith("+") ? "always" : "auto",
  });
  return {
    target,
    integer: decimals === 0,
    format: (n: number) => `${prefix}${formatter.format(n)}${suffix}`,
  };
}

/** Animate only presentation; assistive technology always gets the real value. */
export function MetricValue({
  value,
  duration = 850,
}: {
  value: ReactNode;
  duration?: number;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState<{
    value: ReactNode;
    display: string;
  } | null>(null);
  useEffect(() => {
    if (typeof value !== "number" && typeof value !== "string") return;
    const metric = numericMetric(value);
    if (
      !metric ||
      metric.target === 0 ||
      duration <= 0 ||
      !window.matchMedia ||
      !window.requestAnimationFrame
    )
      return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let raf = 0;
    let observer: IntersectionObserver | undefined;
    let active = true;
    let startedAnimation = false;
    const stop = () => {
      active = false;
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      setFrame(null);
    };
    const start = () => {
      if (!active || startedAnimation) return;
      startedAnimation = true;
      observer?.disconnect();
      let started: number | null = null;
      const tick = (now: number) => {
        if (!active) return;
        started ??= now;
        const progress = Math.min(1, (now - started) / duration);
        if (progress >= 1) {
          setFrame(null);
          return;
        }
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = metric.target * eased;
        setFrame({
          value,
          display: metric.format(
            metric.integer ? Math.trunc(current) : current,
          ),
        });
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    };
    if (window.IntersectionObserver && element.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) start();
      });
      observer.observe(element.current);
    } else start();
    const changed = () => {
      if (motion.matches) stop();
    };
    motion.addEventListener?.("change", changed);
    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      motion.removeEventListener?.("change", changed);
    };
  }, [value, duration]);
  const animated = frame?.value === value ? frame : null;
  return (
    <span ref={element} className="tabular-nums">
      {animated ? (
        <>
          <span aria-hidden="true">{animated.display}</span>
          <span className="sr-only">{value}</span>
        </>
      ) : (
        value
      )}
    </span>
  );
}
