"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  LoaderCircle,
  MapPin,
  Phone,
  PhoneForwarded,
  Search,
  Smartphone,
} from "lucide-react";
import { LottieAnimation } from "@/components/lottie-animation";
import { TarjetasDeLinea } from "@/components/tarjetas-de-linea";
import {
  getPlaceDetails,
  searchPlaces,
  sendOwnerWhatsappActivation,
  updateMyBusiness,
} from "@/lib/api";
import { apiErrorCode, describeApiError, esLimiteDePeticiones } from "@/lib/api-errors";
import { consumePendingPlan, isPlanId } from "@/lib/billing-navigation";
import { detectBusinessTypeFromPlaceTypes } from "@/lib/business-type";
import {
  esFijoEspanol,
  inferirTipoDeLinea,
  normalizarMovil,
} from "@/lib/phone";
import type {
  Business,
  BusinessSchedule,
  CustomerLineType,
  PlaceDetails,
  PlaceSearchResult,
  WeekDay,
} from "@/lib/types";

const DETECTED_BUSINESS_TYPE_KEY = "alhabla_detected_business_type";

// Cuánto se enseña el aviso de «no se pudo guardar tu móvil» antes de seguir:
// el registro no se bloquea por WhatsApp, pero la persona tiene que leerlo.
const AVISO_MOVIL_NO_GUARDADO_MS = 4_000;
const AVISO_MOVIL_NO_GUARDADO =
  "No se pudo guardar tu móvil. Añádelo más tarde en Ajustes › Teléfono.";

const ERROR_MOVIL_INVALIDO =
  "Escribe un móvil válido, por ejemplo 600 123 456 o +34 600 123 456.";
const ERROR_LINEA_INVALIDA =
  "Escribe un teléfono válido, por ejemplo 930 123 456 o +34 600 123 456.";
// Un fijo español (8xx/9xx) no tiene WhatsApp: en el campo del móvil se avisa
// sin bloquear (igual que en Ajustes › Teléfono); con «los avisos a este
// mismo móvil» marcado sí bloquea, porque ese número se guardaría como el
// WhatsApp del dueño y hay una alternativa clara (desmarcar la casilla).
const AVISO_PARECE_FIJO =
  "Parece el teléfono del local. Necesitamos el móvil en el que usas WhatsApp.";
const ERROR_LINEA_FIJO_CON_AVISOS =
  "Ese número es un fijo y no tiene WhatsApp. Escribe tu móvil o desmarca «Mándame los avisos a este mismo móvil».";
const ERROR_LINEA_VACIA_CON_AVISOS =
  "Escribe el móvil al que te mandamos los avisos o desmarca «Mándame los avisos a este mismo móvil».";

/** Cómo se llama el campo de la línea según la tarjeta elegida. */
const ETIQUETA_DE_LINEA: Record<
  Exclude<CustomerLineType, "alhabla">,
  { label: string; placeholder: string }
> = {
  fijo: { label: "Teléfono fijo del local", placeholder: "930 123 456" },
  movil_trabajo: { label: "Móvil de trabajo", placeholder: "600 123 456" },
  movil_personal: { label: "Tu móvil", placeholder: "600 123 456" },
};

// Cuánto tiempo esperamos a que el navegador resuelva la geolocalización
// antes de rendirnos y mostrar el selector de país como alternativa.
const GEOLOCATION_TIMEOUT_MS = 8_000;

const COUNTRY_OPTIONS = [
  { value: "ES", label: "España" },
  { value: "FR", label: "Francia" },
  { value: "DE", label: "Alemania" },
  { value: "IT", label: "Italia" },
  { value: "PT", label: "Portugal" },
  { value: "NL", label: "Países Bajos" },
  { value: "BE", label: "Bélgica" },
  { value: "AT", label: "Austria" },
  { value: "CH", label: "Suiza" },
  { value: "GB", label: "Reino Unido" },
  { value: "US", label: "Estados Unidos" },
  { value: "MX", label: "México" },
  { value: "OTHER", label: "Otro" },
];

const DAYS: Array<{ key: WeekDay; label: string }> = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

function isBusinessSchedule(value: unknown): value is BusinessSchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BusinessSchedule>;
  return (
    candidate.version === 1 &&
    Boolean(candidate.week) &&
    DAYS.every(({ key }) => Boolean(candidate.week?.[key]))
  );
}

function scheduleSummary(schedule: unknown) {
  if (!isBusinessSchedule(schedule)) return "Horario por defecto";
  return DAYS.map(({ key, label }) => {
    const day = schedule.week[key];
    if (!day.enabled || day.intervals.length === 0) return `${label}: cerrado`;
    return `${label}: ${day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(" · ")}`;
  });
}

function useDebounce<T>(value: T, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

/** Mismo mínimo que la demo de la landing: por debajo, la consulta no
 * significa nada y solo gasta cupo de Places. */
const MINIMO_PARA_BUSCAR = 3;

type LocationStatus = "detecting" | "geolocated" | "fallback";

export default function RegisterBusinessPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [country, setCountry] = useState<string>("ES");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("detecting");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [ownerMobile, setOwnerMobile] = useState("");
  const [ownerMobileError, setOwnerMobileError] = useState("");
  const [ownerMobileAviso, setOwnerMobileAviso] = useState("");
  const [ownerMobileWarning, setOwnerMobileWarning] = useState("");
  // «¿A qué número te llaman tus clientes?» (PLAN-TELEFONIA-UX.md § 5,
  // fase 1): el tipo de la línea, la línea misma (Business.phone) y las dos
  // decisiones que cuelgan de un móvil: avisos al mismo número y privacidad.
  const [tipoDeLinea, setTipoDeLinea] = useState<CustomerLineType | null>(null);
  const [lineaDeClientes, setLineaDeClientes] = useState("");
  const [lineaError, setLineaError] = useState("");
  const [avisosALaLinea, setAvisosALaLinea] = useState(false);
  const [ocultarNumero, setOcultarNumero] = useState(false);
  // En cuanto la persona toca la tarjeta, la línea o las casillas, la
  // propuesta de Google Places deja de pisar lo que ha escrito.
  const [telefoniaTocada, setTelefoniaTocada] = useState(false);
  // Lo que hay escrito en «Tu móvil con WhatsApp» cuando llegan los detalles
  // del negocio (después de un await, el estado de la clausura estaría viejo).
  const ownerMobileRef = useRef(ownerMobile);
  ownerMobileRef.current = ownerMobile;
  // 600 ms y mínimo tres caracteres (los mismos que la demo de la landing):
  // cada pausa al escribir es una búsqueda en Places, que se paga por
  // petición y está limitada por minuto. Buscar desde la primera letra tiraba
  // tres peticiones —"p", "pe", "pel"— antes de que la consulta significara
  // nada, y agotaba el cupo a mitad de escribir el nombre del negocio.
  const debouncedQuery = useDebounce(query, 600);

  // Preferimos geolocalizar al negocio en vez de preguntarle el país: menos
  // fricción y más preciso (sesga la búsqueda a su zona, no a todo un país).
  // Si no hay soporte, el usuario deniega el permiso o el navegador tarda
  // demasiado, caemos al selector de país como alternativa — nunca bloquea
  // la búsqueda.
  useEffect(() => {
    let cancelled = false;

    const fallbackToCountrySelect = () => {
      if (!cancelled) setLocationStatus("fallback");
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fallbackToCountrySelect();
      return;
    }

    const requestPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          setCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setLocationStatus("geolocated");
        },
        () => fallbackToCountrySelect(),
        { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
      );
    };

    // La Permissions API evita reintentar un permiso ya denegado antes (no
    // todos los navegadores la soportan para "geolocation" — Safari no —
    // así que si falta, simplemente pedimos la posición y dejamos que
    // getCurrentPosition gestione el permiso).
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (cancelled) return;
          if (status.state === "denied") {
            fallbackToCountrySelect();
          } else {
            requestPosition();
          }
        })
        .catch(() => requestPosition());
    } else {
      requestPosition();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token =
      window.localStorage.getItem("alhabla_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt");
    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (debouncedQuery.trim().length < MINIMO_PARA_BUSCAR || locationStatus === "detecting") {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const location =
      locationStatus === "geolocated" && coords
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : country !== "OTHER"
          ? { countryCode: country }
          : undefined;

    searchPlaces(debouncedQuery, location)
      .then((places) => {
        if (!cancelled) setResults(places);
      })
      .catch((err) => {
        if (cancelled) return;
        // El límite por minuto se dice tal cual: con el mensaje genérico
        // parecía que la búsqueda estaba rota, no que hubiera que esperar.
        setError(
          esLimiteDePeticiones(err)
            ? "Has hecho muchas búsquedas seguidas. Espera unos segundos y vuelve a probar."
            : "No se pudieron buscar negocios. Inténtalo de nuevo."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, locationStatus, coords, country]);

  const handleSelect = async (place: PlaceSearchResult) => {
    setLoading(true);
    setError("");
    setResults([]);
    setQuery(`${place.name}${place.address ? `, ${place.address}` : ""}`);

    try {
      const details = await getPlaceDetails(place.placeId);
      const detectedType = detectBusinessTypeFromPlaceTypes(details.types);
      window.localStorage.setItem(DETECTED_BUSINESS_TYPE_KEY, detectedType);
      setSelected(details);
      // Google Places propone la línea de clientes: un fijo español es «el
      // fijo del local» y un móvil español, «un móvil de trabajo». Solo
      // mientras la persona no haya elegido nada por su cuenta.
      if (!telefoniaTocada) {
        elegirTipoDeLinea(inferirTipoDeLinea(details.phone));
        setLineaDeClientes(details.phone ?? "");
        setLineaError("");
        // Si la persona ya había escrito su móvil en «Tu móvil con
        // WhatsApp», los avisos van ahí: un móvil en la ficha de Google no
        // puede marcar «a este mismo móvil» y descartar en silencio el que
        // escribió (salvo que sea el mismo número).
        const movilEscrito = ownerMobileRef.current.trim();
        if (
          movilEscrito !== "" &&
          normalizarMovil(movilEscrito) !== normalizarMovil(details.phone ?? "")
        ) {
          setAvisosALaLinea(false);
        }
      }
    } catch {
      setError("No se pudieron cargar los detalles del negocio.");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  // Cambiar de tarjeta repone los valores por defecto de esa tarjeta: en los
  // dos móviles los avisos van al mismo número salvo que se diga lo contrario
  // (PLAN-TELEFONIA-UX.md § 5, fase 1), y la privacidad solo tiene sentido
  // en el personal.
  const elegirTipoDeLinea = (tipo: CustomerLineType | null) => {
    setTipoDeLinea(tipo);
    setAvisosALaLinea(tipo === "movil_trabajo" || tipo === "movil_personal");
    if (tipo !== "movil_personal") setOcultarNumero(false);
  };

  const elegirTipoDeLineaAMano = (tipo: CustomerLineType) => {
    setTelefoniaTocada(true);
    elegirTipoDeLinea(tipo);
  };

  // Vacío = válido (es opcional). Si escribe algo, tiene que ser un móvil;
  // un fijo español pasa, pero se avisa de que ahí no hay WhatsApp.
  const validateOwnerMobile = (value: string): string | null | false => {
    if (value.trim() === "") {
      setOwnerMobileError("");
      setOwnerMobileAviso("");
      return null;
    }
    const normalizado = normalizarMovil(value);
    if (!normalizado) {
      setOwnerMobileError(ERROR_MOVIL_INVALIDO);
      setOwnerMobileAviso("");
      return false;
    }
    setOwnerMobileError("");
    setOwnerMobileAviso(esFijoEspanol(normalizado) ? AVISO_PARECE_FIJO : "");
    return normalizado;
  };

  // La línea de clientes admite fijo o móvil, de España o de fuera: solo se
  // exige que se pueda escribir en E.164, que es lo que guarda el backend.
  const validateLinea = (value: string): string | null | false => {
    if (value.trim() === "") {
      setLineaError("");
      return null;
    }
    const normalizado = normalizarMovil(value);
    if (!normalizado) {
      setLineaError(ERROR_LINEA_INVALIDA);
      return false;
    }
    setLineaError("");
    return normalizado;
  };

  const pideLineaPropia = tipoDeLinea !== null && tipoDeLinea !== "alhabla";
  const lineaEsMovil =
    tipoDeLinea === "movil_trabajo" || tipoDeLinea === "movil_personal";
  const avisosAlMismoMovil = lineaEsMovil && avisosALaLinea;

  const ownerMobileIsValid =
    ownerMobile.trim() === "" || normalizarMovil(ownerMobile) !== null;
  // Derivado en cada render, no en el blur: cambiar de tarjeta o marcar la
  // casilla con un fijo ya escrito tiene que bloquear al instante.
  const lineaNormalizada = normalizarMovil(lineaDeClientes);
  const lineaFijoError =
    avisosAlMismoMovil &&
    lineaNormalizada !== null &&
    esFijoEspanol(lineaNormalizada)
      ? ERROR_LINEA_FIJO_CON_AVISOS
      : "";
  const lineaIsValid =
    !pideLineaPropia ||
    ((lineaDeClientes.trim() === "" || lineaNormalizada !== null) &&
      !lineaFijoError);
  const lineaErrorVisible = lineaError || lineaFijoError;
  // Con los avisos al mismo móvil el campo del móvil no se ve: lo que quedara
  // escrito en él no puede bloquear los botones.
  const formularioValido =
    lineaIsValid && (avisosAlMismoMovil || ownerMobileIsValid);

  /**
   * Los campos de telefonía del PATCH y el móvil del dueño que toca activar.
   * `false` si algo escrito no vale (el error ya está a la vista). Sin
   * tarjeta elegida no se manda nada de telefonía: el negocio se queda con
   * `customerLineType` null y la tarjeta de desvío lo preguntará.
   */
  const construirTelefonia = ():
    | { campos: Partial<Business>; movil: string | null }
    | false => {
    const linea = pideLineaPropia ? validateLinea(lineaDeClientes) : null;
    if (linea === false) return false;

    const campos: Partial<Business> = {};
    if (tipoDeLinea) {
      campos.customerLineType = tipoDeLinea;
      campos.ownerPhoneIsCustomerLine = avisosAlMismoMovil;
      campos.hideOwnerNumberFromClients =
        tipoDeLinea === "movil_personal" && ocultarNumero;
      if (linea) campos.phone = linea;
    }

    if (avisosAlMismoMovil) {
      // La casilla promete avisos a «este mismo móvil»: sin número no hay a
      // quién avisar, y con un fijo tampoco (el error ya está a la vista).
      if (!linea) {
        setLineaError(ERROR_LINEA_VACIA_CON_AVISOS);
        return false;
      }
      if (esFijoEspanol(linea)) return false;
      return { campos, movil: linea };
    }
    const movil = validateOwnerMobile(ownerMobile);
    if (movil === false) return false;
    return { campos, movil };
  };

  /**
   * Guarda el móvil junto al resto de datos y pide la activación. Devuelve
   * `false` si el backend aún no conoce el campo (despliegue escalonado:
   * Vercel publica antes que Cloud Run): entonces se avisa y se sigue.
   */
  const saveAndActivate = async (
    payload: Parameters<typeof updateMyBusiness>[0],
    movil: string | null
  ) => {
    const updated = await updateMyBusiness({
      ...payload,
      ...(movil ? { ownerWhatsappNumber: movil } : {}),
    });
    if (!movil) return true;
    if (updated.ownerWhatsappNumber !== movil) return false;
    await sendOwnerWhatsappActivation().catch(() => undefined);
    return true;
  };

  const handleSaveError = (err: unknown) => {
    if (apiErrorCode(err) === "OWNER_WHATSAPP_IS_ALHABLA") {
      const texto = describeApiError(
        err,
        "Ese número es el de Alhabla. Escribe tu propio móvil."
      );
      // Con los avisos al mismo móvil, el móvil rechazado es la línea de
      // clientes: el error va bajo el campo que sí está a la vista.
      if (avisosAlMismoMovil) {
        setLineaError(texto);
      } else {
        setOwnerMobileError(texto);
      }
      return;
    }
    setError(
      "No se pudo guardar la información del negocio. Inténtalo de nuevo."
    );
  };

  const continueAfterMobileWarning = () => {
    setOwnerMobileWarning(AVISO_MOVIL_NO_GUARDADO);
    window.setTimeout(redirectToNextStep, AVISO_MOVIL_NO_GUARDADO_MS);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    const telefonia = construirTelefonia();
    if (!telefonia) return;

    setSaving(true);
    setError("");

    try {
      const businessDetails = [selected.name, selected.address]
        .filter(Boolean)
        .join("\n");

      // placeId y dirección van aparte de businessDetails: el backend los
      // usa para el botón «Cómo llegar» de la confirmación al cliente.
      const movilGuardado = await saveAndActivate(
        {
          name: selected.name,
          businessDetails,
          schedule: selected.schedule,
          placeId: selected.placeId,
          address: selected.address || null,
          ...telefonia.campos,
        },
        telefonia.movil
      );

      // Mientras se avisa (4 s) o se redirige, los botones siguen bloqueados:
      // si se soltaran, un segundo clic repetiría el PATCH y la activación.
      if (!movilGuardado) {
        continueAfterMobileWarning();
        return;
      }
      redirectToNextStep();
    } catch (err) {
      handleSaveError(err);
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    const telefonia = construirTelefonia();
    if (!telefonia) return;
    if (!telefonia.movil && Object.keys(telefonia.campos).length === 0) {
      redirectToNextStep();
      return;
    }

    // Sin negocio elegido solo se guarda la telefonía y el móvil; si eso
    // falla, se enseña el error y NO se redirige: la persona lo escribió
    // para algo.
    setSaving(true);
    setError("");
    try {
      const movilGuardado = await saveAndActivate(
        telefonia.campos,
        telefonia.movil
      );
      if (!movilGuardado) {
        continueAfterMobileWarning();
        return;
      }
      redirectToNextStep();
    } catch (err) {
      handleSaveError(err);
      setSaving(false);
    }
  };

  const redirectToNextStep = () => {
    const hasSchedule = isBusinessSchedule(selected?.schedule);
    if (hasSchedule) {
      window.localStorage.setItem("alhabla_place_schedule_imported", "true");
    } else {
      window.localStorage.removeItem("alhabla_place_schedule_imported");
    }

    const planFromUrl = new URLSearchParams(window.location.search).get("plan");
    const pendingPlan = consumePendingPlan();
    const selectedPlan = isPlanId(planFromUrl) ? planFromUrl : pendingPlan;

    const params = new URLSearchParams();
    if (selectedPlan) {
      params.set("plan", selectedPlan);
    }
    if (hasSchedule) {
      params.set("hasPlaceSchedule", "true");
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `/bienvenida/niche${query}`;
  };

  const summary = selected ? scheduleSummary(selected.schedule) : [];
  const summaryLines = Array.isArray(summary) ? summary : [];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <LottieAnimation
            src="/animations/landing/GoogleMaposIcon.json"
            className="mx-auto h-16 w-16"
          />
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            ¿Cuál es tu negocio?
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Busca tu negocio para rellenar automáticamente dirección, teléfono y
            horario. Puedes cambiarlo luego en ajustes.
          </p>
        </div>

        {locationStatus === "detecting" ? (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin text-[#8b5cf6]" />
            Detectando tu ubicación para buscar cerca de ti…
          </div>
        ) : locationStatus === "fallback" ? (
          <div className="mt-8">
            <label htmlFor="register-business-country" className="text-sm font-medium text-[#27272a]">
              País del negocio
            </label>
            <select
              id="register-business-country"
              className="field mt-2 w-full"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setSelected(null);
              }}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              No pudimos usar tu ubicación. Elige el país para buscar tu negocio.
            </p>
          </div>
        ) : null}

        <div className="relative mt-4">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5 text-[#a1a1aa]" />
          </div>
          {/* El placeholder desaparece al escribir y no lo anuncia ningún
              lector de pantalla: la etiqueta va aparte, oculta a la vista
              porque el título de la pantalla ya explica qué se busca aquí. */}
          <label htmlFor="register-business-search" className="sr-only">
            Busca tu negocio por nombre o dirección
          </label>
          <input
            id="register-business-search"
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) setSelected(null);
            }}
            placeholder="Nombre del negocio o dirección"
            className="field w-full pl-10"
          />
          {loading && !selected && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <LoaderCircle className="h-5 w-5 animate-spin text-[#8b5cf6]" />
            </div>
          )}

          {results.length > 0 && !selected && (
            <ul className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[#e5e5e5] bg-white shadow-lg">
              {results.map((place) => (
                <li key={place.placeId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(place)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
                  >
                    {place.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagen remota de Google Places, tamaño dinámico por resultado.
                      <img
                        src={place.photoUrl}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                        <Building2 className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#27272a]">
                        {place.name}
                      </p>
                      {place.address && (
                        <p className="mt-0.5 truncate text-xs leading-5 text-muted">{place.address}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="mt-6 space-y-4 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-5">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-[#8b5cf6]" />
              <div>
                <p className="text-sm font-semibold text-[#27272a]">
                  {selected.name}
                </p>
                {selected.address && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {selected.address}
                  </p>
                )}
                {selected.phone && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {selected.phone}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-[#8b5cf6]" />
              <div className="text-sm text-muted">
                {summaryLines.length > 0 ? (
                  <ul className="space-y-0.5">
                    {summaryLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Horario no disponible</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[#e5e5e5] p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <PhoneForwarded className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3
                id="register-customer-line-title"
                className="text-sm font-semibold text-[#27272a]"
              >
                ¿A qué número te llaman tus clientes?
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted">
                Es la línea que desviarás a tu recepcionista y la que ella dará
                a tus clientes para cambiar o anular una cita.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <TarjetasDeLinea
              name="register-customer-line"
              value={tipoDeLinea}
              onChange={elegirTipoDeLineaAMano}
              aria-labelledby="register-customer-line-title"
            />
          </div>

          {tipoDeLinea !== null && tipoDeLinea !== "alhabla" ? (
            <div className="mt-4">
              <label
                htmlFor="register-customer-line-number"
                className="text-sm font-semibold text-[#27272a]"
              >
                {ETIQUETA_DE_LINEA[tipoDeLinea].label}
              </label>
              <input
                id="register-customer-line-number"
                type="tel"
                inputMode="tel"
                value={lineaDeClientes}
                onChange={(event) => {
                  setTelefoniaTocada(true);
                  setLineaDeClientes(event.target.value);
                  if (lineaError) setLineaError("");
                }}
                onBlur={() => validateLinea(lineaDeClientes)}
                placeholder={ETIQUETA_DE_LINEA[tipoDeLinea].placeholder}
                aria-describedby={
                  lineaErrorVisible ? "register-customer-line-error" : undefined
                }
                aria-invalid={Boolean(lineaErrorVisible)}
                className="field mt-2 w-full"
              />
              {lineaErrorVisible ? (
                <p
                  id="register-customer-line-error"
                  className="mt-1 text-xs leading-5 text-[#c53030]"
                >
                  {lineaErrorVisible}
                </p>
              ) : null}
            </div>
          ) : null}

          {lineaEsMovil ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={avisosALaLinea}
                onChange={(event) => {
                  setTelefoniaTocada(true);
                  setAvisosALaLinea(event.target.checked);
                  // El error «…o desmarca la casilla» deja de tener sentido.
                  if (lineaError) setLineaError("");
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d4d4d8] text-[#8b5cf6] focus:ring-[#8b5cf6]"
              />
              <span className="text-sm text-[#27272a]">
                Mándame los avisos a este mismo móvil
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  Cada reserva y cada recado te llegarán por WhatsApp a ese
                  número.
                </span>
              </span>
            </label>
          ) : null}

          {tipoDeLinea === "movil_personal" ? (
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={ocultarNumero}
                onChange={(event) => {
                  setTelefoniaTocada(true);
                  setOcultarNumero(event.target.checked);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d4d4d8] text-[#8b5cf6] focus:ring-[#8b5cf6]"
              />
              <span className="text-sm text-[#27272a]">
                No des mi número a los clientes
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  Tu recepcionista no lo dirá: que dejen recado y les llamas
                  tú.
                </span>
              </span>
            </label>
          ) : null}

          {tipoDeLinea === "alhabla" ? (
            <p className="mt-4 rounded-2xl bg-[#f3eeff] px-4 py-3 text-xs leading-5 text-[#6d28d9]">
              Al elegir tu plan te damos un número español. Publícalo como el
              teléfono de tu negocio y tu recepcionista atenderá todas las
              llamadas: no hay nada que desviar.
            </p>
          ) : null}
        </div>

        {avisosAlMismoMovil ? null : (
          <div className="mt-6 rounded-2xl border border-[#e5e5e5] p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="register-owner-mobile"
                  className="text-sm font-semibold text-[#27272a]"
                >
                  Tu móvil con WhatsApp (opcional)
                </label>
                <input
                  id="register-owner-mobile"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={ownerMobile}
                  onChange={(event) => {
                    setOwnerMobile(event.target.value);
                    if (ownerMobileError) setOwnerMobileError("");
                    if (ownerMobileAviso) setOwnerMobileAviso("");
                  }}
                  onBlur={() => validateOwnerMobile(ownerMobile)}
                  placeholder="600 123 456"
                  aria-describedby={
                    ownerMobileError
                      ? "register-owner-mobile-hint register-owner-mobile-error"
                      : "register-owner-mobile-hint"
                  }
                  aria-invalid={Boolean(ownerMobileError)}
                  className="field mt-2 w-full"
                />
                <p
                  id="register-owner-mobile-hint"
                  className="mt-1 text-xs leading-5 text-muted"
                >
                  Aquí te avisará la recepcionista de cada reserva y recado. Es tu
                  móvil, no el teléfono del local. Puedes añadirlo o cambiarlo más
                  tarde en Ajustes.
                </p>
                {ownerMobileError ? (
                  <p
                    id="register-owner-mobile-error"
                    className="mt-1 text-xs leading-5 text-[#c53030]"
                  >
                    {ownerMobileError}
                  </p>
                ) : ownerMobileAviso ? (
                  <p
                    id="register-owner-mobile-aviso"
                    className="mt-1 text-xs leading-5 text-[#9f7a15]"
                  >
                    {ownerMobileAviso}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Fuera del bloque del móvil, que con «los avisos a este mismo móvil»
            no se monta: el aviso tiene que verse en los dos casos. Siempre
            montada para que el lector de pantalla lo anuncie cuando aparece
            (una región aria-live que nace con texto no se anuncia). */}
        <p
          id="register-owner-mobile-warning"
          className={
            ownerMobileWarning
              ? "mt-4 text-sm leading-6 text-[#9f7a15]"
              : "sr-only"
          }
          aria-live="polite"
        >
          {ownerMobileWarning}
        </p>

        {error && <p className="mt-4 text-sm text-[#c53030]">{error}</p>}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || saving || !formularioValido}
            className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Confirmar y continuar"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving || !formularioValido}
            className="btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            No encontré mi negocio / configurar después
          </button>
        </div>
      </div>
    </div>
  );
}
