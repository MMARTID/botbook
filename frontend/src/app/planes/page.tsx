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
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/landing" className="btn-secondary px-4">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <Link href="/login" className="btn-secondary px-4">
            Ya tengo cuenta
          </Link>
        </header>

        <section className="flex flex-1 items-center py-10 lg:py-16">
          <div className="w-full space-y-10">
            <div className="mx-auto max-w-3xl text-center">
              <span className="badge-soft">Planes Alhabla</span>
              <PlansHeadline />
              <p className="mt-5 text-lg leading-8 text-[#52525b]">
                Elige el plan que encaja hoy y déjanos la recepción: disponibilidad real, tono impecable y operativa lista para crecer.
              </p>
            </div>

            <PlansWithRoi />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ title, description, icon: Icon }) => (
                <article key={title} className="panel p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-bold text-[#0a0a0a]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#52525b]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
