import React, { useState } from "react";
import { Shield, ShieldAlert, Laptop, Radio, ArrowRight, RefreshCw } from "lucide-react";
import type { AuthStatus } from "../hooks/useJasperWebSocket";

interface Props {
  authStatus: AuthStatus;
  onRequestAccess: (deviceName: string) => void;
  isConnected: boolean;
}

export default function DeviceGatekeeperModal({ authStatus, onRequestAccess, isConnected }: Props) {
  const [deviceName, setDeviceName] = useState(() => {
    return localStorage.getItem("jasper_device_name") || "";
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim() || !isConnected) return;
    onRequestAccess(deviceName.trim());
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(5, 7, 12, 0.88)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "linear-gradient(145deg, rgba(20, 24, 33, 0.95), rgba(12, 15, 22, 0.98))",
          border: "1px solid rgba(6, 182, 212, 0.25)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(6, 182, 212, 0.15)",
          borderRadius: "1rem",
          padding: "2rem",
          color: "#f1f5f9",
          textAlign: "center",
          animation: "fadeIn 0.3s ease-out",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            margin: "0 auto 1.25rem",
            borderRadius: "50%",
            background: authStatus.isDenied
              ? "rgba(239, 68, 68, 0.15)"
              : "rgba(6, 182, 212, 0.12)",
            border: `1px solid ${authStatus.isDenied ? "rgba(239, 68, 68, 0.4)" : "rgba(6, 182, 212, 0.3)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: authStatus.isDenied ? "#ef4444" : "#06b6d4",
          }}
        >
          {authStatus.isDenied ? (
            <ShieldAlert size={32} />
          ) : authStatus.isPending ? (
            <Radio size={32} className="animate-pulse" />
          ) : (
            <Shield size={32} />
          )}
        </div>

        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
          {authStatus.isDenied
            ? "Acesso Negado"
            : authStatus.isPending
            ? "Aguardando Aprovação"
            : "Rede Segura JASPER"}
        </h2>

        <p style={{ fontSize: "0.875rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: "1.5rem" }}>
          {authStatus.isDenied
            ? "O dispositivo principal recusou a entrada desta máquina na rede."
            : authStatus.isPending
            ? `Solicitação enviada para o dispositivo principal para "${deviceName || "este aparelho"}". O Jasper avisará o administrador.`
            : "Este dispositivo precisa ser identificado e aprovado pelo computador principal para ter acesso ao assistente."}
        </p>

        {authStatus.isPending ? (
          <div
            style={{
              padding: "1rem",
              background: "rgba(6, 182, 212, 0.06)",
              border: "1px dashed rgba(6, 182, 212, 0.3)",
              borderRadius: "0.75rem",
              fontSize: "0.825rem",
              color: "#38bdf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <RefreshCw size={16} className="animate-spin" />
            <span>Aguardando resposta no dispositivo principal...</span>
          </div>
        ) : authStatus.isDenied ? (
          <button
            onClick={() => onRequestAccess(deviceName)}
            style={{
              width: "100%",
              padding: "0.75rem 1.25rem",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#f8fafc",
              borderRadius: "0.5rem",
              fontWeight: 500,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Tentar Novamente
          </button>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ position: "relative", textAlign: "left" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#64748b",
                  marginBottom: "0.35rem",
                }}
              >
                Identificação do Dispositivo
              </label>
              <div style={{ position: "relative" }}>
                <Laptop
                  size={18}
                  style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "#64748b" }}
                />
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="ex: Celular do Velton, Notebook Dell"
                  required
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "0.75rem 0.85rem 0.75rem 2.5rem",
                    background: "rgba(15, 23, 42, 0.75)",
                    border: "1px solid rgba(51, 65, 85, 0.8)",
                    borderRadius: "0.5rem",
                    color: "#f8fafc",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!isConnected || !deviceName.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
                padding: "0.85rem 1.25rem",
                marginTop: "0.5rem",
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                border: "none",
                borderRadius: "0.5rem",
                color: "#041017",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: !isConnected || !deviceName.trim() ? "not-allowed" : "pointer",
                opacity: !isConnected || !deviceName.trim() ? 0.6 : 1,
                boxShadow: "0 4px 15px rgba(6, 182, 212, 0.35)",
              }}
            >
              <span>Solicitar Acesso à Rede</span>
              <ArrowRight size={18} />
            </button>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              No computador principal, abra o Jasper pelo endereço local 127.0.0.1.
              O acesso será reconhecido automaticamente.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
