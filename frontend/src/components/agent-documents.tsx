"use client";

import { FileText, Upload } from "lucide-react";
import { AGENT_FILE_ACCEPT, useAgentFileUpload } from "@/hooks/use-agent-file-upload";
import type { FileAttachment } from "@/lib/types";

type AgentDocumentsProps = {
  agentId?: string;
  files: FileAttachment[];
};

/**
 * PDFs, tarifas y FAQs que el agente consulta durante las llamadas. Vive en
 * ajustes y no en el panel: es configuración que se toca una vez, no
 * información del día a día.
 */
export function AgentDocuments({ agentId, files }: AgentDocumentsProps) {
  const {
    inputRef,
    isUploading,
    status,
    openFilePicker,
    handleFileChange,
  } = useAgentFileUpload(agentId);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <p className="text-sm leading-6 text-muted">
        Sube tu carta de precios, tus condiciones de cancelación o cualquier documento que quieras
        que tu recepcionista pueda consultar mientras habla con un cliente.
      </p>

      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className="hidden"
        accept={AGENT_FILE_ACCEPT}
      />

      {status ? (
        <p
          role="status"
          className={`text-sm font-medium ${
            status.type === "success" ? "text-[#2c7334]" : "text-[#c53030]"
          }`}
        >
          {status.message}
        </p>
      ) : null}

      {files.length > 0 ? (
        <>
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[#27272a]">{file.name}</span>
                {file.pending ? (
                  <span className="shrink-0 text-xs font-semibold text-muted">Procesando…</span>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={isUploading || !agentId}
            className="btn-secondary h-11 px-4"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {isUploading ? "Subiendo…" : "Añadir otro documento"}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#27272a]">Aún no hay documentos</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Sin ellos el agente responde solo con lo que hay en esta página: horario, servicios y
              equipo.
            </p>
          </div>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={isUploading || !agentId}
            className="btn-secondary h-11 shrink-0 px-4"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {isUploading ? "Subiendo…" : "Subir el primero"}
          </button>
        </div>
      )}
    </div>
  );
}
