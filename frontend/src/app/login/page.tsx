"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { GoogleAuthButton } from "@/components/google-auth-button";

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
      window.localStorage.setItem("botbook_token", data.token);
      window.location.href = "/";
    } catch {
      setError("Credenciales incorrectas o error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1e2b22] text-[#b8d96e] shadow-sm">
            <Bot className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22]">Bienvenido de nuevo</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Accede para configurar tu asistente y comenzar a mejorar la experiencia de tus clientes.
          </p>
        </div>

        <div className="mt-8">
          <GoogleAuthButton onError={setError} />
          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-[#e4e8df]" />
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#6b756a]">o con email</span>
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
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-center text-sm text-muted">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="font-medium text-[#1e2b22] transition hover:text-[#243026]">
              Regístrate aquí
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}