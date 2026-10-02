"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  MailCheck,
  Palette,
} from "lucide-react";
import { SelectorDeTema } from "@/components/selector-de-tema";
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
        <div className="flex items-start gap-3 border-b border-linea p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="account-title"
              className="text-lg font-semibold text-tinta"
            >
              Cuenta
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Tu identidad de acceso a Alhabla.
            </p>
          </div>
        </div>
        <div className="divide-y divide-linea">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tinta-2">
                Correo electrónico
              </p>
              <p className="mt-1 text-sm text-tinta [overflow-wrap:anywhere]">
                {account.email}
              </p>
            </div>
            {account.googleConnected ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-exito-fondo px-3 py-1.5 text-xs font-semibold text-exito ring-1 ring-inset ring-exito-borde">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                Verificado por Google
              </span>
            ) : (
              <span className="inline-flex w-fit rounded-full bg-aviso-fondo px-3 py-1.5 text-xs font-semibold text-aviso ring-1 ring-inset ring-aviso-borde">
                Verificación pendiente
              </span>
            )}
          </div>
          {/* La acción real queda trazada en GitHub #23. Hasta entonces no se
              simula una verificación que el servidor aún no puede probar. */}
          {!account.googleConnected ? (
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-tinta-2">
                  Verificación del correo
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Próximamente podrás verificar esta dirección para reforzar la
                  recuperación de la cuenta.
                </p>
              </div>
              {/* Etiqueta y no botón deshabilitado: un control muerto con un
                  «title» se lee como roto y el aviso no llega en táctil. */}
              <span className="inline-flex w-fit shrink-0 rounded-full bg-relleno-fuerte px-3 py-1.5 text-xs font-semibold text-apagado ring-1 ring-inset ring-linea">
                Próximamente
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="apariencia-title">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
              <Palette className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="apariencia-title" className="text-lg font-semibold text-tinta">
                Apariencia
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Con «Sistema», el panel se pone en oscuro cuando tu ordenador lo está.
              </p>
            </div>
          </div>
          <SelectorDeTema className="w-full sm:w-auto sm:min-w-[22rem]" />
        </div>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="access-title">
        <div className="flex items-start gap-3 border-b border-linea p-4 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="access-title"
              className="text-lg font-semibold text-tinta"
            >
              Acceso y ayuda
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Atajos para gestionar la sesión, el plan y tus derechos.
            </p>
          </div>
        </div>
        <div className="divide-y divide-linea">
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
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-morado sm:px-6"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-tinta-2">
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
      className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-morado sm:px-6"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-tinta-2">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
    </Link>
  );
}
