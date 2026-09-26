"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { BrandMark } from "@/components/brand-mark";
import { ParticleField } from "@/components/particle-field";
import { ParticleMouseLayer } from "@/components/particle-mouse-layer";
import { webUrl } from "@/lib/web-url";
import { destinoTrasLogin } from "@/lib/login-next";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data } = await api.post<{ token: string }>("/auth/login", { email, password });
      window.localStorage.setItem("alhabla_token", data.token);
      window.location.href = destinoTrasLogin(window.location.search);
    } catch (error) {
      // Distinguir credenciales de un fallo de red: antes el mismo mensaje
      // cubría los dos casos y el usuario no podía saber si reintentar
      // servía de algo o si el problema era la conexión.
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        setError("Email o contraseña incorrectos.");
      } else if (status !== undefined) {
        setError("Error al iniciar sesión. Inténtalo de nuevo.");
      } else {
        setError("No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <ParticleField />
      <ParticleMouseLayer />
      <a
        href={webUrl("/")}
        aria-label="Volver a la web de Alhabla"
        className="fixed left-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#27272a] shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </a>
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <BrandMark className="mx-auto h-14 w-14" />
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Bienvenido de nuevo</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Accede para configurar tu asistente y comenzar a mejorar la experiencia de tus clientes.
          </p>
        </div>

        <div className="mt-8">
          <GoogleAuthButton onError={setError} acceptedTerms />
          <p className="mt-3 text-center text-xs leading-5 text-muted">
            Si es tu primera vez, al continuar aceptas los{" "}
            <a href={webUrl("/legal/aviso-legal")} target="_blank" rel="noopener" className="rounded font-medium text-[#7c3aed] underline underline-offset-2 hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2">
              Términos y Condiciones
            </a>{" "}
            y la{" "}
            <a href={webUrl("/legal/privacidad")} target="_blank" rel="noopener" className="rounded font-medium text-[#7c3aed] underline underline-offset-2 hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2">
              Política de privacidad
            </a>
            .
          </p>
          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-[#e5e5e5]" />
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#71717a]">o con email</span>
            <div className="h-px flex-1 bg-[#e5e5e5]" />
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="login-email" className="text-sm font-medium text-[#27272a]">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="field mt-2 w-full"
                placeholder="tucorreo@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="login-password" className="text-sm font-medium text-[#27272a]">Contraseña</label>
                <Link
                  href="/recuperar-contrasena"
                  className="rounded text-sm font-medium text-[#7c3aed] transition hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2"
                >
                  ¿La has olvidado?
                </Link>
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                className="field mt-2 w-full"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Alto reservado aunque no haya error: así el botón no se
              desplaza justo cuando el usuario reintenta con el pulgar ya
              puesto encima. */}
          <p className="min-h-5 text-sm text-[#c53030]" role="alert">{error}</p>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <div className="text-center text-sm text-muted">
            ¿No tienes cuenta?{' '}
            <a href={webUrl("/register")} className="rounded font-semibold text-[#7c3aed] transition hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2">
              Regístrate aquí
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}