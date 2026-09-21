import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness } from "../helpers/fixtures.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  handleCallAnswered,
  handleCallHangup,
  handleCallInitiated,
} from "../../../src/adapters/telnyx/webhookHandlers.js";
import {
  iniciarComprobacionDeDesvio,
  leerClientStateDeComprobacion,
  obtenerComprobacionDeDesvio,
} from "../../../src/modules/onboarding/comprobacionDesvio.js";

// Contra Postgres y Redis reales: lo que se prueba es el flujo completo de
// «Comprobar desvío» (PLAN-TELEFONIA-UX.md § 4) con los webhooks de Telnyx
// simulados. Solo se sustituye la API de Telnyx (originar y colgar).
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    dialCall: vi.fn(),
    hangupCall: vi.fn(),
    answerCallWithAssistant: vi.fn(),
    startNoiseSuppression: vi.fn(),
  },
}));

const mockedDialCall = vi.mocked(telnyxAiAdapter.dialCall);
const mockedHangupCall = vi.mocked(telnyxAiAdapter.hangupCall);
const mockedAnswer = vi.mocked(telnyxAiAdapter.answerCallWithAssistant);

const ALHABLA = "+34930453218";
const LINEA = "+34931112233";

function salienteIniciada(clientState: string) {
  return {
    data: {
      id: `evt_out_${Math.random()}`,
      event_type: "call.initiated",
      payload: {
        call_control_id: "call_ctrl_out",
        direction: "outgoing",
        from: ALHABLA,
        to: LINEA,
        client_state: clientState,
      },
    },
  };
}

function entranteDesviada() {
  return {
    data: {
      id: `evt_in_${Math.random()}`,
      event_type: "call.initiated",
      payload: {
        call_control_id: "call_ctrl_in",
        direction: "incoming",
        from: ALHABLA,
        to: ALHABLA,
      },
    },
  };
}

function salienteContestada(clientState: string) {
  return {
    data: {
      id: `evt_ans_${Math.random()}`,
      event_type: "call.answered",
      payload: { call_control_id: "call_ctrl_out", client_state: clientState },
    },
  };
}

function salienteColgada(clientState: string, hangupCause: string) {
  return {
    data: {
      id: `evt_hang_${Math.random()}`,
      event_type: "call.hangup",
      payload: {
        call_control_id: "call_ctrl_out",
        hangup_cause: hangupCause,
        client_state: clientState,
      },
    },
  };
}

describe("«Comprobar desvío» de punta a punta (integración)", () => {
  let businessId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.TELNYX_CALL_CONTROL_APP_ID = "cc_app_test";
    mockedDialCall.mockResolvedValue({
      callControlId: "call_ctrl_out",
      callLegId: "leg_out",
    });
    mockedHangupCall.mockResolvedValue(undefined);

    const business = await createTestBusiness({
      phone: LINEA,
      telnyxPhoneNumber: ALHABLA,
      telnyxPhoneNumberId: "pn_test",
      phoneNumberStatus: "active",
      customerLineType: "fijo",
      orchestrator: "telnyx",
      voiceRoutingTarget: "telnyx",
    });
    businessId = business.id;
    await prisma.agent.create({
      data: {
        businessId,
        name: "Recepcionista",
        systemPrompt: "Eres la recepcionista.",
        active: true,
        telnyxAssistantId: "assistant_test",
      },
    });
  });

  afterEach(() => {
    delete process.env.TELNYX_CALL_CONTROL_APP_ID;
    vi.restoreAllMocks();
  });

  it("desvío bien marcado: la llamada vuelve por el número de Alhabla, se cuelga sin Call y queda comprobado", async () => {
    const check = await iniciarComprobacionDeDesvio(businessId);
    const clientState = mockedDialCall.mock.calls[0][0].clientState;
    expect(leerClientStateDeComprobacion(clientState)).toMatchObject({
      businessId,
      checkId: check.id,
    });

    // Telnyx avisa de la pata saliente: no es un cliente, no se toca.
    expect(await handleCallInitiated(salienteIniciada(clientState))).toEqual({
      success: true,
    });
    expect(mockedHangupCall).not.toHaveBeenCalled();

    // La misma llamada entra desviada por el número de Alhabla.
    expect(await handleCallInitiated(entranteDesviada())).toEqual({
      success: true,
    });
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_in");
    expect(mockedAnswer).not.toHaveBeenCalled();
    expect(await prisma.call.count()).toBe(0);

    const estado = await prisma.onboardingState.findUnique({
      where: { businessId },
    });
    expect(estado?.forwardingCheckedAt).toBeInstanceOf(Date);
    expect(estado?.forwardingConfirmedAt).toBeInstanceOf(Date);

    // La saliente termina después; el ok no se pisa.
    expect(
      await handleCallHangup(salienteColgada(clientState, "call_rejected"))
    ).toEqual({ success: true });
    expect(await prisma.call.count()).toBe(0);

    const final = await obtenerComprobacionDeDesvio(check.id, businessId);
    expect(final?.resultado).toEqual({ estado: "ok" });
    expect(final?.resueltaAt).toEqual(expect.any(String));
    // Turno libre para otra comprobación, contador de la hora en 1.
    await expect(
      getRedis().get(`desvio:check:negocio:${businessId}`)
    ).resolves.toBeNull();
    await expect(
      getRedis().get(`desvio:check:limite:${businessId}`)
    ).resolves.toBe("1");
  });

  it("sin desvío: la saliente agota el timeout y la comprobación falla sin tocar el onboarding", async () => {
    const check = await iniciarComprobacionDeDesvio(businessId);
    const clientState = mockedDialCall.mock.calls[0][0].clientState;

    await handleCallInitiated(salienteIniciada(clientState));
    expect(
      await handleCallHangup(salienteColgada(clientState, "timeout"))
    ).toEqual({ success: true });

    const final = await obtenerComprobacionDeDesvio(check.id, businessId);
    expect(final?.resultado).toEqual({
      estado: "fallo",
      motivo: "sin_desvio",
    });
    expect(await prisma.call.count()).toBe(0);
    expect(
      await prisma.onboardingState.findUnique({ where: { businessId } })
    ).toBeNull();

    // Se puede volver a intentar en el acto.
    const otra = await iniciarComprobacionDeDesvio(businessId);
    expect(otra.id).not.toBe(check.id);
  });

  it("el dueño la coge: se cuelga la saliente y el motivo es «la has cogido»", async () => {
    const check = await iniciarComprobacionDeDesvio(businessId);
    const clientState = mockedDialCall.mock.calls[0][0].clientState;

    expect(await handleCallAnswered(salienteContestada(clientState))).toEqual({
      success: true,
    });
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_out");
    expect(
      await handleCallHangup(salienteColgada(clientState, "normal_clearing"))
    ).toEqual({ success: true });

    const final = await obtenerComprobacionDeDesvio(check.id, businessId);
    expect(final?.resultado).toEqual({
      estado: "fallo",
      motivo: "la_has_cogido",
    });
  });

  it("otro negocio no puede leer la comprobación, y las llamadas de clientes siguen entrando mientras dura", async () => {
    const check = await iniciarComprobacionDeDesvio(businessId);
    const otro = await createTestBusiness({
      telnyxPhoneNumber: "+34930453219",
      phoneNumberStatus: "active",
    });

    await expect(
      obtenerComprobacionDeDesvio(check.id, otro.id)
    ).resolves.toBeNull();

    mockedAnswer.mockResolvedValue(undefined);
    const cliente = await handleCallInitiated({
      data: {
        id: "evt_cliente",
        event_type: "call.initiated",
        payload: {
          call_control_id: "call_ctrl_cliente",
          direction: "incoming",
          from: "+34600000000",
          to: ALHABLA,
        },
      },
    });
    expect(cliente).toEqual({ success: true });
    expect(mockedAnswer).toHaveBeenCalledWith(
      "call_ctrl_cliente",
      "assistant_test"
    );
    expect(await prisma.call.count({ where: { businessId } })).toBe(1);
    expect(
      (await obtenerComprobacionDeDesvio(check.id, businessId))?.resultado
    ).toBeNull();
  });
});
