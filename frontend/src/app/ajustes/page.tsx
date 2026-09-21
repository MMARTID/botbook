"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  KeyRound,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  LogOut,
  MailCheck,
  MessageCircle,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { AppPageHeader } from "@/components/app-page-header";
import { useBusiness } from "@/components/providers";
import {
  changeAccountPassword,
  deleteAccount,
  getAccountOverview,
  updateMyBusiness,
} from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { clearAuthTokens } from "@/lib/billing-navigation";
import { E164_PHONE_REGEX, tipoDeLineaTrasCambiarTelefono } from "@/lib/phone";
import { WhatsappDueno } from "@/components/whatsapp-dueno";
import { webUrl } from "@/lib/web-url";

const PASSWORD_HAS_LETTER = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const PASSWORD_HAS_NUMBER = /\d/;

type Feedback = { type: "success" | "error"; message: string } | null;

export default function AccountSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const accountQuery = useQuery({
    queryKey: ["account-overview"],
    queryFn: getAccountOverview,
    enabled: hasToken === true,
  });

  const [businessProfile, setBusinessProfile] = useState({ name: "", phone: "" });
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forwardingCancelled, setForwardingCancelled] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  useEffect(() => {
    if (!business) return;
    setBusinessProfile({
      name: business.name,
      phone: business.phone.startsWith("TEMP-") ? "" : business.phone,
    });
  }, [business]);

  const phoneIsValid =
    businessProfile.phone.trim() === "" ||
    E164_PHONE_REGEX.test(businessProfile.phone.trim());
  const passwordIsValid =
    newPassword.length >= 8 &&
    PASSWORD_HAS_LETTER.test(newPassword) &&
    PASSWORD_HAS_NUMBER.test(newPassword) &&
    newPassword === confirmPassword &&
    (!accountQuery.data?.passwordConfigured || currentPassword.length > 0);

  const profileMutation = useMutation({
    mutationFn: () => {
      const phone = businessProfile.phone.trim();
      // Si la línea de clientes cambia de naturaleza (un fijo pasa a ser un
      // móvil o al revés), el tipo guardado en el alta dejaría a la tarjeta
      // de desvío enseñando los códigos equivocados: se corrige o se vuelve
      // a preguntar (PLAN-TELEFONIA-UX.md § 5, fase 1).
      const tipoDeLinea =
        phone && phone !== business?.phone
          ? tipoDeLineaTrasCambiarTelefono(business?.customerLineType ?? null, phone)
          : undefined;
      return updateMyBusiness({
        name: businessProfile.name.trim(),
        ...(phone ? { phone } : {}),
        ...(tipoDeLinea !== undefined ? { customerLineType: tipoDeLinea } : {}),
      });
    },
    onSuccess: (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      setProfileFeedback({ type: "success", message: "Datos del negocio actualizados." });
    },
    onError: (error) =>
      setProfileFeedback({
        type: "error",
        message: describeApiError(error, "No se pudieron guardar los datos del negocio."),
      }),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      changeAccountPassword({
        ...(accountQuery.data?.passwordConfigured ? { currentPassword } : {}),
        newPassword,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["account-overview"], (current: typeof accountQuery.data) =>
        current ? { ...current, ...result } : current,
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({
        type: "success",
        message: "Contraseña actualizada. Te hemos enviado una confirmación por correo.",
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
        ...(accountQuery.data?.passwordConfigured
          ? { currentPassword: deletePassword }
          : {}),
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
          "No se pudo eliminar la cuenta. No se ha borrado nada; inténtalo de nuevo.",
        ),
      }),
  });

  if (isLoadingBusiness || accountQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando ajustes…
      </div>
    );
  }

  if (hasToken === false) return null;

  const account = accountQuery.data;

  // Sin `accountQuery.isError` a propósito: React Query conserva los datos en
  // caché cuando un refresco falla (marca error sin soltar `data`), y esta
  // pantalla solo debe aparecer si no hay nada que pintar. Si de verdad no
  // llegó la cuenta, `!account` ya cubre ese caso.
  if (!business || !account) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">
          No se pudieron cargar los ajustes
        </h1>
        <p className="text-sm leading-6 text-muted">
          Comprueba tu conexión y vuelve a intentarlo.
        </p>
        <button type="button" onClick={() => window.location.reload()} className="btn-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  const passwordConfigured = account.passwordConfigured;
  const canDelete =
    forwardingCancelled &&
    deleteConfirmation === "ELIMINAR" &&
    (!passwordConfigured || deletePassword.length > 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <AppPageHeader
        icon={Settings}
        title="Ajustes"
        description="Gestiona tu cuenta, la seguridad y los datos de contacto del negocio."
      />

      <section className="panel overflow-hidden" aria-labelledby="account-title">
        <div className="flex items-start gap-3 border-b border-[#e5e5e5] p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="account-title" className="text-lg font-semibold text-[#0a0a0a]">Cuenta</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Tu identidad de acceso a Alhabla.</p>
          </div>
        </div>
        <div className="divide-y divide-[#e5e5e5]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-sm font-semibold text-[#27272a]">Correo electrónico</p>
              <p className="mt-1 text-sm text-muted">{account.email}</p>
            </div>
            {account.googleConnected ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecf7ec] px-3 py-1.5 text-xs font-semibold text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Verificado por Google
              </span>
            ) : (
              <span className="inline-flex w-fit rounded-full bg-[#fef8e7] px-3 py-1.5 text-xs font-semibold text-[#9f7a15] ring-1 ring-inset ring-[#f0dfa8]">
                Verificación pendiente
              </span>
            )}
          </div>
          {/* La acción real queda trazada en GitHub #23. Hasta entonces no se
              simula una verificación que el servidor aún no puede probar. */}
          {!account.googleConnected ? (
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-[#27272a]">Verificación del correo</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Próximamente podrás verificar esta dirección para reforzar la recuperación de la cuenta.
                </p>
              </div>
              <button type="button" disabled className="btn-secondary h-11 shrink-0 px-4" title="Disponible próximamente">
                Verificar correo
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel p-4 sm:p-6" aria-labelledby="business-title">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="business-title" className="text-lg font-semibold text-[#0a0a0a]">Datos del negocio</h2>
            <p className="mt-1 text-sm leading-6 text-muted">El nombre que ves en el panel y el teléfono del local.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-semibold text-[#27272a]">
            Nombre del negocio
            <input
              value={businessProfile.name}
              onChange={(event) => setBusinessProfile((current) => ({ ...current, name: event.target.value }))}
              autoComplete="organization"
              maxLength={80}
              aria-describedby="settings-business-name-hint"
              className="field mt-2 w-full"
            />
            <span id="settings-business-name-hint" className="mt-1 block text-xs font-normal leading-5 text-muted">
              Así se presenta el agente al contestar llamadas. Por defecto es el nombre que trajimos de Google al configurar tu negocio.
            </span>
          </label>
          <label className="text-sm font-semibold text-[#27272a]">
            Teléfono del negocio
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={businessProfile.phone}
              onChange={(event) => setBusinessProfile((current) => ({ ...current, phone: event.target.value }))}
              aria-describedby="settings-phone-hint"
              aria-invalid={!phoneIsValid}
              className="field mt-2 w-full"
              placeholder="+34600123456"
            />
            <span id="settings-phone-hint" className={`mt-1 block text-xs font-normal leading-5 ${phoneIsValid ? "text-muted" : "text-[#c53030]"}`}>
              {phoneIsValid
                ? "El número al que llaman tus clientes. Lo dice la recepcionista cuando alguien tiene que llamar al local. Los avisos para ti llegan al WhatsApp de abajo."
                : "Añade el prefijo del país y escribe solo números, por ejemplo +34930453218."}
            </span>
          </label>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#e5e5e5] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <FeedbackMessage value={profileFeedback} />
          <button
            type="button"
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending || !businessProfile.name.trim() || !phoneIsValid}
            className="btn-primary shrink-0"
          >
            {profileMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {profileMutation.isPending ? "Guardando…" : "Guardar datos"}
          </button>
        </div>
      </section>

      <section
        id="whatsapp"
        className="panel scroll-mt-24 p-4 sm:p-6"
        aria-labelledby="whatsapp-title"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="whatsapp-title" className="text-lg font-semibold text-[#0a0a0a]">WhatsApp</h2>
            <p className="mt-1 text-sm leading-6 text-muted">El móvil donde la recepcionista te avisa de reservas y recados.</p>
          </div>
        </div>
        <WhatsappDueno business={business} hasToken={hasToken} />
      </section>

      <section className="panel p-4 sm:p-6" aria-labelledby="security-title">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="security-title" className="text-lg font-semibold text-[#0a0a0a]">Seguridad</h2>
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
              aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
              className="field mt-2 w-full"
            />
          </label>
          <div className="flex flex-col gap-3 lg:col-span-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p id="password-requirements" className="text-xs leading-5 text-muted">
                Mínimo 8 caracteres, con al menos una letra y un número.
              </p>
              <FeedbackMessage value={passwordFeedback} />
            </div>
            <button type="submit" disabled={!passwordIsValid || passwordMutation.isPending} className="btn-primary shrink-0">
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

      <section className="panel overflow-hidden" aria-labelledby="access-title">
        <div className="flex items-start gap-3 border-b border-[#e5e5e5] p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="access-title" className="text-lg font-semibold text-[#0a0a0a]">Acceso y ayuda</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Atajos para gestionar la sesión, el plan y tus derechos.</p>
          </div>
        </div>
        <div className="divide-y divide-[#e5e5e5]">
          <SettingsLink href="/ajustes/facturacion" icon={CreditCard} title="Plan y facturación" description="Consulta el consumo, las facturas y tu suscripción." />
          <SettingsLink href={webUrl("/legal/privacidad")} icon={LifeBuoy} title="Privacidad y datos" description="Revisa cómo tratamos los datos y tus derechos." />
          <button
            type="button"
            onClick={() => {
              clearAuthTokens();
              window.location.href = "/login";
            }}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] sm:px-6"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#27272a]">Cerrar sesión en este dispositivo</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">Volverás a la pantalla de acceso.</span>
            </span>
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#f5d3d3] bg-white" aria-labelledby="danger-title">
        <div className="flex items-start gap-3 border-b border-[#f5d3d3] bg-[#fff1f1] p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#c53030]">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="danger-title" className="text-lg font-semibold text-[#0a0a0a]">Eliminar la cuenta</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#c53030]">
              Esta acción cancela la suscripción, retira el número de Alhabla y elimina los datos del negocio. No se puede deshacer.
            </p>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-xl border border-[#f0dfa8] bg-[#fef8e7] p-4 text-sm leading-6 text-[#9f7a15]">
            <strong>Antes de continuar:</strong> desactiva en tu operador el desvío de llamadas hacia Alhabla. Si no lo haces, tus clientes podrían seguir llamando a un número que ya no atiende.
          </div>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
            <input
              type="checkbox"
              checked={forwardingCancelled}
              onChange={(event) => setForwardingCancelled(event.target.checked)}
              className="mt-1 accent-[#c53030]"
            />
            <span>Confirmo que ya he quitado el desvío de llamadas de mi línea habitual.</span>
          </label>
          <div className={`grid gap-4 ${passwordConfigured ? "lg:grid-cols-2" : ""}`}>
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
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleteMutation.isPending ? "Eliminando cuenta…" : "Eliminar cuenta definitivamente"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeedbackMessage({ value }: { value: Feedback }) {
  if (!value) return <span />;
  return (
    <p
      aria-live="polite"
      className={`text-sm leading-6 ${value.type === "success" ? "text-[#2c7334]" : "text-[#c53030]"}`}
    >
      {value.message}
    </p>
  );
}

function SettingsLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof CreditCard;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] sm:px-6"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-[#27272a]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </Link>
  );
}
