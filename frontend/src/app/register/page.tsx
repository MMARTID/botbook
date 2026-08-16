"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { isPlanId, savePendingPlan } from "@/lib/billing-navigation";
import { normalizeBusinessType } from "@/lib/business-type";

const REGISTRATION_NICHE_KEY = "asistai_registration_niche";
const REGISTRATION_COUNTRY_KEY = "asistai_registration_country";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("ES");
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
    setLoading(true);
    setError("");

    try {
      const businessType = window.localStorage.getItem(REGISTRATION_NICHE_KEY) ?? undefined;
      window.localStorage.setItem(REGISTRATION_COUNTRY_KEY, country);
      const { data } = await api.post<{ token: string }>("/auth/register", {
        email,
        password,
        country,
        businessType: businessType ? normalizeBusinessType(businessType) : undefined,
      });
      window.localStorage.setItem("asistai_token", data.token);
      const planFromUrl = new URLSearchParams(window.location.search).get("plan");
      if (isPlanId(planFromUrl)) savePendingPlan(planFromUrl);
      const planParam = isPlanId(planFromUrl) ? `?plan=${planFromUrl}` : "";
      window.location.href = `/register/business${planParam}`;
    } catch (error) {
      const responseError = error as { response?: { data?: { error?: string } } };
      if (responseError.response?.data?.error) {
        setError(responseError.response.data.error);
      } else {
        setError("Error al registrar la cuenta.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#1e2b22] text-[#b8d96e] shadow-sm">
            <Bot className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22]">Crear cuenta</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-[#687267]">
            Regístrate para configurar tu asistente y comenzar a mejorar la experiencia de tus clientes.
          </p>
        </div>

        <div className="mt-8">
          <GoogleAuthButton
            onError={setError}
            beforeStart={() => {
              const planId = new URLSearchParams(window.location.search).get("plan");
              if (isPlanId(planId)) savePendingPlan(planId);
            }}
          />
          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-[#e4e8df]" />
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-[#8a9388]">o con email</span>
            <div className="h-px flex-1 bg-[#e4e8df]" />
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#344038]">Email</label>
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
              <label className="text-sm font-medium text-[#344038]">Contraseña</label>
              <input
                type="password"
                required
                className="field mt-2 w-full"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#344038]">País del negocio</label>
              <select
                className="field mt-2 w-full"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="ES">España</option>
                <option value="FR">Francia</option>
                <option value="DE">Alemania</option>
                <option value="IT">Italia</option>
                <option value="PT">Portugal</option>
                <option value="NL">Países Bajos</option>
                <option value="BE">Bélgica</option>
                <option value="AT">Austria</option>
                <option value="CH">Suiza</option>
                <option value="GB">Reino Unido</option>
                <option value="US">Estados Unidos</option>
                <option value="MX">México</option>
                <option value="OTHER">Otro</option>
              </select>
              <p className="mt-1 text-xs text-[#687267]">
                Selecciona el país donde opera el negocio. Las cuentas europeas usan Retell.ai para cumplir con la RGPD.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? "Creando cuenta..." : "Registrarse"}
          </button>

          <div className="text-center text-sm text-[#687267]">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="font-medium text-[#1e2b22] transition hover:text-[#243026]">
              Inicia sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
