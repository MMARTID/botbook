"use client";

import { useCallback, useState, useEffect, Suspense } from "react";
import { Bot, PhoneCall, Clock3, TrendingUp, CalendarDays, Upload, FileText, ArrowUpRight, ArrowRight, Sparkles, Smartphone, RefreshCw } from "lucide-react";
import { getStats, getPhoneNumberInfo, provisionPhoneNumber } from "@/lib/api";
import { useBusiness } from "@/components/providers";
import { useRouter, useSearchParams } from "next/navigation";
import { AGENT_FILE_ACCEPT, useAgentFileUpload } from "@/hooks/use-agent-file-upload";
import { UpcomingCalendarEvents } from "@/components/upcoming-calendar-events";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function StatusRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-muted">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f3eeff] text-[#8b5cf6]">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 rounded-full bg-[#fafafa] px-2.5 py-1 text-xs font-semibold text-[#52525b]">{value}</span>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  action,
  onClick,
  disabled,
  tone = "default",
}: {
  title: string;
  description: string;
  action: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "success";
}) {
  const toneClasses = {
    default: "border-[#e5e5e5] bg-white/88 text-[#27272a] hover:border-[#ddd6fe]",
    success: "border-[#ddd6fe] bg-[#f3eeff] text-[#6d28d9] hover:border-[#8b5cf6]",
  } as const;

  const content = (
    <>
      <div>
        <p className="text-sm font-semibold text-[#0a0a0a]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-semibold">
        {action}
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className={`flex h-full flex-col justify-between rounded-xl border p-4 ${toneClasses[tone]}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-full flex-col justify-between rounded-xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses[tone]}`}
    >
      {content}
    </button>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business, isLoadingBusiness, hasToken, isError: isBusinessError, errorMessage } = useBusiness();

  const [calendarStatus, setCalendarStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [calendarReconnectRequired, setCalendarReconnectRequired] = useState(false);
  const handleReconnectRequired = useCallback((provider: "google" | "outlook" = "google") => {
    setCalendarReconnectRequired(true);
    setCalendarStatus({
      type: 'error',
      message: `La conexión con ${provider === "outlook" ? "Outlook Calendar" : "Google Calendar"} ha caducado. Vuelve a conectarla para continuar.`,
    });
  }, []);

  const {
    inputRef: fileInputRef,
    isUploading,
    status: uploadStatus,
    openFilePicker,
    handleFileChange: handleFileUpload,
  } = useAgentFileUpload(business?.agents?.[0]?.id);

  useEffect(() => {
    if (hasToken === false) {
      router.replace("/landing");
      return;
    }

    if (searchParams.get("calendar_error")) {
      setCalendarStatus({ type: 'error', message: 'Hubo un error al conectar Google Calendar.' });
      router.replace("/");
    }

    if (searchParams.get("outlook_error")) {
      setCalendarStatus({ type: 'error', message: 'Hubo un error al conectar Outlook Calendar.' });
      router.replace("/");
    }

    if (searchParams.get("outlook_success")) {
      setCalendarReconnectRequired(false);
      setCalendarStatus({ type: 'success', message: 'Outlook Calendar está conectado correctamente.' });
      router.replace("/");
    }
  }, [hasToken, router, searchParams]);

  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    enabled: !!business,
  });

  const phoneQuery = useQuery({
    queryKey: ["phone-number"],
    queryFn: getPhoneNumberInfo,
    enabled: !!business,
  });

  const provisionMutation = useMutation({
    mutationFn: provisionPhoneNumber,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phone-number"] });
    },
  });

  if (isLoadingBusiness) {
    return <div className="p-8 text-center text-muted">Cargando tu panel...</div>;
  }

  if (isBusinessError) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">No se pudo cargar tu panel</h1>
        <p className="text-sm leading-6 text-muted">
          {errorMessage ?? "El backend devolvió un error al cargar la información del negocio."}
        </p>
        <p className="text-sm leading-6 text-muted">
          Revisa que el backend esté levantado y que Prisma esté actualizado dentro del contenedor de desarrollo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary mx-auto"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!business) {
    return null; // Will redirect to login via useEffect
  }

  const stats = statsQuery.data || { totalCalls: 0, totalMinutes: 0, leads: 0 };

  const activeCalendarProvider = business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendar = (activeCalendarProvider === "outlook"
    ? business.outlookCalendarConnected === true
    : business.googleCalendarConnected === true) && !calendarReconnectRequired;
  const calendarProviderLabel = activeCalendarProvider === "outlook" ? "Outlook" : "Google Calendar";
  const connectedCalendarDescription = activeCalendarProvider === "outlook"
    ? business.outlookUserEmail ?? "Outlook Calendar"
    : "Google Calendar";
  const agent = business.agents?.[0];
  const contextFileCount = agent?.files?.length ?? 0;

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article id="calendar-setup" className="panel relative scroll-mt-32 overflow-hidden p-4 sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.14),transparent_62%)]" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-[#8b5cf6]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[#0a0a0a] sm:text-3xl">
                  {hasCalendar ? "Tu asistente está operativo" : "Conecta tu calendario para activar las reservas"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52525b] sm:mt-3">
                  {hasCalendar
                    ? "Centraliza el estado del agente, la agenda y el conocimiento que utiliza para atender a tus clientes."
                    : "El agente ya puede responder llamadas. Conecta tu agenda para que también pueda reservar citas automáticamente."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-soft">{business.name}</span>
              </div>
            </div>

            {!contextFileCount ? (
              <QuickActionCard
                title="Añade documentos"
                description="Sube PDFs, tarifas o FAQs para que el agente responda con contexto real."
                action={isUploading ? "Subiendo..." : "Subir archivo"}
                onClick={openFilePicker}
                disabled={isUploading || !agent}
                tone="success"
              />
            ) : null}

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <article className="rounded-xl border border-[#e5e5e5] bg-white p-3 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted sm:text-sm">Llamadas</p>
                  <span className="hidden rounded-xl bg-[#f3eeff] p-2 text-[#8b5cf6] sm:inline-flex">
                    <PhoneCall className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0a0a0a] sm:mt-4 sm:text-3xl">{stats.totalCalls}</p>
                <p className="mt-2 hidden text-sm text-muted sm:block">Conversaciones atendidas por tu recepcionista virtual.</p>
              </article>

              <article className="rounded-xl border border-[#e5e5e5] bg-white p-3 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted sm:text-sm">Minutos</p>
                  <span className="hidden rounded-xl bg-[#f3eeff] p-2 text-[#8b5cf6] sm:inline-flex">
                    <Clock3 className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0a0a0a] sm:mt-4 sm:text-3xl">{stats.totalMinutes}</p>
                <p className="mt-2 hidden text-sm text-muted sm:block">Tiempo total de conversación registrado.</p>
              </article>

              <article className="rounded-xl border border-[#e5e5e5] bg-white p-3 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted sm:text-sm">Posibles clientes</p>
                  <span className="hidden rounded-xl bg-[#f3eeff] p-2 text-[#8b5cf6] sm:inline-flex">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0a0a0a] sm:mt-4 sm:text-3xl">{stats.leads}</p>
                <p className="mt-2 hidden text-sm text-muted sm:block">Identificados durante las llamadas.</p>
              </article>
            </div>
          </div>
        </article>

        <aside className="space-y-4">
          <article id="agent-status" className="panel scroll-mt-32 border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#52525b]">Estado general</p>
                <h2 className="mt-1 text-lg font-semibold text-[#0a0a0a]">Resumen operativo</h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 divide-y divide-[#e5e5e5] rounded-xl border border-[#e5e5e5] bg-white/90 px-4">
              <StatusRow label="Agente" value={agent?.active === false ? "Inactivo" : "Activo"} icon={<Bot className="h-4 w-4" />} />
              <StatusRow label={calendarProviderLabel === "Outlook" ? "Outlook Calendar" : "Google Calendar"} value={hasCalendar ? `Conectado · ${connectedCalendarDescription}` : "Pendiente"} icon={<CalendarDays className="h-4 w-4" />} />
              <StatusRow label="Documentos" value={`${contextFileCount} ${contextFileCount === 1 ? 'archivo' : 'archivos'}`} icon={<FileText className="h-4 w-4" />} />
              <StatusRow
                label="Número de teléfono"
                value={
                  phoneQuery.data?.status === "active"
                    ? (phoneQuery.data.phoneNumber ?? "Asignado")
                    : phoneQuery.data?.status === "failed"
                      ? "Error"
                      : phoneQuery.data?.status === "purchased"
                        ? "Pendiente de vincular"
                        : "Pendiente"
                }
                icon={<Smartphone className="h-4 w-4" />}
              />
            </div>

            {phoneQuery.data?.status === "failed" && (
              <button
                type="button"
                onClick={() => provisionMutation.mutate()}
                disabled={provisionMutation.isPending}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm font-medium text-[#27272a] transition hover:bg-[#fafafa] disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${provisionMutation.isPending ? "animate-spin" : ""}`} />
                {provisionMutation.isPending ? "Reintentando..." : "Reintentar asignación de número"}
              </button>
            )}

            {calendarStatus && (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${calendarStatus.type === 'success' ? 'border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]' : 'border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]'}`}>
                {calendarStatus.message}
              </div>
            )}
          </article>
        </aside>
      </section>

      {hasCalendar ? (
        <UpcomingCalendarEvents
          businessId={business.id}
          timeZone={business.timezone || "Europe/Madrid"}
          onReconnectRequired={(provider) => handleReconnectRequired(provider)}
        />
      ) : (
        <button
          type="button"
          onClick={() => router.push("/ajustes?section=calendar-section")}
          className="group flex w-full items-center justify-between rounded-xl border border-[#e5e5e5] bg-white p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#ddd6fe] sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0a0a0a]">Conecta tu calendario</p>
              <p className="text-sm text-muted">Elige Google Calendar o Outlook para agendar citas automáticamente.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#52525b] transition group-hover:text-[#0a0a0a]">
            Conectar
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      )}

      <section id="agent-configuration" className="panel scroll-mt-32 border-[#ddd6fe] bg-[#f3eeff] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
                Documentos del agente
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                PDFs, tarifas y FAQs que el agente consulta durante las llamadas.
              </p>
            </div>
          </div>
          {contextFileCount > 0 ? (
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading || !agent}
              className="btn-secondary h-10 shrink-0 px-4"
            >
              {isUploading ? 'Subiendo...' : <><Upload className="h-4 w-4" />Añadir otro</>}
            </button>
          ) : null}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept={AGENT_FILE_ACCEPT}
        />
        <div className="mt-4 min-h-20 rounded-xl border border-[#e5e5e5] bg-white p-3 text-sm text-muted">
          {uploadStatus && (
            <div className={`mb-2 text-sm ${uploadStatus.type === 'success' ? 'text-[#2c7334]' : 'text-[#c53030]'}`}>
              {uploadStatus.message}
            </div>
          )}
          {business.agents?.[0]?.files && business.agents[0].files.length > 0 ? (
            <ul className="space-y-2">
              {business.agents[0].files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#fafafa] px-3 py-2 text-sm">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#52525b]">Contexto</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="italic">Aún no hay documentos. El acceso rápido de arriba te permite subir el primero.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Cargando...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
