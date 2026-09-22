"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  MailCheck,
} from "lucide-react";
import { useAjustes } from "@/components/ajustes/marco-de-ajustes";
import { clearAuthTokens } from "@/lib/billing-navigation";
import { webUrl } from "@/lib/web-url";

/** Ajustes › Cuenta: correo de acceso, plan y sesión. */
export function SeccionCuenta() {
  const { account } = useAjustes();

  return (
    <>
      <section
        className="panel overflow-hidden"
        aria-labelledby="account-title"
      >
        <div className="flex items-start gap-3 border-b border-[#e5e5e5] p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="account-title"
              className="text-lg font-semibold text-[#0a0a0a]"
            >
              Cuenta
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Tu identidad de acceso a Alhabla.
            </p>
          </div>
        </div>
        <div className="divide-y divide-[#e5e5e5]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-sm font-semibold text-[#27272a]">
                Correo electrónico
              </p>
              <p className="mt-1 text-sm text-muted">{account.email}</p>
            </div>
            {account.googleConnected ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecf7ec] px-3 py-1.5 text-xs font-semibold text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                Verificado por Google
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
                <p className="text-sm font-semibold text-[#27272a]">
                  Verificación del correo
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Próximamente podrás verificar esta dirección para reforzar la
                  recuperación de la cuenta.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="btn-secondary h-11 shrink-0 px-4"
                title="Disponible próximamente"
              >
                Verificar correo
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="access-title">
        <div className="flex items-start gap-3 border-b border-[#e5e5e5] p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="access-title"
              className="text-lg font-semibold text-[#0a0a0a]"
            >
              Acceso y ayuda
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Atajos para gestionar la sesión, el plan y tus derechos.
            </p>
          </div>
        </div>
        <div className="divide-y divide-[#e5e5e5]">
          <SettingsLink
            href="/ajustes/facturacion"
            icon={CreditCard}
            title="Plan y facturación"
            description="Consulta el consumo, las facturas y tu suscripción."
          />
          <SettingsLink
            href={webUrl("/legal/privacidad")}
            icon={LifeBuoy}
            title="Privacidad y datos"
            description="Revisa cómo tratamos los datos y tus derechos."
          />
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
              <span className="block text-sm font-semibold text-[#27272a]">
                Cerrar sesión en este dispositivo
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">
                Volverás a la pantalla de acceso.
              </span>
            </span>
          </button>
        </div>
      </section>
    </>
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
        <span className="block text-sm font-semibold text-[#27272a]">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
    </Link>
  );
}
