"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Check, ExternalLink, KeyRound } from "lucide-react";
import { connectAppleCalendar, selectCalendar } from "@/lib/api";
import type { Business, CalendarListItem } from "@/lib/types";

const APPLE_APP_PASSWORDS_URL = "https://account.apple.com/account/manage";

/**
 * Alta del calendario de Apple (iCloud) en dos pasos, sin salir de la
 * página: (1) Apple ID + contraseña de aplicación, que el backend valida
 * contra iCloud; (2) elegir el calendario de la cuenta. No se pide la
 * contraseña de la cuenta de Apple: solo una contraseña de aplicación, que
 * el negocio puede revocar cuando quiera desde su cuenta.
 */
export function AppleCalendarConnect({
  onConnected,
  onCancel,
}: {
  onConnected: (business: Business) => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [account, setAccount] = useState<{
    email: string | null;
    calendars: CalendarListItem[];
  } | null>(null);

  const connectMutation = useMutation({
    mutationFn: connectAppleCalendar,
    onSuccess: (data) => setAccount(data),
  });

  const selectMutation = useMutation({
    mutationFn: selectCalendar,
    onSuccess: (business) => onConnected(business),
  });

  const connectError = errorMessage(connectMutation.error);
  const selectError = selectMutation.error
    ? "No se pudo guardar el calendario elegido. Inténtalo de nuevo."
    : null;

  if (account) {
    return (
      <div className="space-y-3 rounded-xl border border-[#ddd6fe] bg-[#f3eeff] p-4">
        <div>
          <p className="text-sm font-semibold text-[#0a0a0a]">
            Cuenta verificada{account.email ? ` · ${account.email}` : ""}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Elige el calendario donde la recepcionista apuntará las citas.
          </p>
        </div>
        {account.calendars.length === 0 ? (
          <p className="text-sm text-[#c53030]">
            Esta cuenta no tiene ningún calendario. Crea uno en la app
            Calendario del iPhone y vuelve a intentarlo.
          </p>
        ) : (
          <div className="space-y-2">
            {account.calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                disabled={selectMutation.isPending}
                onClick={() => selectMutation.mutate(calendar.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-left transition duration-200 hover:border-[#ddd6fe] disabled:opacity-60"
              >
                <span className="block truncate text-sm font-semibold text-[#27272a]">
                  {selectMutation.isPending &&
                  selectMutation.variables === calendar.id
                    ? "Conectando…"
                    : calendar.name}
                </span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f4f4f5] text-transparent">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        )}
        {selectError ? (
          <p className="text-sm text-[#c53030]" role="alert">
            {selectError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[#ddd6fe] bg-[#f3eeff] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        connectMutation.mutate({
          username: username.trim(),
          appPassword: appPassword.trim(),
        });
      }}
    >
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
          <KeyRound className="h-4 w-4 shrink-0 text-[#8b5cf6]" />
          Conecta el calendario de Apple
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">
          Alhabla no usa la contraseña de tu cuenta de Apple: necesita una{" "}
          <strong>contraseña de aplicación</strong>, un código que Apple genera
          solo para Alhabla y que puedes anular cuando quieras.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted">
          <li>
            Entra en{" "}
            <a
              href={APPLE_APP_PASSWORDS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[#6d28d9] underline-offset-2 hover:underline"
            >
              tu cuenta de Apple
              <ExternalLink className="h-3.5 w-3.5" />
            </a>{" "}
            → Iniciar sesión y seguridad → Contraseñas de apps.
          </li>
          <li>Pulsa «Generar contraseña de app» y llámala «Alhabla».</li>
          <li>Copia aquí el código (tiene la forma xxxx-xxxx-xxxx-xxxx).</li>
        </ol>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#27272a]">
            Apple ID
          </span>
          <input
            type="email"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="tu@icloud.com"
            className="field"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#27272a]">
            Contraseña de aplicación
          </span>
          <input
            type="password"
            name="appPassword"
            autoComplete="off"
            required
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            className="field"
          />
        </label>
      </div>

      {connectError ? (
        <p className="text-sm text-[#c53030]" role="alert">
          {connectError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={connectMutation.isPending}
          className="btn-secondary h-10 px-4"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={connectMutation.isPending}
          className="btn-primary h-10 px-4"
        >
          {connectMutation.isPending ? "Comprobando…" : "Conectar"}
        </button>
      </div>
    </form>
  );
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;
    const message = error.response?.data?.error;
    if (code === "CALDAV_INVALID_CREDENTIALS") {
      return "Apple ha rechazado el Apple ID o la contraseña de aplicación. Comprueba que el Apple ID lleva la @ y que el código es una contraseña de aplicación (no la de tu cuenta).";
    }
    if (error.response?.status === 502) {
      return "iCloud no responde ahora mismo. Inténtalo de nuevo en un minuto.";
    }
    if (typeof message === "string" && message) return message;
  }
  return "No se pudo conectar el calendario de Apple. Inténtalo de nuevo.";
}
