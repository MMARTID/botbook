"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  Globe,
  Headset,
  Loader2,
  MapPin,
  MessageCircle,
  PhoneForwarded,
  Share2,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_AGENT_SETTINGS } from "@/components/agent-settings-editor";
import { AppPageHeader } from "@/components/app-page-header";
import {
  CODIGOS_FIJO,
  CODIGOS_MOVIL,
  CodigoFila,
} from "@/components/call-forwarding-card";
import { PasarLlamadas } from "@/components/pasar-llamadas";
import { useBusiness } from "@/components/providers";
import { getPhoneNumberInfo, updateMyBusiness } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { formatPhone } from "@/lib/format";
import {
  hayMovilParaPasarLlamadas,
  modoDePasarLlamadasPorDefecto,
} from "@/lib/pasar-llamadas";
import {
  TEXTO_SIN_MOVIL,
  TEXTO_SIN_NUMERO,
  TEXTO_YA_ES_PRINCIPAL,
} from "@/lib/numero-principal";
import type { Business, ModoDePasarLlamadas } from "@/lib/types";

const SITIOS_DONDE_PUBLICAR: ReadonlyArray<{
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
}> = [
  {
    icon: MapPin,
    titulo: "Google (Perfil de Empresa)",
    descripcion:
      "Es donde más te llaman. En tu Perfil de Empresa, cambia el teléfono principal por el de Alhabla.",
  },
  {
    icon: Globe,
    titulo: "Tu web",
    descripcion:
      "En la cabecera, el pie y la página de contacto; también en el botón de «Llamar» del móvil.",
  },
  {
    icon: Share2,
    titulo: "Redes sociales",
    descripcion:
      "Instagram, Facebook y TikTok: el teléfono del perfil y el botón de contacto.",
  },
  {
    icon: MessageCircle,
    titulo: "WhatsApp Business",
    descripcion:
      "Tu WhatsApp sigue en tu móvil. Añade el de Alhabla como «otro teléfono» en la información del negocio.",
  },
];

function lineaPropia(business: Business, numeroDeAlhabla: string | null) {
  if (business.phone.startsWith("TEMP-")) return null;
  return numeroDeAlhabla !== null && business.phone === numeroDeAlhabla
    ? null
    : business.phone;
}

/**
 * «Usar Alhabla como número principal» (PLAN-TELEFONIA-UX.md § 5, fase 4):
 * qué cambia, dónde publicar el número, qué hacer con el antiguo y cuándo
 * pasar llamadas al móvil del dueño. Al confirmar hace lo mismo que hacía el
 * botón de Ajustes › Teléfono (customerLineType = "alhabla" y phone = número
 * de Alhabla) y guarda el ajuste de transferencia; luego vuelve a Ajustes.
 */
export default function NumeroPrincipalPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const phoneQuery = useQuery({
    queryKey: ["phone-number"],
    queryFn: getPhoneNumberInfo,
    enabled: hasToken === true,
  });

  const numeroDeAlhabla =
    phoneQuery.data?.status === "active"
      ? (phoneQuery.data.phoneNumber ?? null)
      : null;
  const hayMovil = business
    ? hayMovilParaPasarLlamadas(business, numeroDeAlhabla)
    : false;
  const modoPorDefecto = business
    ? modoDePasarLlamadasPorDefecto(
        { ...business, customerLineType: "alhabla" },
        numeroDeAlhabla
      )
    : "nunca";
  const [modo, setModo] = useState<ModoDePasarLlamadas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const modoElegido =
    modo ?? business?.agentSettings?.pasarLlamadas ?? modoPorDefecto;

  // Si el móvil se añade en otra pestaña mientras esta está abierta, el
  // modo por defecto cambia; lo elegido a mano se respeta.
  useEffect(() => {
    if (!hayMovil) setModo(null);
  }, [hayMovil]);

  const confirmarMutation = useMutation({
    mutationFn: async () => {
      if (!business || !numeroDeAlhabla) {
        throw new Error("Falta el número de Alhabla.");
      }
      return updateMyBusiness({
        customerLineType: "alhabla",
        phone: numeroDeAlhabla,
        // Los avisos no pueden ir al número de Alhabla: el móvil del dueño
        // se queda como está, pero deja de «ser la línea de clientes».
        ...(business.ownerPhoneIsCustomerLine
          ? { ownerPhoneIsCustomerLine: false }
          : {}),
        agentSettings: {
          ...DEFAULT_AGENT_SETTINGS,
          ...business.agentSettings,
          pasarLlamadas: modoElegido,
        },
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["my-business"], updated);
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      router.push("/ajustes#telefono");
    },
    onError: (err) =>
      setError(describeApiError(err, "No se pudo guardar el cambio.")),
  });

  const copiar = async (valor: string, id: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(id);
      window.setTimeout(
        () => setCopiado((actual) => (actual === id ? null : actual)),
        2000
      );
    } catch {
      // Portapapeles bloqueado: el número está a la vista.
      setCopiado(null);
    }
  };

  if (isLoadingBusiness || phoneQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando…
      </div>
    );
  }

  if (hasToken === false) return null;

  if (!business) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">
          No se pudo cargar tu negocio
        </h1>
        <p className="text-sm leading-6 text-muted">
          Comprueba tu conexión y vuelve a intentarlo.
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

  const yaEsPrincipal = business.customerLineType === "alhabla";
  const lineaAntigua = lineaPropia(business, numeroDeAlhabla);
  const tipoAntiguo = business.customerLineType;
  const codigoTodas =
    tipoAntiguo === "fijo"
      ? CODIGOS_FIJO.find((codigo) => codigo.id === "fijo-todas")
      : tipoAntiguo === "movil_trabajo" || tipoAntiguo === "movil_personal"
        ? CODIGOS_MOVIL.find((codigo) => codigo.id === "todas")
        : null;
  const puedeConfirmar = !yaEsPrincipal && numeroDeAlhabla !== null && hayMovil;

  return (
    <section className="space-y-6">
      <AppPageHeader
        icon={Headset}
        title="Usar Alhabla como número principal"
        description="Publicas el número de Alhabla como teléfono del negocio. Tu recepcionista lo atiende todo, sin desvío, y te pasa las llamadas que haga falta."
      >
        <Link href="/ajustes#telefono" className="btn-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a Ajustes
        </Link>
      </AppPageHeader>

      {yaEsPrincipal ? (
        <Aviso tono="ok">{TEXTO_YA_ES_PRINCIPAL}</Aviso>
      ) : numeroDeAlhabla === null ? (
        <Aviso tono="warning">{TEXTO_SIN_NUMERO}</Aviso>
      ) : null}

      <Panel
        id="que-cambia"
        icon={Headset}
        titulo="Qué cambia"
        descripcion="Lo que hace tu recepcionista cuando el de Alhabla es tu número."
      >
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#27272a]">
          <li>
            Atiende todas las llamadas que entren por el número de Alhabla, a
            cualquier hora. No hay desvío que activar ni contestador que se
            quede las llamadas.
          </li>
          <li>
            Es el número que da a tus clientes para cambiar o anular una cita, y
            el que ponemos en los mensajes de confirmación.
          </li>
          <li>
            Si alguien quiere hablar contigo, te pasa la llamada a tu móvil
            según el ajuste de abajo. Si no la coges, toma recado y te avisa por
            WhatsApp.
          </li>
        </ul>
        {numeroDeAlhabla ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-muted">Tu número de Alhabla</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#0a0a0a]">
                {formatPhone(numeroDeAlhabla)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copiar(numeroDeAlhabla, "numero")}
              className="btn-secondary shrink-0"
              aria-label={`Copiar el número ${numeroDeAlhabla}`}
            >
              {copiado === "numero" ? (
                <Check className="h-4 w-4 text-[#2c7334]" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copiado === "numero" ? "Copiado" : "Copiar número"}
            </button>
          </div>
        ) : null}
      </Panel>

      <Panel
        id="donde-publicarlo"
        icon={MapPin}
        titulo="Dónde publicarlo"
        descripcion="Donde hoy aparece tu teléfono tiene que aparecer el de Alhabla."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {SITIOS_DONDE_PUBLICAR.map(({ icon: Icon, titulo, descripcion }) => (
            <li
              key={titulo}
              className="flex items-start gap-3 rounded-2xl border border-[#e5e5e5] p-3.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0a0a0a]">
                  {titulo}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  {descripcion}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-5 text-muted">
          También en tarjetas, escaparate y cualquier folleto. Un número de tu
          provincia inspira más confianza: si el tuyo no lo es, dínoslo antes de
          publicarlo.
        </p>
      </Panel>

      {lineaAntigua ? (
        <Panel
          id="numero-antiguo"
          icon={PhoneForwarded}
          titulo="Qué hacer con tu número de siempre"
          descripcion={`Tus clientes seguirán llamando al ${formatPhone(lineaAntigua)} una temporada.`}
        >
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#27272a]">
            <li>
              <span className="font-semibold">Mantenlo con desvío «todas»</span>{" "}
              mientras dure el cambio: cada llamada al número antiguo entra
              directa en tu recepcionista, sin que suene en el local.
            </li>
            <li>
              <span className="font-semibold">Dalo de baja</span> cuando lleve
              un tiempo sin recibir llamadas y el de Alhabla esté publicado en
              todas partes.
            </li>
          </ul>
          {codigoTodas && numeroDeAlhabla ? (
            <CodigoFila
              codigo={codigoTodas}
              numero={numeroDeAlhabla}
              copiado={copiado}
              onCopiar={copiar}
            />
          ) : null}
        </Panel>
      ) : null}

      <Panel
        id="pasar-llamadas"
        icon={Smartphone}
        titulo="Cuándo pasarme llamadas"
        descripcion={
          hayMovil && business.ownerWhatsappNumber
            ? `Tu recepcionista puede pasar la llamada a tu móvil (${formatPhone(business.ownerWhatsappNumber)}). Si no la coges, retoma ella y toma recado.`
            : "Tu recepcionista puede pasar la llamada a tu móvil. Si no la coges, retoma ella y toma recado."
        }
      >
        {hayMovil ? (
          <>
            <p id="numero-principal-pasar-title" className="sr-only">
              Cuándo pasarme llamadas
            </p>
            <PasarLlamadas
              name="numero-principal-pasar"
              value={modoElegido}
              onChange={(nuevo) => {
                setModo(nuevo);
                setError(null);
              }}
              disabled={confirmarMutation.isPending || yaEsPrincipal}
              aria-labelledby="numero-principal-pasar-title"
            />
          </>
        ) : (
          <Aviso tono="warning">
            <span className="block">{TEXTO_SIN_MOVIL}</span>
            <Link
              href="/ajustes#whatsapp"
              className="mt-2 inline-block text-sm font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              Añadir mi móvil
            </Link>
          </Aviso>
        )}
      </Panel>

      {!yaEsPrincipal ? (
        <div className="panel p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted">
              Al confirmar, tu teléfono pasa a ser el número de Alhabla y deja
              de hacer falta el desvío. Puedes volver atrás desde Ajustes ›
              Teléfono cuando quieras.
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                confirmarMutation.mutate();
              }}
              disabled={!puedeConfirmar || confirmarMutation.isPending}
              className="btn-purple shrink-0"
            >
              {confirmarMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Headset className="h-4 w-4" aria-hidden="true" />
              )}
              {confirmarMutation.isPending
                ? "Guardando…"
                : "Usar Alhabla como número principal"}
            </button>
          </div>
          {error ? (
            <p aria-live="polite" className="mt-3 text-sm text-[#c53030]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Panel({
  id,
  icon: Icon,
  titulo,
  descripcion,
  children,
}: {
  id: string;
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <section className="panel p-4 sm:p-6" aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="text-lg font-semibold text-[#0a0a0a]"
          >
            {titulo}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">{descripcion}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Aviso({
  tono,
  children,
}: {
  tono: "ok" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
        tono === "ok"
          ? "bg-[#ecf7ec] text-[#2c7334]"
          : "bg-[#fef8e7] text-[#9f7a15]"
      }`}
    >
      {children}
    </div>
  );
}
