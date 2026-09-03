import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type { ChangeEvent } from "react";
import { useAgentFileUpload, AGENT_FILE_MAX_SIZE } from "@/hooks/use-agent-file-upload";
import { uploadAgentFile } from "@/lib/api";

vi.mock("@/lib/api", () => ({ uploadAgentFile: vi.fn() }));

const mockedUploadAgentFile = vi.mocked(uploadAgentFile);

function renderWithQueryClient(agentId?: string) {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = renderHook(() => useAgentFileUpload(agentId), { wrapper });
  return { ...result, invalidateSpy };
}

function fileChangeEvent(file: File | undefined) {
  return {
    target: { files: file ? [file] : [], value: "" },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

describe("useAgentFileUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("openFilePicker sin agentId muestra un error y no abre el selector", () => {
    const { result } = renderWithQueryClient(undefined);
    const clickSpy = vi.fn();
    // @ts-expect-error -- sustituimos el nodo real por un espía mínimo
    result.current.inputRef.current = { click: clickSpy };

    act(() => result.current.openFilePicker());

    expect(result.current.status).toEqual({
      type: "error",
      message: "No se encontró un agente asociado. Intenta refrescar la página.",
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("openFilePicker con agentId abre el selector de archivos", () => {
    const { result } = renderWithQueryClient("agent_1");
    const clickSpy = vi.fn();
    // @ts-expect-error -- sustituimos el nodo real por un espía mínimo
    result.current.inputRef.current = { click: clickSpy };

    act(() => result.current.openFilePicker());

    expect(clickSpy).toHaveBeenCalled();
    expect(result.current.status).toBeNull();
  });

  it("no hace nada si el evento no trae ningún archivo", async () => {
    const { result } = renderWithQueryClient("agent_1");

    await act(async () => result.current.handleFileChange(fileChangeEvent(undefined)));

    expect(result.current.status).toBeNull();
    expect(mockedUploadAgentFile).not.toHaveBeenCalled();
  });

  it("rechaza archivos de más de 10 MB sin llamar a la API", async () => {
    const { result } = renderWithQueryClient("agent_1");
    const bigFile = new File([new Uint8Array(AGENT_FILE_MAX_SIZE + 1)], "grande.pdf");

    await act(async () => result.current.handleFileChange(fileChangeEvent(bigFile)));

    expect(result.current.status).toEqual({ type: "error", message: "El archivo no puede superar los 10 MB." });
    expect(mockedUploadAgentFile).not.toHaveBeenCalled();
  });

  it("sube el archivo y muestra éxito cuando queda asociado de inmediato", async () => {
    const { result, invalidateSpy } = renderWithQueryClient("agent_1");
    mockedUploadAgentFile.mockResolvedValue({
      success: true,
      file: { pending: false } as any,
    });
    const file = new File(["contenido"], "info.pdf");

    await act(async () => result.current.handleFileChange(fileChangeEvent(file)));

    await waitFor(() =>
      expect(result.current.status).toEqual({
        type: "success",
        message: "Archivo subido y asociado correctamente.",
      })
    );
    expect(mockedUploadAgentFile).toHaveBeenCalledWith("agent_1", file);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["my-business"] });
    expect(result.current.isUploading).toBe(false);
  });

  it("muestra un mensaje distinto cuando el archivo queda pendiente de sincronizar", async () => {
    const { result } = renderWithQueryClient("agent_1");
    mockedUploadAgentFile.mockResolvedValue({
      success: true,
      file: { pending: true } as any,
      note: "Se procesará en unos minutos.",
    });
    const file = new File(["contenido"], "info.pdf");

    await act(async () => result.current.handleFileChange(fileChangeEvent(file)));

    await waitFor(() =>
      expect(result.current.status?.message).toBe("Archivo aceptado. Se procesará en unos minutos.")
    );
  });

  it("extrae el mensaje de error de un AxiosError con detalle del backend", async () => {
    const { result } = renderWithQueryClient("agent_1");
    const axiosError = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
      data: { details: "Formato de archivo no soportado" },
    } as any);
    mockedUploadAgentFile.mockRejectedValue(axiosError);
    const file = new File(["contenido"], "info.exe");

    await act(async () => result.current.handleFileChange(fileChangeEvent(file)));

    await waitFor(() =>
      expect(result.current.status).toEqual({ type: "error", message: "Formato de archivo no soportado" })
    );
  });

  it("usa un mensaje genérico si el error no es un AxiosError reconocible", async () => {
    const { result } = renderWithQueryClient("agent_1");
    mockedUploadAgentFile.mockRejectedValue(new Error("network down"));
    const file = new File(["contenido"], "info.pdf");

    await act(async () => result.current.handleFileChange(fileChangeEvent(file)));

    await waitFor(() =>
      expect(result.current.status).toEqual({ type: "error", message: "Error al subir el archivo." })
    );
  });
});
