"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/api";
import { BrandMark } from "@/components/brand-mark";
import { ParticleField } from "@/components/particle-field";
import { ParticleMouseLayer } from "@/components/particle-mouse-layer";

const INVALID_LINK_MESSAGE = "El enlace no es válido o ha caducado.";

function InvalidLink() {
  return (
    <div className="space-y-4 text-center">
      <BrandMark className="mx-auto h-14 w-14" />
      <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Este enlace ya no sirve</h1>
      <p className="mx-auto max-w-md text-sm leading-6 text-muted">
        Los enlaces caducan en 1 hora y solo se pueden usar una vez. Pide uno nuevo y lo tendrás en tu
        correo en unos segundos.
      </p>
      <p className="pt-2">
        <Link href="/recuperar-contrasena" className="btn-primary w-full justify-center sm:w-auto">
          Pedir un enlace nuevo
        </Link>
      </p>
    </div>
  );
}

function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { token: sessionToken } = await resetPassword({ token, password });
      window.localStorage.setItem("alhabla_token", sessionToken);
      window.location.href = "/";
    } catch (requestError) {
      const response = (requestError as { response?: { status?: number; data?: { error?: string; errors?: { message?: string }[] } } })
        .response;
      const status = response?.status;
      if (status === 400 && response?.data?.error?.startsWith(INVALID_LINK_MESSAGE)) {
        setExpired(true);
      } else if (status === 400) {
        // Validación de la contraseña: el backend ya explica qué falta.
        setError(response?.data?.errors?.[0]?.message ?? "Revisa la contraseña: mínimo 8 caracteres, con una letra y un número.");
      } else if (status === 429) {
        setError("Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.");
      } else if (status !== undefined) {
        setError("No se pudo cambiar la contraseña. Inténtalo de nuevo.");
      } else {
        setError("No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (expired) return <InvalidLink />;

  return (
    <>
      <div className="space-y-4 text-center">
        <BrandMark className="mx-auto h-14 w-14" />
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Crea una contraseña nueva</h1>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted">
          Al guardarla entrarás directamente en tu panel.
        </p>
      </div>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="reset-password" className="text-sm font-medium text-[#27272a]">
            Contraseña nueva
          </label>
          <input
            id="reset-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            aria-describedby="reset-password-hint"
            className="field mt-2 w-full"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p id="reset-password-hint" className="mt-2 text-xs leading-5 text-muted">
            Mínimo 8 caracteres, con al menos una letra y un número.
          </p>
        </div>

        <p className="min-h-5 text-sm text-[#c53030]" role="alert">
          {error}
        </p>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
          {loading ? "Guardando…" : "Guardar y entrar"}
        </button>
      </form>
    </>
  );
}

function RestablecerContrasenaContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <ParticleField />
      <ParticleMouseLayer />
      <div className="panel w-full max-w-lg p-8">
        {token ? <ResetForm token={token} /> : <InvalidLink />}
      </div>
    </div>
  );
}

export default function RestablecerContrasenaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Cargando…</div>}>
      <RestablecerContrasenaContent />
    </Suspense>
  );
}
