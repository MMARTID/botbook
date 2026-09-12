import { describe, expect, it } from "vitest";
import { parseOutlookCalendarSelection } from "@/lib/calendar-callback";

const selection = {
  email: "duena@ejemplo.es",
  calendars: [
    {
      id: "calendar_1",
      name: "Agenda 100% privada",
      canEdit: true,
      canShare: false,
      ownerEmail: "duena@ejemplo.es",
    },
  ],
};

describe("parseOutlookCalendarSelection", () => {
  it("acepta el valor ya decodificado por URLSearchParams, incluso con % en el nombre", () => {
    expect(parseOutlookCalendarSelection(JSON.stringify(selection))).toEqual(selection);
  });

  it("rechaza un payload incompleto sin dejar el callback en un estado intermedio", () => {
    expect(parseOutlookCalendarSelection('{"calendars":[{"id":"calendar_1"}]}')).toBeNull();
  });
});
