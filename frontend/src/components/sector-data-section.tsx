import { ArrowDown, Quote } from "lucide-react";
import type { NicheAccent, SectorData } from "@/lib/niche-landings";
import { Reveal } from "@/components/scroll-reveal";
import { CountUp } from "@/components/count-up";

const FALLBACK_ACCENT: NicheAccent = {
  strong: "#8b5cf6",
  soft: "#f3eeff",
  deep: "#0a0a0a",
};

export function SectorDataSection({
  data,
  accent,
}: {
  data: SectorData;
  accent?: NicheAccent;
}) {
  const a = accent ?? FALLBACK_ACCENT;
  const cells = data.stats;

  return (
    <section id="por-que" className="scroll-m-20 border-y border-[#e5e5e5] bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 max-w-2xl">
          <span className="badge-soft gap-2" style={{ backgroundColor: a.soft, color: a.strong }}>
            <ArrowDown className="h-3.5 w-3.5" />
            {data.eyebrow}
          </span>
          <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight text-[#0a0a0a] sm:text-4xl">
            {data.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-[#52525b]">
            {data.description}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cells.map((stat, i) => (
            <Reveal key={i} delay={i * 0.1}>
              {i === 0 ? (
                <article className="flex h-full flex-col justify-between rounded-3xl bg-[#0a0a0a] p-7 text-white sm:p-8">
                  <p className="text-5xl font-black tracking-tight tabular-nums sm:text-6xl">
                    <CountUp value={stat.value} delay={i * 0.1} />
                  </p>
                  <p className="mt-4 max-w-xs text-sm leading-6 text-white/80">{stat.label}</p>
                  {stat.source ? <p className="mt-6 text-xs text-white/60">Fuente: {stat.source}</p> : null}
                </article>
              ) : (
                <article className="panel flex h-full flex-col justify-between p-7 sm:p-8">
                  <p className="text-3xl font-black tracking-tight tabular-nums text-[#0a0a0a] sm:text-4xl">
                    <CountUp value={stat.value} delay={i * 0.1} />
                  </p>
                  <p className="mt-4 text-sm leading-6 text-[#52525b]">{stat.label}</p>
                  {stat.source ? <p className="mt-6 text-xs text-[#a1a1aa]">Fuente: {stat.source}</p> : null}
                </article>
              )}
            </Reveal>
          ))}
        </div>

        {data.quotes && data.quotes.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {data.quotes.map((quote, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <figure
                  className="flex h-full items-start gap-4 rounded-3xl border border-[#e5e5e5] bg-white p-6"
                  style={{ borderLeftColor: a.strong, borderLeftWidth: 4 }}
                >
                  <Quote className="mt-0.5 h-5 w-5 shrink-0 text-[#8b5cf6]" style={{ color: a.strong }} aria-hidden="true" />
                  <div>
                    <blockquote className="text-sm font-medium italic leading-6 text-[#27272a]">
                      &ldquo;{quote.text}&rdquo;
                    </blockquote>
                    {quote.source ? (
                      <figcaption className="mt-2 text-sm text-[#71717a]">{quote.source}</figcaption>
                    ) : null}
                  </div>
                </figure>
              </Reveal>
            ))}
          </div>
        ) : null}

        {data.painPoint ? (
          <Reveal className="mt-6">
            <div className="relative overflow-hidden rounded-3xl bg-[#0a0a0a] p-6 text-white sm:p-8">
              <p className="text-sm font-semibold" style={{ color: a.soft === FALLBACK_ACCENT.soft ? "#a78bfa" : a.soft }}>
                El problema real
              </p>
              <p className="mt-2 max-w-3xl text-base leading-7 text-white/80">{data.painPoint}</p>
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
