"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Save } from "lucide-react";
import {
  FeedbackMessage,
  useAjustes,
  type Feedback,
} from "@/components/ajustes/marco-de-ajustes";
import { updateMyBusiness } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  isBusinessType,
} from "@/lib/business-type";
import type { BusinessType } from "@/lib/types";

/** Ajustes › Negocio: nombre, dirección y sector. Los teléfonos van en
 * Ajustes › Teléfono (PLAN-TELEFONIA-UX.md § 5, fase 2). */
export function SeccionNegocio() {
  const { business } = useAjustes();
  const queryClient = useQueryClient();
  const [businessProfile, setBusinessProfile] = useState<{
    name: string;
    address: string;
    businessType: BusinessType | "";
  }>({ name: "", address: "", businessType: "" });
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setBusinessProfile({
      name: business.name,
      address: business.address ?? "",
      businessType: isBusinessType(business.businessType)
        ? business.businessType
        : "",
    });
  }, [business]);

  // Guardar solo tiene sentido si algo cambió (igual que en «Teléfono»).
  const hayCambios =
    businessProfile.name.trim() !== business.name ||
    businessProfile.address.trim() !== (business.address ?? "") ||
    (businessProfile.businessType !== "" &&
      businessProfile.businessType !== business.businessType);

  const profileMutation = useMutation({
    mutationFn: () => {
      // Dirección y sector solo se mandan si cambian: el sector renombra al
      // agente y resincroniza el prompt.
      const address = businessProfile.address.trim();
      const sector = businessProfile.businessType;
      return updateMyBusiness({
        name: businessProfile.name.trim(),
        ...(address !== (business.address ?? "")
          ? { address: address || null }
          : {}),
        ...(sector && sector !== business.businessType
          ? { businessType: sector }
          : {}),
      });
    },
    onSuccess: (updatedBusiness) => {
      queryClient.setQueryData(["my-business"], updatedBusiness);
      setProfileFeedback({
        type: "success",
        message: "Datos del negocio actualizados.",
      });
    },
    onError: (error) =>
      setProfileFeedback({
        type: "error",
        message: describeApiError(
          error,
          "No se pudieron guardar los datos del negocio."
        ),
      }),
  });

  return (
    <section className="panel p-4 sm:p-6" aria-labelledby="business-title">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="business-title"
            className="text-lg font-semibold text-[#0a0a0a]"
          >
            Datos del negocio
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            El nombre que ves en el panel, la dirección y el sector. Los
            teléfonos están en la pestaña «Teléfono».
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-semibold text-[#27272a]">
          Nombre del negocio
          <input
            value={businessProfile.name}
            onChange={(event) => {
              setProfileFeedback(null);
              setBusinessProfile((current) => ({
                ...current,
                name: event.target.value,
              }));
            }}
            autoComplete="organization"
            maxLength={80}
            aria-describedby="settings-business-name-hint"
            className="field mt-2 w-full"
          />
          <span
            id="settings-business-name-hint"
            className="mt-1 block text-xs font-normal leading-5 text-muted"
          >
            Así se presenta tu recepcionista al contestar llamadas. Por defecto es el
            nombre que trajimos de Google al configurar tu negocio.
          </span>
        </label>
        <label className="text-sm font-semibold text-[#27272a]">
          Sector
          <select
            value={businessProfile.businessType}
            onChange={(event) => {
              setProfileFeedback(null);
              setBusinessProfile((current) => ({
                ...current,
                businessType: isBusinessType(event.target.value)
                  ? event.target.value
                  : "",
              }));
            }}
            aria-describedby="settings-business-type-hint"
            className="field mt-2 w-full"
          >
            <option value="">Sin especificar</option>
            {BUSINESS_TYPES.map((tipo) => (
              <option key={tipo} value={tipo}>
                {BUSINESS_TYPE_LABELS[tipo]}
              </option>
            ))}
          </select>
          <span
            id="settings-business-type-hint"
            className="mt-1 block text-xs font-normal leading-5 text-muted"
          >
            Ajusta cómo se presenta la recepcionista y qué servicios propone.
          </span>
        </label>
        <label className="text-sm font-semibold text-[#27272a] lg:col-span-2">
          Dirección
          <input
            value={businessProfile.address}
            onChange={(event) => {
              setProfileFeedback(null);
              setBusinessProfile((current) => ({
                ...current,
                address: event.target.value,
              }));
            }}
            autoComplete="street-address"
            maxLength={500}
            aria-describedby="settings-business-address-hint"
            className="field mt-2 w-full"
            placeholder="Calle Mayor 12, 28013 Madrid"
          />
          <span
            id="settings-business-address-hint"
            className="mt-1 block text-xs font-normal leading-5 text-muted"
          >
            La que trajimos de Google. Alimenta el botón «Cómo llegar» de la
            confirmación por WhatsApp.
          </span>
        </label>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#e5e5e5] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <FeedbackMessage value={profileFeedback} />
        <button
          type="button"
          onClick={() => profileMutation.mutate()}
          disabled={
            profileMutation.isPending ||
            !businessProfile.name.trim() ||
            !hayCambios
          }
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
  );
}
