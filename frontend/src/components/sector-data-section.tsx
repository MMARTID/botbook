import { BarChart3, PhoneOff, Quote } from "lucide-react";
import type { NicheAccent, SectorData } from "@/lib/niche-landings";

const FALLBACK_ACCENT: NicheAccent = {
  strong: "#2c7334",
  soft: "#eef6dc",
  deep: "#1e2b22",
};

export function SectorDataSection({
  data,
  accent,
}: {
  data: SectorData;
  accent?: NicheAccent;
}) {
  const a = accent ?? FALLBACK_ACCENT;
  const [featured, ...rest] = data.stats;

  return (
    <section
      className="relative overflow-hidden border-y border-white/70 py-16 sm:py-20"
      style={{
        background: `linear-gradient(160deg, ${a.soft} 0%, rgba(255,255,255,0.94) 58%, #ffffff 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-[110px]"
        style={{ backgroundColor: a.soft }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: a.strong }}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {data.eyebrow}
          </span>
          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-[#1e2b22] sm:text-4xl">
            {data.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-[#54634b]">
            {data.description}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured ? (
            <article
              className={`relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] p-7 text-white shadow-[0_18px_45px_rgba(16,24,20,0.14)] sm:col-span-2 sm:p-8 ${rest.length === 1 ? "lg:col-span-2" : "lg:col-span-1"}`}
              style={{
                background: `linear-gradient(150deg, ${a.deep} 0%, ${a.strong} 100%)`,
              }}
            >
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
              <span
                className="inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"
                style={{ color: a.soft }}
              >
                Dato clave
              </span>
              <div className="mt-8">
                <p className="text-5xl font-semibold tracking-tight sm:text-6xl">
                  {featured.value}
                </p>
                <p className="mt-4 max-w-xs text-sm leading-6 text-white/85">
                  {featured.label}
                </p>
              </div>
              {featured.source ? (
                <p className="mt-6 text-xs text-white/60">
                  Fuente: {featured.source}
                </p>
              ) : null}
            </article>
          ) : null}

          {rest.map((stat, i) => (
            <article
              key={i}
              className="panel relative flex flex-col justify-between overflow-hidden p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,24,20,0.1)]"
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{
                  background: `linear-gradient(90deg, ${a.strong}, transparent)`,
                }}
              />
              <div>
                <p className="text-2xl font-semibold tracking-tight text-[#1e2b22] sm:text-3xl">
                  {stat.value}
                </p>
                <p className="mt-3 text-sm leading-6 text-[#54634b]">
                  {stat.label}
                </p>
              </div>
              {stat.source ? (
                <p className="mt-4 text-xs text-[#8b9a7f]">
                  Fuente: {stat.source}
                </p>
              ) : null}
            </article>
          ))}
        </div>

        {data.quotes && data.quotes.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {data.quotes.map((quote, i) => (
              <figure
                key={i}
                className="flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm"
                style={{ borderColor: a.soft }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: a.strong }}
                >
                  <Quote className="h-5 w-5" />
                </span>
                <div>
                  <blockquote className="text-sm font-medium italic leading-6 text-[#344038]">
                    &ldquo;{quote.text}&rdquo;
                  </blockquote>
                  {quote.source ? (
                    <figcaption className="mt-1 text-xs text-[#8b9a7f]">
                      {quote.source}
                    </figcaption>
                  ) : null}
                </div>
              </figure>
            ))}
          </div>
        ) : null}

        {data.painPoint ? (
          <div className="relative mt-8 overflow-hidden rounded-[1.75rem] bg-[#1e2b22] p-6 text-white sm:p-8">
            <div
              className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full opacity-25 blur-3xl"
              style={{ backgroundColor: a.strong }}
            />
            <div className="relative flex items-start gap-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: a.strong }}
              >
                <PhoneOff className="h-5 w-5 text-white" />
              </span>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: a.soft }}
                >
                  El problema real
                </p>
                <p className="mt-2 max-w-3xl text-base leading-7 text-white/80">
                  {data.painPoint}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
