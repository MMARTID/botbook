"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/lib/api";
import { BrandMark } from "@/components/brand-mark";
import { ParticleField } from "@/components/particle-field";
import { ParticleMouseLayer } from "@/components/particle-mouse-layer";

const LINK_CLASS =
  "rounded font-semibold text-[#7c3aed] transition hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (requestError) {
      const status = (requestError as { response?: { status?: number } }).response?.status;
      if (status === 429) {
        setError("Has pedido varios enlaces seguidos. Espera un minuto e inténtalo de nuevo.");
      } else if (status !== undefined) {
        setError("No hemos podido enviar el correo. Inténtalo de nuevo.");
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
      <div className="panel w-full max-w-lg p-8">
        {sent ? (
          // Sin distinguir si la cuenta existe: el backend responde igual en
          // ambos casos y aquí tampoco se insinúa nada.
          <div className="space-y-4 text-center" role="status">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <MailCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Revisa tu correo</h1>
            <p className="mx-auto max-w-md text-sm leading-6 text-muted">
              Si existe una cuenta con <strong className="font-semibold text-[#27272a]">{email}</strong>, te
              hemos enviado un enlace para crear una contraseña nueva. Caduca en 1 hora. Si no lo ves,
              mira en la carpeta de spam.
            </p>
            <p className="pt-2 text-sm text-muted">
              <Link href="/login" className={LINK_CLASS}>
                Volver a iniciar sesión
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 text-center">
              <BrandMark className="mx-auto h-14 w-14" />
              <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Recupera el acceso</h1>
              <p className="mx-auto max-w-md text-sm leading-6 text-muted">
                Escribe el email de tu cuenta y te enviamos un enlace para crear una contraseña nueva.
              </p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="recovery-email" className="text-sm font-medium text-[#27272a]">
                  Email
                </label>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  className="field mt-2 w-full"
                  placeholder="tucorreo@dominio.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              {/* Alto reservado aunque no haya error, igual que en /login: el
                  botón no se mueve justo cuando el usuario reintenta. */}
              <p className="min-h-5 text-sm text-[#c53030]" role="alert">
                {error}
              </p>

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                {loading ? "Enviando..." : "Enviarme el enlace"}
              </button>

              <p className="text-center text-sm text-muted">
                ¿La recuerdas?{" "}
                <Link href="/login" className={LINK_CLASS}>
                  Inicia sesión
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
