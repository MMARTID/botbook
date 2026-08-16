"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { uploadAgentFile } from "@/lib/api";

export const AGENT_FILE_ACCEPT = ".pdf,.txt,.doc,.docx,.csv";
export const AGENT_FILE_MAX_SIZE = 10 * 1024 * 1024;

type UploadStatus = {
  type: "success" | "error";
  message: string;
};

type ApiErrorBody = {
  error?: string;
  details?: string;
};

function getUploadErrorMessage(error: unknown) {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;
    return body?.details || body?.error || "Error al subir el archivo.";
  }

  return "Error al subir el archivo.";
}

export function useAgentFileUpload(agentId?: string) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  const openFilePicker = () => {
    if (!agentId) {
      setStatus({
        type: "error",
        message: "No se encontró un agente asociado. Intenta refrescar la página.",
      });
      return;
    }

    inputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!agentId) {
      setStatus({
        type: "error",
        message: "No se encontró un agente asociado. Intenta refrescar la página.",
      });
      return;
    }

    if (file.size > AGENT_FILE_MAX_SIZE) {
      setStatus({ type: "error", message: "El archivo no puede superar los 10 MB." });
      return;
    }

    setIsUploading(true);
    setStatus(null);

    try {
      const response = await uploadAgentFile(agentId, file);
      const note = response.note || response.message;

      setStatus({
        type: "success",
        message: response.file.pending
          ? `Archivo aceptado. ${note || "Se sincronizará cuando el asistente esté listo."}`
          : "Archivo subido y asociado correctamente.",
      });

      await queryClient.invalidateQueries({ queryKey: ["my-business"] });
    } catch (error) {
      console.error("Agent file upload failed", error);
      setStatus({ type: "error", message: getUploadErrorMessage(error) });
    } finally {
      setIsUploading(false);
    }
  };

  return {
    inputRef,
    isUploading,
    status,
    openFilePicker,
    handleFileChange,
  };
}
