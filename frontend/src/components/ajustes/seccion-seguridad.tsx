"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  FeedbackMessage,
  useAjustes,
  type Feedback,
} from "@/components/ajustes/marco-de-ajustes";
import { changeAccountPassword, deleteAccount } from "@/lib/api";
import type { AccountOverview } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { clearAuthTokens } from "@/lib/billing-navigation";
import { webUrl } from "@/lib/web-url";

const PASSWORD_HAS_LETTER = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const PASSWORD_HAS_NUMBER = /\d/;

/** Ajustes › Seguridad: contraseña y eliminación de la cuenta. */
export function SeccionSeguridad() {
  const { account } = useAjustes();
  const queryClient = useQueryClient();
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forwardingCancelled, setForwardingCancelled] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>(null);

  const passwordConfigured = account.passwordConfigured;

  const passwordIsValid =
    newPassword.length >= 8 &&
    PASSWORD_HAS_LETTER.test(newPassword) &&
    PASSWORD_HAS_NUMBER.test(newPassword) &&
    newPassword === confirmPassword &&
    (!passwordConfigured || currentPassword.length > 0);

  const passwordMutation = useMutation({
    mutationFn: () =>
      changeAccountPassword({
        ...(passwordConfigured ? { currentPassword } : {}),
        newPassword,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["account-overview"],
        (current: AccountOverview | undefined) =>
          current ? { ...current, ...result } : current
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({
        type: "success",
        message:
          "Contraseña actualizada. Te hemos enviado una confirmación por correo.",
      });
    },
    onError: (error) =>
      setPasswordFeedback({
        type: "error",
        message: describeApiError(error, "No se pudo cambiar la contraseña."),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteAccount({
        ...(passwordConfigured ? { currentPassword: deletePassword } : {}),
        confirmation: "ELIMINAR",
        forwardingCancelled: true,
      }),
    onSuccess: () => {
      clearAuthTokens();
      window.location.replace(webUrl("/"));
    },
    onError: (error) =>
      setDeleteFeedback({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo eliminar la cuenta. No se ha borrado nada; inténtalo de nuevo."
        ),
      }),
  });

  const canDelete =
    forwardingCancelled &&
    deleteConfirmation === "ELIMINAR" &&
    (!passwordConfigured || deletePassword.length > 0);

  return (
    <>
      <section className="panel p-4 sm:p-6" aria-labelledby="security-title">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="security-title"
              className="text-lg font-semibold text-[#0a0a0a]"
            >
              Contraseña
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {passwordConfigured
                ? "Cambia tu contraseña. Te avisaremos por correo cuando se complete."
                : "Añade una contraseña para poder entrar también sin Google."}
            </p>
          </div>
        </div>
        <form
          className="mt-5 grid gap-4 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPasswordFeedback(null);
            if (passwordIsValid) passwordMutation.mutate();
          }}
        >
          {passwordConfigured ? (
            <label className="text-sm font-semibold text-[#27272a]">
              Contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="field mt-2 w-full"
              />
            </label>
          ) : null}
          <label className="text-sm font-semibold text-[#27272a]">
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-describedby="password-requirements"
              className="field mt-2 w-full"
            />
          </label>
          <label className="text-sm font-semibold text-[#27272a]">
            Repite la contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={
                confirmPassword.length > 0 && newPassword !== confirmPassword
              }
              className="field mt-2 w-full"
            />
          </label>
          <div className="flex flex-col gap-3 lg:col-span-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p
                id="password-requirements"
                className="text-xs leading-5 text-muted"
              >
                Mínimo 8 caracteres, con al menos una letra y un número.
              </p>
              <FeedbackMessage value={passwordFeedback} />
            </div>
            <button
              type="submit"
              disabled={!passwordIsValid || passwordMutation.isPending}
              className="btn-primary shrink-0"
            >
              {passwordMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              {passwordMutation.isPending
                ? "Actualizando…"
                : passwordConfigured
                  ? "Cambiar contraseña"
                  : "Crear contraseña"}
            </button>
          </div>
        </form>
      </section>

      <section
        className="overflow-hidden rounded-3xl border border-[#f5d3d3] bg-white"
        aria-labelledby="danger-title"
      >
        <div className="flex items-start gap-3 border-b border-[#f5d3d3] bg-[#fff1f1] p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#c53030]">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="danger-title"
              className="text-lg font-semibold text-[#0a0a0a]"
            >
              Eliminar la cuenta
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#c53030]">
              Esta acción cancela la suscripción, retira el número de Alhabla y
              elimina los datos del negocio. No se puede deshacer.
            </p>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-xl border border-[#f0dfa8] bg-[#fef8e7] p-4 text-sm leading-6 text-[#806012]">
            <strong>Antes de continuar:</strong> desactiva en tu operador el
            desvío de llamadas hacia Alhabla. Si no lo haces, tus clientes
            podrían seguir llamando a un número que ya no atiende.
          </div>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
            <input
              type="checkbox"
              checked={forwardingCancelled}
              onChange={(event) => setForwardingCancelled(event.target.checked)}
              className="mt-1 accent-[#c53030]"
            />
            <span>
              Confirmo que ya he quitado el desvío de llamadas de mi línea
              habitual.
            </span>
          </label>
          <div
            className={`grid gap-4 ${passwordConfigured ? "lg:grid-cols-2" : ""}`}
          >
            <label className="text-sm font-semibold text-[#27272a]">
              Escribe ELIMINAR para confirmar
              <input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                className="field mt-2 w-full"
                placeholder="ELIMINAR"
              />
            </label>
            {passwordConfigured ? (
              <label className="text-sm font-semibold text-[#27272a]">
                Contraseña actual
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  className="field mt-2 w-full"
                />
              </label>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-[#f5d3d3] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <FeedbackMessage value={deleteFeedback} />
            <button
              type="button"
              onClick={() => {
                setDeleteFeedback(null);
                if (canDelete) deleteMutation.mutate();
              }}
              disabled={!canDelete || deleteMutation.isPending}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#c53030] px-6 text-sm font-semibold text-white transition hover:bg-[#9f2424] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030] focus-visible:ring-offset-2"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deleteMutation.isPending
                ? "Eliminando cuenta…"
                : "Eliminar cuenta definitivamente"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
