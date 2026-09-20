import { describe, it, expect, afterEach } from "vitest";
import {
  ayudaDueno,
  bajaDueno,
  bienvenidaTrasAlta,
  botonSinContexto,
  cambioNoMeVaBien,
  citaCanceladaPorCliente,
  citaConfirmadaPorCliente,
  citaYaCancelada,
  citaYaConfirmada,
  citaYaPasada,
  clienteConocido,
  comoCambiarCita,
  contactoComoTexto,
  huecoCerrado,
  huecoFueraDePlazo,
  huecoRechazado,
  huecoReservado,
  huecoYaOcupado,
  huecoYaPasado,
  huecoYaReservado,
  huecoYaReservadoNoSeAnula,
  listaDeEsperaAvisada,
  listaDeEsperaEnOferta,
  listaDeEsperaError,
  listaDeEsperaNadie,
  listaDeEsperaPasada,
  listaDeEsperaSinHueco,
  listaDeEsperaSinPlantilla,
  listarNegocios,
  noPudeReservarAhora,
  panelUrl,
  yaActivo,
} from "../../../src/modules/whatsapp/mensajes.js";

describe("listarNegocios", () => {
  it("uno, dos y tres negocios", () => {
    expect(listarNegocios(["Peluquería Ana"])).toBe("Peluquería Ana");
    expect(listarNegocios(["Peluquería Ana", "Barbería Ana"])).toBe(
      "Peluquería Ana y Barbería Ana"
    );
    expect(listarNegocios(["A", "B", "C"])).toBe("A, B y C");
    expect(listarNegocios([])).toBe("");
  });
});

describe("copy del número de negocios", () => {
  it("la bienvenida tras el alta solo menciona el panel cuando se apuntó otro móvil", () => {
    const sinCambio = bienvenidaTrasAlta({
      negocios: ["Peluquería Ana"],
      movilApuntado: false,
    });
    expect(sinCambio).toContain("recepcionista de Peluquería Ana");
    expect(sinCambio).toContain("STOP");
    expect(sinCambio).not.toContain("He apuntado este móvil");

    const conCambio = bienvenidaTrasAlta({
      negocios: ["Peluquería Ana", "Barbería Ana"],
      movilApuntado: true,
    });
    expect(conCambio).toContain("Peluquería Ana y Barbería Ana");
    expect(conCambio.split("\n")[2]).toBe(
      "He apuntado este móvil en tu panel, en Ajustes › WhatsApp."
    );
  });

  it("la ayuda lleva el enlace al panel y los tres comandos", () => {
    const texto = ayudaDueno({
      negocios: ["Peluquería Ana"],
      panelUrl: "https://alhabla.ai/ajustes#whatsapp",
    });
    expect(texto).toContain("https://alhabla.ai/ajustes#whatsapp");
    expect(texto).toContain("AYUDA:");
    expect(texto).toContain("STOP:");
    expect(texto).toContain("ALTA:");
  });

  it("baja y ya activo nombran los negocios pasados", () => {
    expect(bajaDueno({ negocios: ["A", "B"] })).toContain("avisos de A y B");
    expect(yaActivo({ negocios: ["A"] })).toContain(
      "Los avisos de A ya están activos"
    );
  });
});

describe("copy del número de clientes", () => {
  it("cliente conocido con y sin teléfono válido del negocio", () => {
    expect(
      clienteConocido({ negocio: "Peluquería Ana", telefono: "+34930000000" })
    ).toContain("llama al negocio al +34930000000");
    expect(
      clienteConocido({ negocio: "Peluquería Ana", telefono: null })
    ).toContain("llama directamente al negocio");
  });
});

describe("botones del cliente (PR 4)", () => {
  const N = "Peluquería Ana";
  const CITA = "jueves 24 de septiembre a las 17:00";
  const TEL = "+34 930 454 394";
  const conTel = { negocio: N, telefono: TEL };
  const sinTel = { negocio: N, telefono: null };

  it("contactoComoTexto lleva el número tal cual", () => {
    expect(contactoComoTexto({ numero: "+34930454394" })).toBe(
      "No he podido enviarte la tarjeta. Guarda este número como Alhabla Reservas: +34930454394."
    );
  });

  it("citaConfirmadaPorCliente y citaYaConfirmada nombran el negocio en la primera frase", () => {
    expect(citaConfirmadaPorCliente({ negocio: N, cita: CITA })).toBe(
      `Gracias. Tu cita en ${N} del ${CITA} queda confirmada. Te esperamos.`
    );
    expect(citaYaConfirmada({ negocio: N, cita: CITA })).toBe(
      `Tu cita en ${N} del ${CITA} ya estaba confirmada. No tienes que hacer nada más.`
    );
  });

  it("citaYaCancelada y citaYaPasada con otraCita nombran la cita nueva y sin ella no; sin teléfono caen a «llama directamente a»", () => {
    expect(citaYaCancelada({ ...conTel, otraCita: null })).toBe(
      `Esa cita en ${N} ya está cancelada. Si quieres otra hora, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(
      citaYaCancelada({
        ...conTel,
        otraCita: "viernes 25 de septiembre a las 10:00",
      })
    ).toBe(
      `Esa cita en ${N} ya está cancelada. La cita que tienes ahora es el viernes 25 de septiembre a las 10:00: para anularla, pulsa Cancelar en su recordatorio o llama al negocio. Si quieres otra hora, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(citaYaPasada({ ...sinTel, otraCita: null })).toBe(
      `Esa cita en ${N} ya ha pasado. Si quieres pedir otra, llama directamente a ${N} y te atenderá la recepcionista.`
    );
    expect(
      citaYaPasada({
        ...conTel,
        otraCita: "lunes 28 de septiembre a las 09:00",
      })
    ).toContain(
      "La cita que tienes ahora es el lunes 28 de septiembre a las 09:00"
    );
  });

  it("citaCanceladaPorCliente y comoCambiarCita", () => {
    expect(
      citaCanceladaPorCliente({ negocio: N, cita: CITA, telefono: TEL })
    ).toBe(
      `Hecho. Tu cita en ${N} del ${CITA} queda cancelada. Gracias por avisar. Si quieres otra hora, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(comoCambiarCita({ negocio: N, cita: CITA, telefono: null })).toBe(
      `Para cambiar tu cita del ${CITA}, llama directamente a ${N} y la recepcionista te busca otra hora. Mientras tanto la cita sigue en pie. Si prefieres anularla, pulsa Cancelar en el recordatorio.`
    );
  });

  it("los textos de «Sí, resérvala» y «Ya no»", () => {
    expect(
      huecoReservado({
        negocio: N,
        servicio: "corte con Laura",
        cita: CITA,
        telefono: TEL,
      })
    ).toBe(
      `Hecho, la hora es tuya. Tu cita en ${N} para corte con Laura queda confirmada el ${CITA}. Si necesitas cambiarla, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(huecoYaReservado({ negocio: N, cita: CITA })).toBe(
      `Esa hora ya es tuya: tu cita en ${N} queda el ${CITA}. No hace falta que hagas nada más.`
    );
    expect(huecoYaOcupado(conTel)).toBe(
      `Vaya, esa hora en ${N} se acaba de ocupar. Si quieres otra, llama a ${N} al ${TEL} y la recepcionista te la busca.`
    );
    expect(huecoFueraDePlazo(sinTel)).toBe(
      `Esa hora en ${N} ya no se puede reservar con tan poca antelación. Si quieres otra, llama directamente a ${N} y la recepcionista te la busca.`
    );
    expect(huecoYaPasado(conTel)).toBe(
      `Esa hora en ${N} ya ha pasado. Si quieres pedir otra, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(huecoCerrado(conTel)).toBe(
      `Ese aviso de ${N} ya está cerrado. Si sigues queriendo cita, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(noPudeReservarAhora(sinTel)).toBe(
      `No he podido reservarla en ${N} ahora mismo. Vuelve a pulsar en un minuto o llama directamente a ${N}.`
    );
    expect(huecoRechazado({ negocio: N })).toBe(
      `Entendido, no te guardamos esa hora en ${N}. Gracias por avisar.`
    );
    expect(huecoYaReservadoNoSeAnula({ negocio: N, cita: CITA })).toBe(
      `Esa hora ya está reservada a tu nombre en ${N} para el ${CITA}. Si no la quieres, pulsa Cancelar en el recordatorio o llama al negocio.`
    );
  });

  it("cambioNoMeVaBien y botonSinContexto", () => {
    expect(cambioNoMeVaBien(conTel)).toBe(
      `Entendido, se lo hago saber a ${N}. Si quieres buscar otra hora ya, llama a ${N} al ${TEL} y te atenderá la recepcionista.`
    );
    expect(botonSinContexto()).toBe(
      "No sé a qué cita te refieres. Llama al negocio y te atenderá la recepcionista."
    );
  });

  it("ningún texto del cliente lleva emojis y todos empiezan con el negocio en la primera frase", () => {
    const textos = [
      citaConfirmadaPorCliente({ negocio: N, cita: CITA }),
      citaYaCancelada({ ...conTel, otraCita: null }),
      citaCanceladaPorCliente({ negocio: N, cita: CITA, telefono: TEL }),
      huecoReservado({
        negocio: N,
        servicio: "corte",
        cita: CITA,
        telefono: TEL,
      }),
      huecoRechazado({ negocio: N }),
      cambioNoMeVaBien(conTel),
    ];
    for (const texto of textos) {
      expect(
        texto.split(". ")[0] +
          (texto.includes(". ") ? ". " + texto.split(". ")[1] : "")
      ).toContain(N);
      expect(texto).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe("lista de espera (botón del dueño)", () => {
  const N = "Peluquería Ana";

  it("listaDeEsperaAvisada y listaDeEsperaEnOferta usan el nombre o «la primera persona que esperaba» y nunca un teléfono", () => {
    expect(listaDeEsperaAvisada({ negocio: N, cliente: "Marta" })).toBe(
      `${N}: he avisado a Marta, que pedía esa hora. Si la reserva, te llega el aviso de nueva cita.`
    );
    expect(listaDeEsperaAvisada({ negocio: N, cliente: null })).toBe(
      `${N}: he avisado a la primera persona que esperaba, que pedía esa hora. Si la reserva, te llega el aviso de nueva cita.`
    );
    expect(
      listaDeEsperaEnOferta({ negocio: N, cliente: "Marta", minutos: 4 })
    ).toBe(
      `${N}: ya avisé a Marta hace 4 minutos. Le doy diez minutos; si no contesta, vuelve a pulsar y aviso al siguiente.`
    );
    expect(
      listaDeEsperaEnOferta({ negocio: N, cliente: null, minutos: 9 })
    ).toContain("la primera persona que esperaba hace 9 minutos");
    for (const texto of [
      listaDeEsperaAvisada({ negocio: N, cliente: "Marta" }),
      listaDeEsperaEnOferta({ negocio: N, cliente: null, minutos: 1 }),
    ]) {
      expect(texto).not.toMatch(/\+?\d{9,}/);
    }
  });

  it("nadie, sin plantilla, sin hueco, pasada y error", () => {
    expect(listaDeEsperaNadie({ negocio: N })).toBe(
      `${N}: nadie esperaba esa hora. El hueco queda libre en tu agenda.`
    );
    expect(listaDeEsperaSinPlantilla({ negocio: N })).toBe(
      `${N}: ahora mismo no puedo escribir por WhatsApp a quien esperaba esa hora. En cuanto pueda, este botón lo hará.`
    );
    expect(listaDeEsperaSinHueco({ negocio: N })).toBe(
      `${N}: esa cita sigue en pie, así que no hay hueco que ofrecer.`
    );
    expect(listaDeEsperaPasada({ negocio: N })).toBe(
      `${N}: esa hora ya ha pasado; no hay a quién avisar.`
    );
    expect(listaDeEsperaError({ negocio: N })).toBe(
      `${N}: no he podido avisar a quien esperaba ahora mismo. Vuelve a pulsar en unos minutos.`
    );
  });
});

describe("panelUrl", () => {
  const original = process.env.FRONTEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it("usa FRONTEND_URL y cae a alhabla.ai", () => {
    process.env.FRONTEND_URL = "http://localhost:3001";
    expect(panelUrl()).toBe("http://localhost:3001/ajustes#whatsapp");
    delete process.env.FRONTEND_URL;
    expect(panelUrl()).toBe("https://alhabla.ai/ajustes#whatsapp");
  });
});
