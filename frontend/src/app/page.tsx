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
      <span className="flex min-w-0 items-center gap-2 text-[#687267]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eef6dc] text-[#2c7334]">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 rounded-full bg-[#f0f3ea] px-2.5 py-1 text-xs font-semibold text-[#51604f]">{value}</span>
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
    default: "border-[#e5ebdd] bg-white/88 text-[#344038] hover:border-[#d4dfc8]",
    success: "border-[#d7e9c5] bg-[linear-gradient(135deg,#f4fbe6,#ffffff)] text-[#2f5b18] hover:border-[#c7dfaa]",
  } as const;

  const content = (
    <>
      <div>
        <p className="text-sm font-semibold text-[#1e2b22]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[#687267]">{description}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-semibold">
        {action}
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className={`flex h-full flex-col justify-between rounded-2xl border p-4 ${toneClasses[tone]}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-full flex-col justify-between rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses[tone]}`}
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
    return <div className="p-8 text-center text-[#687267]">Cargando tu panel...</div>;
  }

  if (isBusinessError) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#1e2b22]">No se pudo cargar tu panel</h1>
        <p className="text-sm leading-6 text-[#687267]">
          {errorMessage ?? "El backend devolvió un error al cargar la información del negocio."}
        </p>
        <p className="text-sm leading-6 text-[#687267]">
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
  const hasBusinessDetails = Boolean(business.businessDetails);
  const hasAgentSettings = Boolean(business.agentSettings);
  const completionItems = [hasAgentSettings, hasBusinessDetails, hasCalendar, contextFileCount > 0];
  const completionScore = completionItems.filter(Boolean).length;
  const heroToneClass = hasCalendar
    ? "bg-[linear-gradient(135deg,rgba(238,246,220,0.98),rgba(255,255,255,0.95))]"
    : "bg-[linear-gradient(135deg,rgba(244,248,235,0.98),rgba(255,255,255,0.95))]";

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article id="calendar-setup" className={`panel relative scroll-mt-32 overflow-hidden p-4 sm:p-6 ${heroToneClass}`}>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_top_right,rgba(214,255,114,0.22),transparent_62%)]" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-[#b8d96e]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8b9a7f]">Resumen</p>
                <h1 className="mt-1.5 text-2xl font-semibold leading-tight text-[#1e2b22] sm:mt-2 sm:text-3xl">
                  {hasCalendar ? "Tu asistente está operativo" : "Te faltan un par de pasos"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#54634b] sm:mt-3">
                  {hasCalendar
                    ? "Centraliza el estado del agente, la agenda y el conocimiento que utiliza para atender a tus clientes."
                    : "Termina la configuración para que el agente pueda responder con contexto real y gestionar reservas automáticamente."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-soft">{business.name}</span>
                <span className="inline-flex rounded-full border border-[#d9e2d1] bg-white/90 px-3 py-1 text-xs font-semibold text-[#51604f]">
                  {completionScore}/4 áreas configuradas
                </span>
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
              <article className="rounded-2xl border border-[#dce7d2] bg-[linear-gradient(180deg,#fcfef9,#ffffff)] p-3 shadow-sm sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[#687267] sm:text-sm">Llamadas</p>
                  <span className="hidden rounded-xl bg-[#eef6dc] p-2 text-[#5d7342] sm:inline-flex">
                    <PhoneCall className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#1e2b22] sm:mt-4 sm:text-3xl">{stats.totalCalls}</p>
                <p className="mt-2 hidden text-sm text-[#687267] sm:block">Conversaciones atendidas por tu IA.</p>
              </article>

              <article className="rounded-2xl border border-[#d4dfc8] bg-[linear-gradient(180deg,#f4f7ef,#ffffff)] p-3 shadow-sm sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[#687267] sm:text-sm">Minutos</p>
                  <span className="hidden rounded-xl bg-[#e8eee2] p-2 text-[#52604f] sm:inline-flex">
                    <Clock3 className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#1e2b22] sm:mt-4 sm:text-3xl">{stats.totalMinutes}</p>
                <p className="mt-2 hidden text-sm text-[#687267] sm:block">Tiempo total de conversación registrado.</p>
              </article>

              <article className="relative overflow-hidden rounded-2xl border border-[#cfe1ae] bg-[linear-gradient(180deg,#f6fadf,#ffffff)] p-3 shadow-sm sm:p-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(214,255,114,0.22),_transparent_55%)]" />
                <div className="relative flex items-center justify-between">
                  <p className="text-xs font-medium text-[#687267] sm:text-sm">Leads</p>
                  <span className="hidden rounded-xl bg-[#e8f7b9] p-2 text-[#405115] sm:inline-flex">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                </div>
                <p className="relative mt-2 text-2xl font-semibold tracking-tight text-[#1e2b22] sm:mt-4 sm:text-3xl">{stats.leads}</p>
                <p className="relative mt-2 hidden text-sm text-[#687267] sm:block">Potenciales clientes identificados.</p>
              </article>
            </div>
          </div>
        </article>

        <aside className="space-y-4">
          <article id="agent-status" className="panel scroll-mt-32 border-[#dce7d2] bg-[#f7f9f3] p-4 shadow-[0_8px_24px_rgba(30,43,34,0.06)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#8b9a7f]">Estado general</p>
                <h2 className="mt-1 text-lg font-semibold text-[#1e2b22]">{completionScore < 4 ? "Configuración en progreso" : "Todo en orden"}</h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 divide-y divide-[#e4e8df] rounded-xl border border-[#dce7d2] bg-white/90 px-4">
              <StatusRow label="Agente" value={agent?.active === false ? "Inactivo" : "Activo"} icon={<Bot className="h-4 w-4" />} />
              <StatusRow label={calendarProviderLabel === "Outlook" ? "Outlook Calendar" : "Google Calendar"} value={hasCalendar ? `Conectado · ${connectedCalendarDescription}` : "Pendiente"} icon={<CalendarDays className="h-4 w-4" />} />
              <StatusRow label="Documentos" value={`${contextFileCount} ${contextFileCount === 1 ? 'archivo' : 'archivos'}`} icon={<FileText className="h-4 w-4" />} />
              <StatusRow
                label="Número Twilio"
                value={
                  phoneQuery.data?.status === "active"
                    ? (phoneQuery.data.phoneNumber ?? "Asignado")
                    : phoneQuery.data?.status === "failed"
                      ? "Error"
                      : phoneQuery.data?.status === "purchased"
                        ? "Pendiente Vapi"
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#d2dacd] bg-white px-3 py-2 text-sm font-medium text-[#344038] transition hover:bg-[#f4f6f1] disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${provisionMutation.isPending ? "animate-spin" : ""}`} />
                {provisionMutation.isPending ? "Reintentando..." : "Reintentar asignación de número"}
              </button>
            )}

            {calendarStatus && (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${calendarStatus.type === 'success' ? 'border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]' : 'border-[#f5d3d3] bg-[#fff1f1] text-[#9f2a2a]'}`}>
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
          onClick={() => router.push("/ajustes")}
          className="group flex w-full items-center justify-between rounded-2xl border border-[#dce7d2] bg-[linear-gradient(180deg,#fcfef9,#ffffff)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#cfe1ae] hover:shadow-md sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef6dc] text-[#2c7334]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1e2b22]">Conecta tu calendario</p>
              <p className="text-sm text-[#687267]">Elige Google Calendar o Outlook para agendar citas automáticamente.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#52604f] transition group-hover:text-[#1e2b22]">
            Conectar
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      )}

      <section id="agent-configuration" className="panel scroll-mt-32 border-[#cfe1ae] bg-[linear-gradient(180deg,#f6fadf,#ffffff)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#1e2b22] sm:text-lg">
              <FileText className="h-5 w-5" />
              Documentos del agente
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#687267]">
              PDFs, tarifas y FAQs que el agente consulta durante las llamadas.
            </p>
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
        <div className="mt-4 min-h-20 rounded-2xl border border-[#e4e8df] bg-white p-3 text-sm text-[#687267]">
          {uploadStatus && (
            <div className={`mb-2 text-sm ${uploadStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {uploadStatus.message}
            </div>
          )}
          {business.agents?.[0]?.files && business.agents[0].files.length > 0 ? (
            <ul className="space-y-2">
              {business.agents[0].files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f9f3] px-3 py-2 text-sm">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#66705f]">Contexto</span>
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
    <Suspense fallback={<div className="p-8 text-center text-[#687267]">Cargando...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
