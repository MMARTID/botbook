"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import {
  createBookingProfessional,
  createBookingService,
  deleteBookingProfessional,
  deleteBookingService,
  getBookingSettings,
  getCalendarList,
  getGoogleCalendarAuthUrl,
  getMicrosoftCalendarAuthUrl,
  selectCalendar,
  updateBookingCapacity,
  updateBookingProfessional,
  updateBookingService,
  updateMyBusiness,
} from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { getNextAgentSetupSection } from "@/lib/agent-configuration";
import { useBusiness } from "@/components/providers";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import {
  AgentSettingsEditor,
  DEFAULT_AGENT_SETTINGS,
} from "@/components/agent-settings-editor";
import { SettingsSection } from "@/components/settings-section";
import { AgentDocuments } from "@/components/agent-documents";
import { AgentOperationalSummary } from "@/components/agent-operational-summary";
import { LottieAnimation } from "@/components/lottie-animation";
import type {
  AgentSettings,
  BookingProfessional,
  BookingService,
  BookingSettings,
  BusinessSchedule,
} from "@/lib/types";
import {
  ArrowUpRight,
  Bot,
  BookOpenText,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Pencil,
  Save,
  ScissorsLineDashed,
  Trash2,
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
    <div className="rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 text-sm text-muted">
      <p className="font-semibold text-[#27272a]">{title}</p>
      <p className="mt-1 leading-6">{description}</p>
    </div>
  );
}

function isValidPlaceSchedule(value: unknown): value is BusinessSchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BusinessSchedule>;
  return candidate.version === 1 && Boolean(candidate.week);
}

function AgenteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    price: "",
  });
  const [professionalDraft, setProfessionalDraft] = useState({
    name: "",
    serviceIds: [] as string[],
  });
  const [businessDetails, setBusinessDetails] = useState("");
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS
  );
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
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

  useEffect(() => {
    if (settingsQuery.data) {
      setCapacity(String(settingsQuery.data.bookingCapacity));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!business) return;
    setBusinessDetails(business.businessDetails ?? "");
    // Combinar con los defaults (no reemplazar sin más): un negocio existente
    // puede tener agentSettings guardados de antes de un campo nuevo (p. ej.
    // voiceGender) — sin este merge, ese campo llegaría undefined al editor y
    // ninguna opción aparecería seleccionada hasta que el usuario tocara algo.
    setAgentSettings({ ...DEFAULT_AGENT_SETTINGS, ...business.agentSettings });
  }, [business]);

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["my-business"] }),
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
    },
    onError: () =>
      setBanner({
        type: "error",
        message:
          "Revisa que los tramos no se solapen y que la apertura sea anterior al cierre.",
      }),
  });

  const profileMutation = useMutation({
    mutationFn: () => updateMyBusiness({ businessDetails }),
    onSuccess: (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      setBanner({
        type: "success",
        message: "Información para el agente actualizada.",
      });
    },
    onError: () =>
      setBanner({
        type: "error",
        message: "No se pudo guardar la información para el agente.",
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
      setServiceDraft({ name: "", durationMinutes: "30", price: "" });
      setBanner({ type: "success", message: "Servicio creado." });
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
    },
    onError: () =>
      setBanner({ type: "error", message: "No se pudo crear el profesional." }),
  });

  const services = settingsQuery.data?.services ?? [];
  const agentFiles = business?.agents?.[0]?.files ?? [];
  const professionals = settingsQuery.data?.professionals ?? [];

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
    const pendingSection = getNextAgentSetupSection({
      hasSchedule: isValidPlaceSchedule(business.schedule),
      serviceCount: settingsQuery.data.services.length,
      professionalCount: settingsQuery.data.professionals.length,
      hasCalendar: calendarConnected,
    });

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
    return <div className="p-8 text-center text-muted">Cargando el agente…</div>;
  }

  if (settingsQuery.isError) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">
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
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">
          No se pudo cargar la configuración del agente
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

  const activeCalendarProvider =
    business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendar =
    (activeCalendarProvider === "outlook"
      ? business.outlookCalendarConnected === true
      : business.googleCalendarConnected === true) &&
    !calendarReconnectRequired;

  const selectedCalendarId = calendarsQuery.data?.selectedCalendarId ?? null;

  return (
    <div className="flex flex-col space-y-4 sm:space-y-5">
      <header className="mb-2 flex items-start gap-3 sm:mb-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-[#0a0a0a] sm:text-3xl">
            Tu agente
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Configura cómo atiende, qué puede reservar y qué información utiliza al hablar con tus clientes.
          </p>
        </div>
      </header>
      <AgentOperationalSummary business={business} agentActive={business.agents?.[0]?.active !== false} />
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"}`}
        >
          {banner.message}
        </div>
      ) : null}
      <SectionGroupHeading title="Disponibilidad" description="Define cuándo puede reservar tu recepcionista y cuántas citas puede confirmar a la vez." />
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
            <label className="max-w-xs flex-1 text-sm font-medium text-[#27272a]">
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

      <SectionGroupHeading title="Catálogo y equipo" description="Los servicios y las personas disponibles determinan qué puede ofrecer y reservar por teléfono." />
      <SettingsSection
        id="services"
        icon={ScissorsLineDashed}
        title="Servicios"
        summary={
          services.length === 0
            ? "Sin servicios configurados"
            : `${services.length} ${services.length === 1 ? "servicio" : "servicios"}`
        }
        pending={services.length === 0}
        open={isSectionOpen("services")}
        onToggle={() => toggleSection("services")}
      >
        <div className="space-y-5 p-4 sm:p-5">
          <p className="text-sm leading-6 text-muted">
            La duración siempre saldrá de aquí, no del agente. El precio es opcional: si lo pones, el
            panel puede decirte cuánto valen las citas que entran solas.
          </p>

          <details className="group rounded-xl border border-[#e5e5e5] bg-[#fafafa]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#27272a]">
              Añadir servicio
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-[#e5e5e5] p-4 md:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
              <input
                value={serviceDraft.name}
                onChange={(event) =>
                  setServiceDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ej. Corte + peinado"
                aria-label="Nombre del servicio"
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
                aria-label="Duración en minutos"
              />
              <input
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={serviceDraft.price}
                onChange={(event) =>
                  setServiceDraft((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                className="field"
                placeholder="Precio €"
                aria-label="Precio en euros (opcional)"
              />
              <button
                type="button"
                onClick={() =>
                  createServiceMutation.mutate({
                    name: serviceDraft.name,
                    durationMinutes: Number(serviceDraft.durationMinutes),
                    priceCents: euroInputToCents(serviceDraft.price),
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
                  onDelete={() => deleteBookingService(service.id)}
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
                  onDeleted={async () => {
                    await invalidateAll();
                    setBanner({
                      type: "success",
                      message: `Servicio ${service.name} eliminado.`,
                    });
                  }}
                  onDeleteError={() =>
                    setBanner({
                      type: "error",
                      message: `No se pudo eliminar ${service.name}.`,
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
        pending={professionals.length === 0}
        open={isSectionOpen("professionals")}
        onToggle={() => toggleSection("professionals")}
      >
        <div className="space-y-5 p-4 sm:p-5">
          <p className="text-sm text-muted">
            Si el cliente no pide uno concreto, el sistema elegirá uno
            compatible y libre.
          </p>

          <details className="group rounded-xl border border-[#e5e5e5] bg-[#fafafa]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#27272a]">
              Añadir profesional
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-[#e5e5e5] p-4">
              <input
                value={professionalDraft.name}
                onChange={(event) =>
                  setProfessionalDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Nombre del profesional"
                aria-label="Nombre del profesional"
                className="field"
              />
              <fieldset className="text-sm font-medium text-[#27272a]">
                <legend>Servicios compatibles</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {services.map((service) => {
                    const checked = professionalDraft.serviceIds.includes(
                      service.id
                    );
                    return (
                      <label
                        key={service.id}
                        className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#27272a]"
                      >
                        <input
                          type="checkbox"
                          className="accent-[#8b5cf6]"
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
              </fieldset>
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
                  onDelete={() =>
                    deleteBookingProfessional(professional.id)
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
                  onDeleted={async () => {
                    await invalidateAll();
                    setBanner({
                      type: "success",
                      message: `Profesional ${professional.name} eliminado.`,
                    });
                  }}
                  onDeleteError={() =>
                    setBanner({
                      type: "error",
                      message: `No se pudo eliminar ${professional.name}.`,
                    })
                  }
                />
              ))
            )}
          </div>
        </div>
      </SettingsSection>

      <SectionGroupHeading title="Agenda y conocimiento" description="Conecta la agenda real y añade la información que la recepcionista necesita para responder con precisión." />
      <SettingsSection
        id="calendar-section"
        icon={CalendarDays}
        title="Calendario"
        summary={
          hasCalendar
            ? `${activeCalendarProvider === "outlook" ? "Outlook Calendar" : "Google Calendar"} conectado${activeCalendarProvider === "outlook" && business.outlookUserEmail ? ` · ${business.outlookUserEmail}` : ""}`
            : "Sin conectar"
        }
        pending={!hasCalendar}
        open={isSectionOpen("calendar-section")}
        onToggle={() => toggleSection("calendar-section")}
      >
        <div className="space-y-4 p-4 sm:p-5">
          {calendarStatus && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${calendarStatus.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"}`}
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
                    className="flex flex-col justify-between rounded-xl border border-[#ddd6fe] bg-[#f3eeff] p-4 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0a0a0a]">
                        Conecta Google Calendar
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Activa reservas automáticas, disponibilidad real y la
                        agenda en el panel.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#6d28d9]">
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
                    className="flex flex-col justify-between rounded-xl border border-[#ddd6fe] bg-[#f3eeff] p-4 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0a0a0a]">
                        Conecta Outlook
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Usa Outlook Calendar como segunda opción para
                        sincronizar tu agenda del negocio.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#6d28d9]">
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
                    <p className="truncate text-xs text-[#2c7334]/70">
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
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition duration-200 disabled:opacity-60 ${isSelected ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[#27272a]">
                                {calendar.name}
                              </span>
                              {calendar.primary ? (
                                <span className="block text-xs text-muted">
                                  Calendario principal
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-[#8b5cf6] text-[#ffffff]" : "bg-[#f4f4f5] text-transparent"}`}
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
        id="agent-documents"
        icon={FileText}
        title="Documentos del agente"
        summary={
          agentFiles.length === 0
            ? "Sin documentos"
            : `${agentFiles.length} ${agentFiles.length === 1 ? "documento" : "documentos"}`
        }
        open={isSectionOpen("agent-documents")}
        onToggle={() => toggleSection("agent-documents")}
      >
        <AgentDocuments agentId={business?.agents?.[0]?.id} files={agentFiles} />
      </SettingsSection>

      <SettingsSection
        id="business-information"
        icon={BookOpenText}
        title="Información para responder"
        summary={businessDetails.trim() ? "Información añadida" : "Sin información adicional"}
        open={isSectionOpen("business-information")}
        onToggle={() => toggleSection("business-information")}
      >
        <p className="max-w-3xl px-4 pt-4 text-sm leading-6 text-muted sm:px-6">
          Añade datos que el agente puede utilizar al responder. Los servicios,
          horarios y profesionales se configuran en sus apartados específicos.
        </p>
        <div className="p-4 sm:p-6">
          <label className="text-sm font-semibold text-[#27272a]">
            Dirección, contacto y políticas útiles
            <textarea
              rows={4}
              value={businessDetails}
              onChange={(event) => setBusinessDetails(event.target.value)}
              className="field mt-2 h-auto min-h-28 w-full resize-y text-sm font-normal leading-6"
              placeholder="Dirección, cómo llegar, política de cancelación, métodos de pago o indicaciones importantes."
            />
          </label>
        </div>
        <div className="flex justify-end border-t border-[#e5e5e5] px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending}
            className="btn-secondary px-5"
          >
            <Save className="h-4 w-4" />{" "}
            {profileMutation.isPending ? "Guardando..." : "Guardar información"}
          </button>
        </div>
      </SettingsSection>

      <SectionGroupHeading title="Cómo atiende" description="Ajusta el tono, el objetivo y el modo en que la recepcionista gestiona cada conversación." />
      <AgentSettingsEditor
        value={agentSettings}
        isSaving={agentSettingsMutation.isPending}
        onChange={setAgentSettings}
        onSave={() => agentSettingsMutation.mutate()}
        open={isSectionOpen("agent-settings")}
        onToggle={() => toggleSection("agent-settings")}
      />

    </div>
  );
}

function SectionGroupHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-[#e5e5e5] pb-3 pt-4 sm:flex sm:items-end sm:justify-between sm:gap-6">
      <div>
        <h2 className="text-base font-semibold text-[#0a0a0a] sm:text-lg">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}

export default function AgentePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted">Cargando el agente…</div>
      }
    >
      <AgenteContent />
    </Suspense>
  );
}

function ServiceEditor({
  service,
  onSave,
  onDelete,
  onSuccess,
  onError,
  onDeleted,
  onDeleteError,
}: {
  service: BookingService;
  onSave: (payload: {
    name?: string;
    durationMinutes?: number;
    priceCents?: number | null;
    active?: boolean;
  }) => Promise<unknown>;
  onDelete: () => Promise<void>;
  onSuccess: () => void | Promise<void>;
  onError: () => void;
  onDeleted: () => void | Promise<void>;
  onDeleteError: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [durationMinutes, setDurationMinutes] = useState(
    String(service.durationMinutes)
  );
  const [price, setPrice] = useState(centsToEuroInput(service.priceCents));
  const [active, setActive] = useState(service.active);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const saveMutation = useMutation({
    mutationFn: onSave,
    onSuccess: async () => {
      await onSuccess();
      setFeedback({ type: "success", message: "Cambios guardados." });
      setEditing(false);
    },
    onError: () => {
      onError();
      setFeedback({ type: "error", message: "No se pudieron guardar los cambios." });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: onDelete,
    onSuccess: onDeleted,
    onError: () => {
      onDeleteError();
      setFeedback({ type: "error", message: "No se pudo eliminar el servicio." });
    },
  });

  const precioActual = formatPrice(service.priceCents);

  return (
    <article className="rounded-xl border border-[#e5e5e5] bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#27272a]">
            {service.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {service.durationMinutes} min · {precioActual ?? "Sin precio"} ·{" "}
            {service.active ? "Activo" : "Inactivo"}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing((current) => !current);
              setConfirmingDelete(false);
            }}
            aria-expanded={editing}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#e5e5e5] px-4 text-sm font-semibold text-[#27272a] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:flex-none"
          >
            {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {editing ? "Cerrar" : "Editar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true);
              setEditing(false);
            }}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#f5d3d3] px-4 text-sm font-semibold text-[#c53030] transition hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030] sm:flex-none"
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </button>
        </div>
      </div>

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`border-t px-4 py-2 text-sm ${feedback.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      {editing ? (
      <div className="grid gap-3 border-t border-[#e5e5e5] bg-[#fafafa] p-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_auto]">
        <label className="text-xs font-semibold text-[#52525b]">
          Nombre
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field mt-2 w-full text-sm font-normal text-[#27272a]"
          />
        </label>
        <label className="text-xs font-semibold text-[#52525b]">
          Duración (min)
          <input
            type="number"
            min={5}
            step={5}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            className="field mt-2 w-full text-sm font-normal text-[#27272a]"
          />
        </label>
        <label className="text-xs font-semibold text-[#52525b]">
          Precio (€)
          <input
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="field mt-2 w-full text-sm font-normal text-[#27272a]"
          />
        </label>
        <label className="text-xs font-semibold text-[#52525b]">
          Estado
          <span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-normal text-[#27272a]">
            <input
              type="checkbox"
              className="accent-[#8b5cf6]"
              checked={active}
              onChange={() => setActive((current) => !current)}
            />
            Activo
          </span>
        </label>
        <button
          type="button"
          onClick={() =>
            saveMutation.mutate({
              name,
              durationMinutes: Number(durationMinutes),
              priceCents: euroInputToCents(price),
              active,
            })
          }
          disabled={saveMutation.isPending || !name.trim()}
          className="btn-secondary h-11 w-full self-end px-4 md:w-auto"
        >
          {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
      ) : null}

      {confirmingDelete ? (
        <div className="flex flex-col gap-3 border-t border-[#f5d3d3] bg-[#fff1f1] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[#c53030]">
            Se retirará de las nuevas reservas y de todos los profesionales. El historial se conserva.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleteMutation.isPending}
              className="btn-secondary h-11 px-4"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#c53030] px-4 text-sm font-semibold text-white transition hover:bg-[#9f2424] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030] focus-visible:ring-offset-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar servicio"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** Vaciar el campo borra el precio; el backend acepta `null` para eso. */
function euroInputToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const euros = Number(normalized);
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

function centsToEuroInput(cents: number | null): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function ProfessionalEditor({
  professional,
  services,
  onSave,
  onDelete,
  onSuccess,
  onError,
  onDeleted,
  onDeleteError,
}: {
  professional: BookingProfessional;
  services: BookingService[];
  onSave: (payload: {
    name?: string;
    active?: boolean;
    serviceIds?: string[];
  }) => Promise<unknown>;
  onDelete: () => Promise<void>;
  onSuccess: () => void | Promise<void>;
  onError: () => void;
  onDeleted: () => void | Promise<void>;
  onDeleteError: () => void;
}) {
  const [name, setName] = useState(professional.name);
  const [active, setActive] = useState(professional.active);
  const [serviceIds, setServiceIds] = useState<string[]>(
    professional.serviceIds
  );
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const compatibleServices = services.filter((service) =>
    serviceIds.includes(service.id)
  );

  const saveMutation = useMutation({
    mutationFn: onSave,
    onSuccess: async () => {
      await onSuccess();
      setFeedback({ type: "success", message: "Cambios guardados." });
      setEditing(false);
    },
    onError: () => {
      onError();
      setFeedback({ type: "error", message: "No se pudieron guardar los cambios." });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: onDelete,
    onSuccess: onDeleted,
    onError: () => {
      onDeleteError();
      setFeedback({ type: "error", message: "No se pudo eliminar el profesional." });
    },
  });

  return (
    <article className="rounded-xl border border-[#e5e5e5] bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#27272a]">
            {professional.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {professional.active ? "Activo" : "Inactivo"} ·{" "}
            {compatibleServices.length} servicios compatibles
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing((current) => !current);
              setConfirmingDelete(false);
            }}
            aria-expanded={editing}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#e5e5e5] px-4 text-sm font-semibold text-[#27272a] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:flex-none"
          >
            {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {editing ? "Cerrar" : "Editar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true);
              setEditing(false);
            }}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#f5d3d3] px-4 text-sm font-semibold text-[#c53030] transition hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030] sm:flex-none"
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </button>
        </div>
      </div>

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`border-t px-4 py-2 text-sm ${feedback.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      {editing ? (
      <div className="flex flex-col gap-3 border-t border-[#e5e5e5] bg-[#fafafa] p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
          <label className="text-xs font-semibold text-[#52525b]">
            Nombre
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field mt-2 w-full text-sm font-normal text-[#27272a]"
            />
          </label>
          <label className="text-xs font-semibold text-[#52525b]">
            Estado
            <span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-normal text-[#27272a]">
              <input
                type="checkbox"
                className="accent-[#8b5cf6]"
                checked={active}
                onChange={() => setActive((current) => !current)}
              />
              Activo
            </span>
          </label>
          <button
            type="button"
            onClick={() => saveMutation.mutate({ name, active, serviceIds })}
            disabled={saveMutation.isPending || !name.trim()}
            className="btn-secondary h-11 w-full self-end px-4 md:w-auto"
          >
            {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold text-[#52525b]">Servicios compatibles</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const checked = serviceIds.includes(service.id);
            return (
              <label
                key={service.id}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#27272a]"
              >
                <input
                  type="checkbox"
                  className="accent-[#8b5cf6]"
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
        </fieldset>
      </div>
      ) : null}

      {confirmingDelete ? (
        <div className="flex flex-col gap-3 border-t border-[#f5d3d3] bg-[#fff1f1] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[#c53030]">
            Ya no recibirá nuevas citas. Sus citas anteriores seguirán visibles en el historial.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleteMutation.isPending}
              className="btn-secondary h-11 px-4"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#c53030] px-4 text-sm font-semibold text-white transition hover:bg-[#9f2424] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030] focus-visible:ring-offset-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar profesional"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
