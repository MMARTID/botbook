"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { BrandMark } from "@/components/brand-mark";
import { ParticleField } from "@/components/particle-field";
import { isPlanId, savePendingPlan } from "@/lib/billing-navigation";
import { normalizeBusinessType } from "@/lib/business-type";

const REGISTRATION_NICHE_KEY = "alhabla_registration_niche";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isEuropeanUnion, setIsEuropeanUnion] = useState<boolean | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const niche = new URLSearchParams(window.location.search).get("niche");
    if (niche) {
      window.localStorage.setItem(REGISTRATION_NICHE_KEY, normalizeBusinessType(niche));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isEuropeanUnion === null) {
      setError("Indica si tus clientes son de la Unión Europea.");
      return;
    }

    if (!acceptedTerms) {
      setError("Debes aceptar los Términos y Condiciones y la Política de privacidad.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const businessType = window.localStorage.getItem(REGISTRATION_NICHE_KEY) ?? undefined;
      const { data } = await api.post<{ token: string }>("/auth/register", {
        email,
        password,
        isEuropeanUnion,
        acceptedTerms,
        businessType: businessType ? normalizeBusinessType(businessType) : undefined,
      });
      window.localStorage.setItem("alhabla_token", data.token);
      const planFromUrl = new URLSearchParams(window.location.search).get("plan");
      if (isPlanId(planFromUrl)) savePendingPlan(planFromUrl);
      const planParam = isPlanId(planFromUrl) ? `?plan=${planFromUrl}` : "";
      window.location.href = `/register/business${planParam}`;
    } catch (error) {
      const responseError = error as {
        response?: { data?: { error?: string | Array<{ message?: string }> } };
      };
      const apiError = responseError.response?.data?.error;
      if (typeof apiError === "string") {
        setError(apiError);
      } else if (Array.isArray(apiError) && apiError[0]?.message) {
        setError(apiError[0].message);
      } else {
        setError("Error al registrar la cuenta.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <ParticleField />
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <BrandMark className="mx-auto h-14 w-14" />
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Crear cuenta</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Regístrate para configurar tu asistente y comenzar a mejorar la experiencia de tus clientes.
          </p>
        </div>

        <div className="mt-8">
          <GoogleAuthButton
            onError={setError}
            disabled={!acceptedTerms}
            acceptedTerms={acceptedTerms}
            beforeStart={() => {
              const planId = new URLSearchParams(window.location.search).get("plan");
              if (isPlanId(planId)) savePendingPlan(planId);
            }}
          />
          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-[#e5e5e5]" />
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#a1a1aa]">o con email</span>
            <div className="h-px flex-1 bg-[#e5e5e5]" />
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#27272a]">Email</label>
              <input
                type="email"
                required
                className="field mt-2 w-full"
                placeholder="tucorreo@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#27272a]">Contraseña</label>
              <input
                type="password"
                required
                className="field mt-2 w-full"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-[#27272a]">¿Tus clientes son de la Unión Europea?</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {([
                  { label: "Sí", value: true },
                  { label: "No", value: false },
                ] as const).map((option) => (
                  <label key={option.label} className="group relative block cursor-pointer">
                    <input
                      type="radio"
                      name="isEuropeanUnion"
                      required
                      className="peer sr-only"
                      checked={isEuropeanUnion === option.value}
                      onChange={() => setIsEuropeanUnion(option.value)}
                    />
                    <span className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#e5e5e5] bg-white text-sm font-semibold text-[#27272a] transition peer-checked:border-[#8b5cf6] peer-checked:bg-[#f3eeff] peer-checked:text-[#6d28d9] peer-focus-visible:ring-4 peer-focus-visible:ring-[#8b5cf6]/30 peer-focus-visible:ring-offset-2 group-hover:border-[#8b5cf6]">
                      {isEuropeanUnion === option.value ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Lo usamos para preparar tu asistente conforme a la RGPD desde el primer día.
              </p>
            </fieldset>
            <label className="flex items-start gap-3 text-sm text-[#27272a]">
              <input
                type="checkbox"
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d4d4d8] text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8b5cf6]/30"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>
                He leído y acepto los{" "}
                <Link href="/legal/aviso-legal" target="_blank" className="font-semibold text-[#7c3aed] underline underline-offset-2 transition hover:text-[#6d28d9]">
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link href="/legal/privacidad" target="_blank" className="font-semibold text-[#7c3aed] underline underline-offset-2 transition hover:text-[#6d28d9]">
                  Política de privacidad
                </Link>
                .
              </span>
            </label>
          </div>

          {error && <p className="text-sm text-[#c53030]">{error}</p>}

          <button
            type="submit"
            disabled={loading || !acceptedTerms}
            className="btn-primary w-full justify-center"
          >
            {loading ? "Creando cuenta..." : "Registrarse"}
          </button>

          <div className="text-center text-sm text-muted">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="font-semibold text-[#7c3aed] transition hover:text-[#6d28d9]">
              Inicia sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
