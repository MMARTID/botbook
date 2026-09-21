import { ParticleField } from "@/components/particle-field";
import { ParticleMouseLayer } from "@/components/particle-mouse-layer";

// El campo de partículas quedó reservado a login/registro/onboarding
// (decisión 2026-09-16, retirado de las landings). Los pasos del onboarding
// no lo tenían: este layout lo añade una vez para todos.
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate">
      <ParticleField />
      <ParticleMouseLayer />
      {children}
    </div>
  );
}
