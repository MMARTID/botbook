"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import {
  completeOnboarding,
  createBookingProfessional,
  createBookingService,
  dismissOnboarding,
  getBookingSettings,
  getCalendarList,
  getGoogleCalendarAuthUrl,
  getMicrosoftCalendarAuthUrl,
  getOnboardingState,
  selectCalendar,
  updateBookingCapacity,
  updateBookingProfessional,
  updateBookingService,
  updateMyBusiness,
} from "@/lib/api";
import { useBusiness } from "@/components/providers";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import {
  AgentSettingsEditor,
  DEFAULT_AGENT_SETTINGS,
} from "@/components/agent-settings-editor";
import { SettingsSection } from "@/components/settings-section";
import { LottieAnimation } from "@/components/lottie-animation";
import type {
  AgentSettings,
  BookingProfessional,
  BookingService,
  BookingSettings,
  BusinessSchedule,
} from "@/lib/types";
import {
  ArrowUp,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  MapPin,
  Save,
  ScissorsLineDashed,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8e3cf] bg-[#fbfcf8] px-4 py-6 text-sm text-muted">
      <p className="font-semibold text-[#344038]">{title}</p>
      <p className="mt-1 leading-6">{description}</p>
    </div>
  );
}

type SetupPhase = "schedule_confirmation" | "services_professionals" | null;

function isValidPlaceSchedule(value: unknown): value is BusinessSchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BusinessSchedule>;
  return candidate.version === 1 && Boolean(candidate.week);
}

function SetupGuide({
  from,
  phase,
  hasSchedule,
  hasServices,
  hasProfessionals,
  hasCalendar,
  onDismiss,
}: {
  from: "registration" | "checkout" | null;
  phase: SetupPhase;
  hasSchedule: boolean;
  hasServices: boolean;
  hasProfessionals: boolean;
  hasCalendar: boolean;
  onDismiss: () => void;
}) {
  const steps = [
    { id: "schedule", label: "Horario", done: hasSchedule },
    { id: "services", label: "Servicios", done: hasServices },
    { id: "professionals", label: "Profesionales", done: hasProfessionals },
    { id: "calendar", label: "Calendario", done: hasCalendar },
  ];

  const activeIndex = steps.findIndex((step) => !step.done);
  const progress = Math.round(
    (steps.filter((step) => step.done).length / steps.length) * 100
  );

  let title = "Configuración guiada";
  let message =
    "Completa los apartados en orden para que el agente pueda atender llamadas con datos reales.";

  if (from === "registration") {
    title = "Bienvenido a BotBook";
    message = "Vamos a configurar tu negocio en unos pasos rápidos.";
  } else if (from === "checkout") {
    title = "Tu suscripción está activa";
    message =
      "Perfecto. Ahora termina la configuración operativa para empezar a recibir llamadas.";
  }

  if (phase === "schedule_confirmation") {
    message =
      "Hemos importado tu horario desde Google Places. Revísalo y confirma que es correcto.";
  } else if (phase === "services_professionals") {
    message =
      "Ahora añade al menos un servicio y un profesional para que el agente pueda agendar citas.";
  }

  return (
    <section className="sticky top-4 z-40 overflow-hidden rounded-2xl border border-[#cfe1ae] bg-[#f6fadf] shadow-[0_12px_32px_rgba(30,43,34,0.08)] animate-in slide-in-from-top-4 duration-500">
      <div className="px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1e2b22]">{title}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#54634b]">
                {message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#54634b] transition hover:bg-[#eef6dc]"
            aria-label="Cerrar guía"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#54634b]">
            <span>Progreso de configuración</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e4ecd5]">
            <div
              className="h-full rounded-full bg-[#2c7334] transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((step, index) => {
            const isActive = index === activeIndex && !step.done;
            return (
              <div
                key={step.id}
                className={`rounded-xl border px-2 py-2 text-center text-xs font-semibold transition ${
                  step.done
                    ? "border-[#d7e9c5] bg-[#ecf7ec] text-[#2c7334]"
                    : isActive
                      ? "border-[#b9d489] bg-white text-[#405115] ring-2 ring-[#b8d96e]"
                      : "border-[#dce7d2] bg-white/60 text-muted"
                }`}
              >
                <div className="mb-1 flex justify-center">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>
                {step.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScheduleConfirmationBanner({
  onConfirm,
  onEdit,
}: {
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#b8d96e] bg-[linear-gradient(135deg,#f6fadf,#ffffff)] p-5 shadow-[0_12px_32px_rgba(30,43,34,0.08)] ring-1 ring-[#b8d96e]/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#1e2b22]">
              Horario importado desde Google Places
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#54634b]">
              Confirma que se han implementado correctamente los días y tramos
              horarios de tu negocio.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onEdit}
            className="btn-secondary px-4 py-2 text-sm"
          >
            Revisar horario
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary px-4 py-2 text-sm"
          >
            El horario es correcto
          </button>
        </div>
      </div>
    </section>
  );
}

function ServicesProfessionalsGuide({
  hasServices,
  hasProfessionals,
  onGoToServices,
  onGoToProfessionals,
  onFinish,
}: {
  hasServices: boolean;
  hasProfessionals: boolean;
  onGoToServices: () => void;
  onGoToProfessionals: () => void;
  onFinish: () => void;
}) {
  if (hasServices && hasProfessionals) {
    return (
      <section className="rounded-2xl border border-[#d7e9c5] bg-[#ecf7ec] p-4 text-[#2c7334]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-5 w-5" />
          <span>Ya tienes servicios y profesionales configurados.</span>
        </div>
        <p className="mt-1 text-sm text-[#405115]">
          Conecta tu calendario en el apartado de Calendario para empezar a
          recibir reservas automáticas.
        </p>
        <button
          type="button"
          onClick={onFinish}
          className="btn-primary mt-3 px-4 py-2 text-sm"
        >
          Ir a Calendario
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#cfe1ae] bg-[#f6fadf] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
            <ArrowUp className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-[#405115]">
              Siguiente paso: servicios y profesionales
            </p>
            <p className="text-sm text-muted">
              Crea al menos un servicio y asigna un profesional para que el
              agente pueda ofrecer citas por teléfono.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!hasServices ? (
            <button
              type="button"
              onClick={onGoToServices}
              className="btn-primary px-4 py-2 text-sm"
            >
              Añadir servicio
            </button>
          ) : null}
          {hasServices && !hasProfessionals ? (
            <button
              type="button"
              onClick={onGoToProfessionals}
              className="btn-primary px-4 py-2 text-sm"
            >
              Añadir profesional
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AjustesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSource = searchParams.get("from") as
    "registration" | "checkout" | null;
  const hasPlaceScheduleParam = searchParams.get("hasPlaceSchedule") === "true";
  const queryClient = useQueryClient();
  const {
    business,
    isLoadingBusiness,
    hasToken,
    isError: isBusinessError,
    errorMessage,
  } = useBusiness();
  const [capacity, setCapacity] = useState("1");
  const [serviceDraft, setServiceDraft] = useState({
    name: "",
    durationMinutes: "30",
  });
  const [professionalDraft, setProfessionalDraft] = useState({
    name: "",
    serviceIds: [] as string[],
  });
  const [businessProfile, setBusinessProfile] = useState({
    name: "",
    businessDetails: "",
  });
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS
  );
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [setupPhase, setSetupPhase] = useState<SetupPhase>(
    fromSource === "registration" && hasPlaceScheduleParam
      ? "schedule_confirmation"
      : null
  );
  const [calendarAuthLoading, setCalendarAuthLoading] = useState<
    "google" | "outlook" | null
  >(null);
  const [calendarStatus, setCalendarStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [calendarReconnectRequired, setCalendarReconnectRequired] =
    useState(false);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<
    string,
    boolean
  > | null>(null);

  const toggleSection = (id: string) => {
    setOpenSections((current) => ({
      ...(current ?? {}),
      [id]: !(current?.[id] ?? false),
    }));
  };
  const isSectionOpen = (id: string) => openSections?.[id] ?? false;
  const openAndScroll = (id: string) => {
    setOpenSections((current) => ({ ...(current ?? {}), [id]: true }));
    window.setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  useEffect(() => {
    if (hasToken === false) {
      router.replace("/login");
    }
  }, [hasToken, router]);

  useEffect(() => {
    if (searchParams.get("calendar_error")) {
      setCalendarStatus({
        type: "error",
        message: "Hubo un error al conectar Google Calendar.",
      });
    }
    if (searchParams.get("outlook_error")) {
      setCalendarStatus({
        type: "error",
        message: "Hubo un error al conectar Outlook Calendar.",
      });
    }
    if (searchParams.get("outlook_success")) {
      setCalendarReconnectRequired(false);
      setCalendarStatus({
        type: "success",
        message: "Outlook Calendar está conectado correctamente.",
      });
    }
  }, [searchParams]);

  const settingsQuery = useQuery({
    queryKey: ["booking-settings"],
    queryFn: getBookingSettings,
    enabled: hasToken === true,
  });

  const onboardingQuery = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: getOnboardingState,
    enabled: hasToken === true,
  });

  const dismissMutation = useMutation({
    mutationFn: dismissOnboarding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    },
  });

  const completingRef = useRef(false);
  useEffect(() => {
    if (completingRef.current) return;
    if (
      onboardingQuery.data?.isActive &&
      onboardingQuery.data.progress === 100
    ) {
      completingRef.current = true;
      completeMutation.mutate();
    }
  }, [onboardingQuery.data, completeMutation]);

  useEffect(() => {
    if (settingsQuery.data) {
      setCapacity(String(settingsQuery.data.bookingCapacity));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!business) return;
    setBusinessProfile({
      name: business.name,
      businessDetails: business.businessDetails ?? "",
    });
    setAgentSettings(business.agentSettings ?? DEFAULT_AGENT_SETTINGS);
  }, [business]);

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["my-business"] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
    ]);
  };

  const appendBookingService = (service: BookingService) => {
    queryClient.setQueryData<BookingSettings | undefined>(
      ["booking-settings"],
      (current) => {
        if (!current) return current;
        return {
          ...current,
          services: [...current.services, service].sort((left, right) =>
            left.name.localeCompare(right.name)
          ),
        };
      }
    );
  };

  const appendBookingProfessional = (professional: BookingProfessional) => {
    queryClient.setQueryData<BookingSettings | undefined>(
      ["booking-settings"],
      (current) => {
        if (!current) return current;
        return {
          ...current,
          professionals: [
            ...current.professionals.filter(
              (currentProfessional) =>
                currentProfessional.id !== professional.id
            ),
            professional,
          ].sort((left, right) => left.name.localeCompare(right.name)),
        };
      }
    );
  };

  const capacityMutation = useMutation({
    mutationFn: updateBookingCapacity,
    onSuccess: async () => {
      await invalidateAll();
      setBanner({ type: "success", message: "Capacidad actualizada." });
    },
    onError: () =>
      setBanner({
        type: "error",
        message: "No se pudo actualizar la capacidad.",
      }),
  });

  const scheduleMutation = useMutation({
    mutationFn: (schedule: BusinessSchedule) => updateMyBusiness({ schedule }),
    onSuccess: async (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      await invalidateAll();
      setBanner({
        type: "success",
        message: "Horario guardado y sincronizado con el agente.",
      });
      if (setupPhase === "schedule_confirmation") {
        setSetupPhase("services_professionals");
        window.setTimeout(() => {
          openAndScroll("services");
        }, 200);
      }
    },
    onError: () =>
      setBanner({
        type: "error",
        message:
          "Revisa que los tramos no se solapen y que la apertura sea anterior al cierre.",
      }),
  });

  const profileMutation = useMutation({
    mutationFn: () => updateMyBusiness(businessProfile),
    onSuccess: (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      setBanner({
        type: "success",
        message: "Información del negocio actualizada.",
      });
    },
    onError: () =>
      setBanner({
        type: "error",
        message: "No se pudo guardar la información del negocio.",
      }),
  });

  const agentSettingsMutation = useMutation({
    mutationFn: () => updateMyBusiness({ agentSettings }),
    onSuccess: (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      setBanner({
        type: "success",
        message: "Comportamiento del agente actualizado.",
      });
    },
    onError: () =>
      setBanner({
        type: "error",
        message: "No se pudo guardar el comportamiento del agente.",
      }),
  });

  const createServiceMutation = useMutation({
    mutationFn: createBookingService,
    onSuccess: async (service) => {
      appendBookingService(service);
      await invalidateAll();
      setServiceDraft({ name: "", durationMinutes: "30" });
      setBanner({ type: "success", message: "Servicio creado." });
      if (setupPhase === "services_professionals") {
        window.setTimeout(() => {
          openAndScroll("professionals");
        }, 200);
      }
    },
    onError: () =>
      setBanner({ type: "error", message: "No se pudo crear el servicio." }),
  });

  const createProfessionalMutation = useMutation({
    mutationFn: createBookingProfessional,
    onSuccess: (professional) => {
      appendBookingProfessional(professional);
      setProfessionalDraft({ name: "", serviceIds: [] });
      setBanner({ type: "success", message: "Profesional creado." });
      void invalidateAll();
      if (setupPhase === "services_professionals") {
        window.setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 200);
      }
    },
    onError: () =>
      setBanner({ type: "error", message: "No se pudo crear el profesional." }),
  });

  const services = settingsQuery.data?.services ?? [];
  const professionals = settingsQuery.data?.professionals ?? [];

  useEffect(() => {
    if (setupPhase !== "services_professionals") return;
    window.setTimeout(() => {
      const targetId = services.length === 0 ? "services" : "professionals";
      openAndScroll(targetId);
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupPhase, professionals.length, services.length]);

  const confirmPlaceSchedule = () => {
    setSetupPhase("services_professionals");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startCalendarConnection = async (provider: "google" | "outlook") => {
    setCalendarAuthLoading(provider);
    setCalendarStatus(null);
    try {
      const url =
        provider === "google"
          ? await getGoogleCalendarAuthUrl()
          : await getMicrosoftCalendarAuthUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error(error);
      setCalendarStatus({
        type: "error",
        message: "No se pudo obtener la URL de conexión.",
      });
      setCalendarAuthLoading(null);
    }
  };

  const handleCalendarReconnectRequired = (
    provider: "google" | "outlook" = "google"
  ) => {
    setCalendarReconnectRequired(true);
    setCalendarStatus({
      type: "error",
      message: `La conexión con ${provider === "outlook" ? "Outlook Calendar" : "Google Calendar"} ha caducado. Vuelve a conectarla para continuar.`,
    });
  };

  const calendarsQuery = useQuery({
    queryKey: ["calendar-list"],
    queryFn: getCalendarList,
    enabled: calendarPickerOpen && hasToken === true,
    retry: false,
  });

  const selectCalendarMutation = useMutation({
    mutationFn: selectCalendar,
    onSuccess: async (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendar-list"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
      ]);
      setCalendarPickerOpen(false);
      setBanner({ type: "success", message: "Calendario actualizado." });
    },
    onError: () =>
      setBanner({
        type: "error",
        message: "No se pudo cambiar de calendario.",
      }),
  });

  useEffect(() => {
    const error = calendarsQuery.error;
    if (!error || !axios.isAxiosError(error)) return;
    const code = error.response?.data?.code;
    if (
      code === "GOOGLE_CALENDAR_RECONNECT_REQUIRED" ||
      code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"
    ) {
      handleCalendarReconnectRequired(
        code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED" ? "outlook" : "google"
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarsQuery.error]);

  const sectionsInitRef = useRef(false);
  useEffect(() => {
    if (sectionsInitRef.current || !business || !settingsQuery.data) return;
    sectionsInitRef.current = true;

    const requestedSection = searchParams.get("section");
    const calendarConnected =
      business.calendarProvider === "outlook"
        ? business.outlookCalendarConnected === true
        : business.googleCalendarConnected === true;
    const pendingSection = !isValidPlaceSchedule(business.schedule)
      ? "business-hours"
      : settingsQuery.data.services.length === 0
        ? "services"
        : settingsQuery.data.professionals.length === 0
          ? "professionals"
          : !calendarConnected
            ? "calendar-section"
            : null;

    const initial: Record<string, boolean> = {};
    if (requestedSection) initial[requestedSection] = true;
    else if (pendingSection) initial[pendingSection] = true;
    setOpenSections(initial);

    if (requestedSection) {
      window.setTimeout(() => {
        document
          .getElementById(requestedSection)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business, settingsQuery.data, searchParams]);

  if (isLoadingBusiness || settingsQuery.isLoading) {
    return <div className="p-8 text-center text-muted">Cargando ajustes…</div>;
  }

  if (settingsQuery.isError) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#1e2b22]">
          No se pudo cargar la configuración operativa
        </h1>
        <p className="text-sm leading-6 text-muted">
          {settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : "La ruta `/booking-settings` devolvió un error."}
        </p>
        <button
          type="button"
          onClick={() => settingsQuery.refetch()}
          className="btn-primary mx-auto"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (isBusinessError) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#1e2b22]">
          No se pudieron cargar los ajustes
        </h1>
        <p className="text-sm leading-6 text-muted">
          {errorMessage ??
            "El backend devolvió un error al cargar la configuración del negocio."}
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
    return null;
  }

  const hasSchedule = isValidPlaceSchedule(business.schedule);
  const activeCalendarProvider =
    business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendar =
    (activeCalendarProvider === "outlook"
      ? business.outlookCalendarConnected === true
      : business.googleCalendarConnected === true) &&
    !calendarReconnectRequired;

  const isOnboardingVisible = onboardingQuery.data?.isActive === true;
  const selectedCalendarId = calendarsQuery.data?.selectedCalendarId ?? null;

  return (
    <div className="flex flex-col space-y-4 sm:space-y-5">
      {isOnboardingVisible ? (
        <SetupGuide
          from={fromSource}
          phase={setupPhase}
          hasSchedule={hasSchedule}
          hasServices={services.length > 0}
          hasProfessionals={professionals.length > 0}
          hasCalendar={hasCalendar}
          onDismiss={() => dismissMutation.mutate()}
        />
      ) : null}

      {setupPhase === "schedule_confirmation" ? (
        <ScheduleConfirmationBanner
          onConfirm={confirmPlaceSchedule}
          onEdit={() => openAndScroll("business-hours")}
        />
      ) : null}

      <BusinessHoursEditor
        value={business.schedule}
        timeZone={business.timezone || "Europe/Madrid"}
        isSaving={scheduleMutation.isPending}
        onSave={(schedule) => scheduleMutation.mutate(schedule)}
        open={isSectionOpen("business-hours")}
        onToggle={() => toggleSection("business-hours")}
      />

      <SettingsSection
        id="capacity"
        icon={CalendarClock}
        title="Capacidad de reservas"
        summary={`${settingsQuery.data?.bookingCapacity ?? 1} ${(settingsQuery.data?.bookingCapacity ?? 1) === 1 ? "plaza simultánea" : "plazas simultáneas"}`}
        open={isSectionOpen("capacity")}
        onToggle={() => toggleSection("capacity")}
      >
        <div className="p-4 sm:p-5">
          <p className="max-w-2xl text-sm leading-6 text-muted">
            Indica cuántas citas simultáneas puede atender el negocio dentro de
            su horario. Es independiente del número de profesionales.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="max-w-xs flex-1 text-sm font-medium text-[#344038]">
              Máximo de citas simultáneas
              <input
                type="number"
                min={1}
                max={50}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="field mt-2 w-full"
              />
            </label>
            <button
              type="button"
              onClick={() => capacityMutation.mutate(Number(capacity))}
              disabled={capacityMutation.isPending}
              className="btn-primary h-11 px-5"
            >
              {capacityMutation.isPending ? (
                "Guardando..."
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Guardar capacidad
                </>
              )}
            </button>
          </div>
        </div>
      </SettingsSection>

      {setupPhase === "services_professionals" ? (
        <ServicesProfessionalsGuide
          hasServices={services.length > 0}
          hasProfessionals={professionals.length > 0}
          onGoToServices={() => openAndScroll("services")}
          onGoToProfessionals={() => openAndScroll("professionals")}
          onFinish={() => openAndScroll("calendar-section")}
        />
      ) : null}

      <SettingsSection
        id="services"
        icon={ScissorsLineDashed}
        title="Servicios"
        summary={
          services.length === 0
            ? "Sin servicios configurados"
            : `${services.length} ${services.length === 1 ? "servicio" : "servicios"}`
        }
        open={isSectionOpen("services")}
        onToggle={() => toggleSection("services")}
      >
        <div className="space-y-5 p-4 sm:p-5">
          <p className="text-sm text-muted">
            La duración siempre saldrá de aquí, no del agente.
          </p>

          <details className="group rounded-xl border border-[#dce7d2] bg-[#fbfcf8]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#344038]">
              Añadir servicio
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-[#e4e8df] p-4 md:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <input
                value={serviceDraft.name}
                onChange={(event) =>
                  setServiceDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ej. Corte + peinado"
                className="field"
              />
              <input
                type="number"
                min={5}
                step={5}
                value={serviceDraft.durationMinutes}
                onChange={(event) =>
                  setServiceDraft((current) => ({
                    ...current,
                    durationMinutes: event.target.value,
                  }))
                }
                className="field"
                placeholder="Minutos"
              />
              <button
                type="button"
                onClick={() =>
                  createServiceMutation.mutate({
                    name: serviceDraft.name,
                    durationMinutes: Number(serviceDraft.durationMinutes),
                  })
                }
                disabled={
                  createServiceMutation.isPending || !serviceDraft.name.trim()
                }
                className="btn-primary h-11 w-full px-5 sm:w-auto"
              >
                {createServiceMutation.isPending ? "Creando..." : "Añadir"}
              </button>
            </div>
          </details>

          <div className="space-y-3">
            {services.length === 0 ? (
              <EmptyState
                title="Todavía no hay servicios"
                description="Empieza por crear los tratamientos o citas que el agente podrá ofrecer por teléfono."
              />
            ) : (
              services.map((service) => (
                <ServiceEditor
                  key={service.id}
                  service={service}
                  onSave={(payload) =>
                    updateBookingService(service.id, payload)
                  }
                  onSuccess={async () => {
                    await invalidateAll();
                    setBanner({
                      type: "success",
                      message: `Servicio ${service.name} actualizado.`,
                    });
                  }}
                  onError={() =>
                    setBanner({
                      type: "error",
                      message: `No se pudo actualizar ${service.name}.`,
                    })
                  }
                />
              ))
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="professionals"
        icon={UserRoundCheck}
        title="Profesionales"
        summary={
          professionals.length === 0
            ? "Sin profesionales configurados"
            : `${professionals.length} ${professionals.length === 1 ? "profesional" : "profesionales"}`
        }
        open={isSectionOpen("professionals")}
        onToggle={() => toggleSection("professionals")}
      >
        <div className="space-y-5 p-4 sm:p-5">
          <p className="text-sm text-muted">
            Si el cliente no pide uno concreto, el sistema elegirá uno
            compatible y libre.
          </p>

          <details className="group rounded-xl border border-[#dce7d2] bg-[#fbfcf8]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#344038]">
              Añadir profesional
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-[#e4e8df] p-4">
              <input
                value={professionalDraft.name}
                onChange={(event) =>
                  setProfessionalDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Nombre del profesional"
                className="field"
              />
              <label className="text-sm font-medium text-[#344038]">
                Servicios compatibles
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {services.map((service) => {
                    const checked = professionalDraft.serviceIds.includes(
                      service.id
                    );
                    return (
                      <label
                        key={service.id}
                        className="flex items-center gap-2 rounded-xl border border-[#e4e8df] bg-white px-3 py-2 text-sm text-[#344038]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setProfessionalDraft((current) => ({
                              ...current,
                              serviceIds: checked
                                ? current.serviceIds.filter(
                                    (serviceId) => serviceId !== service.id
                                  )
                                : [...current.serviceIds, service.id],
                            }));
                          }}
                        />
                        <span>{service.name}</span>
                      </label>
                    );
                  })}
                </div>
              </label>
              <button
                type="button"
                onClick={() =>
                  createProfessionalMutation.mutate(professionalDraft)
                }
                disabled={
                  createProfessionalMutation.isPending ||
                  !professionalDraft.name.trim()
                }
                className="btn-primary h-11 w-full px-5 sm:w-auto"
              >
                {createProfessionalMutation.isPending
                  ? "Guardando..."
                  : "Añadir profesional"}
              </button>
            </div>
          </details>

          <div className="space-y-3">
            {professionals.length === 0 ? (
              <EmptyState
                title="Todavía no hay profesionales"
                description="Añade el equipo disponible para que la reserva no asigne más trabajo del que podéis absorber."
              />
            ) : (
              professionals.map((professional) => (
                <ProfessionalEditor
                  key={professional.id}
                  professional={professional}
                  services={services}
                  onSave={(payload) =>
                    updateBookingProfessional(professional.id, payload)
                  }
                  onSuccess={async () => {
                    await invalidateAll();
                    setBanner({
                      type: "success",
                      message: `Profesional ${professional.name} actualizado.`,
                    });
                  }}
                  onError={() =>
                    setBanner({
                      type: "error",
                      message: `No se pudo actualizar ${professional.name}.`,
                    })
                  }
                />
              ))
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="calendar-section"
        icon={CalendarDays}
        title="Calendario"
        summary={
          hasCalendar
            ? `${activeCalendarProvider === "outlook" ? "Outlook Calendar" : "Google Calendar"} conectado${activeCalendarProvider === "outlook" && business.outlookUserEmail ? ` · ${business.outlookUserEmail}` : ""}`
            : "Sin conectar"
        }
        open={isSectionOpen("calendar-section")}
        onToggle={() => toggleSection("calendar-section")}
      >
        <div className="space-y-4 p-4 sm:p-5">
          {calendarStatus && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${calendarStatus.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#9f2a2a]"}`}
            >
              {calendarStatus.message}
            </div>
          )}

          {!hasCalendar ? (
            <div className="flex flex-col items-center gap-5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="order-2 w-full space-y-4 sm:order-1">
                <p className="max-w-2xl text-sm leading-6 text-muted">
                  Conecta tu agenda para que el agente pueda consultar
                  disponibilidad y agendar citas automáticamente.
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void startCalendarConnection("google")}
                    disabled={calendarAuthLoading !== null}
                    className="flex flex-col justify-between rounded-xl border border-[#d7e9c5] bg-[linear-gradient(135deg,#f4fbe6,#ffffff)] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(30,43,34,0.04)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1e2b22]">
                        Conecta Google Calendar
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Activa reservas automáticas, disponibilidad real y la
                        agenda en el panel.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#2f5b18]">
                      {calendarAuthLoading === "google"
                        ? "Conectando..."
                        : "Conectar Google"}
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCalendarConnection("outlook")}
                    disabled={calendarAuthLoading !== null}
                    className="flex flex-col justify-between rounded-xl border border-[#d7e9c5] bg-[linear-gradient(135deg,#f4fbe6,#ffffff)] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(30,43,34,0.04)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1e2b22]">
                        Conecta Outlook
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Usa Outlook Calendar como segunda opción para
                        sincronizar tu agenda del negocio.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#2f5b18]">
                      {calendarAuthLoading === "outlook"
                        ? "Conectando..."
                        : "Conectar Outlook"}
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </button>
                </div>
              </div>
              <LottieAnimation
                src="/animations/landing/CalendarCharacterAnimation.json"
                className="order-1 w-32 shrink-0 sm:order-2 sm:w-40 lg:w-48"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-xl border border-[#d8efd7] bg-[#ecf7ec] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#2c7334]" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2c7334]">
                      {activeCalendarProvider === "outlook"
                        ? "Outlook Calendar"
                        : "Google Calendar"}{" "}
                      conectado
                    </p>
                    <p className="truncate text-xs text-[#405115]">
                      {activeCalendarProvider === "outlook"
                        ? (business.outlookUserEmail ?? "Cuenta de Outlook")
                        : "Cuenta de Google"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarPickerOpen((current) => !current)}
                  className="btn-secondary h-10 shrink-0 self-start px-4 sm:self-auto"
                >
                  {calendarPickerOpen
                    ? "Cerrar selector"
                    : "Cambiar de calendario"}
                </button>
              </div>

              {calendarPickerOpen ? (
                <div className="space-y-2">
                  {calendarsQuery.isLoading ? (
                    <p className="px-1 text-sm text-muted">
                      Cargando calendarios…
                    </p>
                  ) : null}
                  {calendarsQuery.isError ? (
                    <p className="px-1 text-sm text-[#c53030]">
                      No se pudo obtener la lista de calendarios. Inténtalo de
                      nuevo en unos segundos.
                    </p>
                  ) : null}
                  {calendarsQuery.data ? (
                    calendarsQuery.data.calendars.length === 0 ? (
                      <p className="px-1 text-sm text-muted">
                        No hay calendarios disponibles en esta cuenta.
                      </p>
                    ) : (
                      calendarsQuery.data.calendars.map((calendar) => {
                        const isSelected = calendar.id === selectedCalendarId;
                        return (
                          <button
                            key={calendar.id}
                            type="button"
                            disabled={selectCalendarMutation.isPending}
                            onClick={() =>
                              selectCalendarMutation.mutate(calendar.id)
                            }
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition duration-200 disabled:opacity-60 ${isSelected ? "border-[#b9d489] bg-[#f1f8e3]" : "border-[#e1e8da] bg-white hover:border-[#cfddc4]"}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[#344038]">
                                {calendar.name}
                              </span>
                              {calendar.primary ? (
                                <span className="block text-xs text-muted">
                                  Calendario principal
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-[#b8d96e] text-[#30430f]" : "bg-[#eef0ec] text-transparent"}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        );
                      })
                    )
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        id="business-information"
        icon={Building2}
        title="Información del negocio"
        summary={businessProfile.name || "Datos del negocio"}
        open={isSectionOpen("business-information")}
        onToggle={() => toggleSection("business-information")}
      >
        <p className="max-w-3xl px-4 pt-4 text-sm leading-6 text-muted sm:px-6">
          Datos verificados que el agente puede utilizar al responder. Los
          servicios y horarios se configuran en sus apartados específicos.
        </p>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(14rem,0.4fr)_minmax(0,1fr)]">
          <label className="text-sm font-semibold text-[#344038]">
            Nombre comercial
            <input
              value={businessProfile.name}
              onChange={(event) =>
                setBusinessProfile((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="field mt-2 w-full"
            />
          </label>
          <label className="text-sm font-semibold text-[#344038]">
            Dirección, contacto y políticas útiles
            <textarea
              rows={4}
              value={businessProfile.businessDetails}
              onChange={(event) =>
                setBusinessProfile((current) => ({
                  ...current,
                  businessDetails: event.target.value,
                }))
              }
              className="field mt-2 h-auto min-h-28 w-full resize-y text-sm font-normal leading-6"
              placeholder="Dirección, cómo llegar, política de cancelación, métodos de pago o indicaciones importantes."
            />
          </label>
        </div>
        <div className="flex justify-end border-t border-[#e4e8df] px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending || !businessProfile.name.trim()}
            className="btn-secondary px-5"
          >
            <Save className="h-4 w-4" />{" "}
            {profileMutation.isPending ? "Guardando..." : "Guardar información"}
          </button>
        </div>
      </SettingsSection>

      <AgentSettingsEditor
        value={agentSettings}
        isSaving={agentSettingsMutation.isPending}
        onChange={setAgentSettings}
        onSave={() => agentSettingsMutation.mutate()}
        open={isSectionOpen("agent-settings")}
        onToggle={() => toggleSection("agent-settings")}
      />

      {banner ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#9f2a2a]"}`}
        >
          {banner.message}
        </div>
      ) : null}
    </div>
  );
}

export default function AjustesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted">Cargando ajustes…</div>
      }
    >
      <AjustesContent />
    </Suspense>
  );
}

function ServiceEditor({
  service,
  onSave,
  onSuccess,
  onError,
}: {
  service: BookingService;
  onSave: (payload: {
    name?: string;
    durationMinutes?: number;
    active?: boolean;
  }) => Promise<unknown>;
  onSuccess: () => void | Promise<void>;
  onError: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [durationMinutes, setDurationMinutes] = useState(
    String(service.durationMinutes)
  );
  const [active, setActive] = useState(service.active);

  const mutation = useMutation({
    mutationFn: onSave,
    onSuccess,
    onError,
  });

  return (
    <details className="group rounded-xl border border-[#dce7d2] bg-white shadow-[0_4px_16px_rgba(30,43,34,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#344038]">
            {service.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {service.durationMinutes} min ·{" "}
            {service.active ? "Activo" : "Inactivo"}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-[#e4e8df] p-4 md:grid-cols-[minmax(0,1fr)_9rem_auto_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="field"
        />
        <input
          type="number"
          min={5}
          step={5}
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
          className="field"
        />
        <label className="flex items-center gap-2 rounded-xl border border-[#e4e8df] px-3 py-2 text-sm text-[#344038]">
          <input
            type="checkbox"
            checked={active}
            onChange={() => setActive((current) => !current)}
          />
          Activo
        </label>
        <button
          type="button"
          onClick={() =>
            mutation.mutate({
              name,
              durationMinutes: Number(durationMinutes),
              active,
            })
          }
          disabled={mutation.isPending}
          className="btn-secondary h-11 w-full px-4 md:w-auto"
        >
          {mutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </details>
  );
}

function ProfessionalEditor({
  professional,
  services,
  onSave,
  onSuccess,
  onError,
}: {
  professional: BookingProfessional;
  services: BookingService[];
  onSave: (payload: {
    name?: string;
    active?: boolean;
    serviceIds?: string[];
  }) => Promise<unknown>;
  onSuccess: () => void | Promise<void>;
  onError: () => void;
}) {
  const [name, setName] = useState(professional.name);
  const [active, setActive] = useState(professional.active);
  const [serviceIds, setServiceIds] = useState<string[]>(
    professional.serviceIds
  );
  const compatibleServices = services.filter((service) =>
    serviceIds.includes(service.id)
  );

  const mutation = useMutation({
    mutationFn: onSave,
    onSuccess,
    onError,
  });

  return (
    <details className="group rounded-xl border border-[#dce7d2] bg-white shadow-[0_4px_16px_rgba(30,43,34,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#344038]">
            {professional.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {professional.active ? "Activo" : "Inactivo"} ·{" "}
            {compatibleServices.length} servicios compatibles
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-[#e4e8df] p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field"
          />
          <label className="flex items-center gap-2 rounded-xl border border-[#e4e8df] px-3 py-2 text-sm text-[#344038]">
            <input
              type="checkbox"
              checked={active}
              onChange={() => setActive((current) => !current)}
            />
            Activo
          </label>
          <button
            type="button"
            onClick={() => mutation.mutate({ name, active, serviceIds })}
            disabled={mutation.isPending}
            className="btn-secondary h-11 w-full px-4 md:w-auto"
          >
            {mutation.isPending ? "Guardando..." : "Guardar"}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const checked = serviceIds.includes(service.id);
            return (
              <label
                key={service.id}
                className="flex items-center gap-2 rounded-xl border border-[#e4e8df] bg-[#fbfcf8] px-3 py-2 text-sm text-[#344038]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setServiceIds((current) =>
                      checked
                        ? current.filter(
                            (serviceId) => serviceId !== service.id
                          )
                        : [...current, service.id]
                    );
                  }}
                />
                <span>{service.name}</span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}
