import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, PhoneCall, Sparkles } from "lucide-react";
import { PlansWithRoi } from "@/components/plans-with-roi";
import { PlansHeadline } from "@/components/plans-headline";

const benefits = [
  { title: "Sin fricción", description: "Elige plan primero y crea tu cuenta después.", icon: Sparkles },
  { title: "Agenda preparada", description: "Conecta calendario cuando accedas al panel.", icon: CalendarDays },
  { title: "Atención continua", description: "Tu asistente puede responder incluso fuera de horario.", icon: PhoneCall },
  { title: "Minutos claros", description: "Cada plan indica minutos incluidos y coste adicional.", icon: Clock3 },
] as const;

export default function PlansPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(214,255,114,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,24,20,0.08),transparent_24%),linear-gradient(180deg,#f9fbf7_0%,#eef3eb_52%,#e4ebe0_100%)] text-[#1e2b22]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/landing" className="btn-secondary h-10 px-4">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <Link href="/login" className="btn-ghost h-10 px-4">
            Ya tengo cuenta
          </Link>
        </header>

        <section className="flex flex-1 items-center py-10 lg:py-16">
          <div className="w-full space-y-10">
            <div className="mx-auto max-w-3xl text-center">
              <span className="badge-soft">Planes AsistAI</span>
              <PlansHeadline />
              <p className="mt-5 text-lg leading-8 text-[#54634b]">
                Elige el plan que encaja hoy y déjanos la recepción: disponibilidad real, tono impecable y operativa lista para crecer.
              </p>
            </div>

            <PlansWithRoi />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ title, description, icon: Icon }) => (
                <article key={title} className="panel p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef6dc] text-[#2c7334]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-[#1e2b22]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#687267]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
