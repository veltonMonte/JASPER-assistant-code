import React from "react";
import { ShieldCheck, Check, X, Mic, Radio } from "lucide-react";
import type { PendingDeviceRequest } from "../hooks/useJasperWebSocket";

interface Props {
  requests: PendingDeviceRequest[];
  onResolve: (id: string, approved: boolean) => void;
}

export default function DeviceApprovalBanner({ requests, onResolve }: Props) {
  if (!requests || requests.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "1.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9000,
        width: "calc(100% - 2.5rem)",
        maxWidth: "600px",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        pointerEvents: "auto",
      }}
    >
      {requests.map((req) => (
        <div
          key={req.id}
          style={{
            background: "linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(10, 15, 26, 0.98))",
            border: "1px solid rgba(6, 182, 212, 0.4)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(6, 182, 212, 0.2)",
            borderRadius: "0.85rem",
            padding: "1rem 1.25rem",
            color: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", minWidth: 0 }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "rgba(6, 182, 212, 0.15)",
                border: "1px solid rgba(6, 182, 212, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#06b6d4",
                flexShrink: 0,
              }}
            >
              <Radio size={20} className="animate-pulse" />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#38bdf8", fontWeight: 600 }}>
                  Acesso Solicitado
                </span>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>•</span>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>IP: {req.ip || "local"}</span>
              </div>
              <p
                style={{
                  margin: "0.2rem 0 0",
                  fontSize: "0.925rem",
                  fontWeight: 500,
                  color: "#f1f5f9",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                O dispositivo <strong style={{ color: "#38bdf8" }}>"{req.deviceName}"</strong> está pedindo para entrar na nossa rede.
              </p>
              <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Mic size={12} color="#06b6d4" />
                <span>Revise o dispositivo e use os botões Permitir ou Negar</span>
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            <button
              onClick={() => onResolve(req.id, false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.55rem 0.85rem",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                borderRadius: "0.5rem",
                color: "#f87171",
                fontSize: "0.825rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Negar entrada"
            >
              <X size={15} />
              <span>Negar</span>
            </button>

            <button
              onClick={() => onResolve(req.id, true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.55rem 1rem",
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                border: "none",
                borderRadius: "0.5rem",
                color: "#031720",
                fontSize: "0.825rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(6, 182, 212, 0.35)",
                transition: "all 0.15s ease",
              }}
              title="Permitir entrada na rede"
            >
              <Check size={16} />
              <span>Permitir</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
