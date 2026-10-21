import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles.css";

// Nova versão disponível: pergunta antes de recarregar (não interrompe uma operação em andamento).
const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm("Nova versão do aplicativo disponível. Atualizar agora?")) void updateSW(true);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
