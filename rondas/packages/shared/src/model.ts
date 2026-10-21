/**
 * Modelo de dados do Firestore.
 *
 * Convenções:
 * - Coleções de topo, sempre com `companyId` (e `contractId`/`postId` quando
 *   aplicável) desnormalizados, para que as regras de segurança e as consultas
 *   filtrem por escopo sem leituras extras.
 * - Datas são gravadas como Timestamp (UTC). Exibição e relatórios usam o fuso
 *   configurado no posto (`Post.timezone`, padrão "America/Sao_Paulo").
 * - "Data operacional" (`operationalDate`) é string `YYYY-MM-DD` no fuso do posto.
 * - Nenhuma escrita é feita pelo cliente: todas passam pelo Worker, que valida
 *   permissões e grava a auditoria na mesma operação atômica (commit).
 * - Registros operacionais (rondas, leituras, justificativas) nunca são
 *   sobrescritos livremente: correções geram novas entradas de auditoria.
 *
 * As interfaces das etapas futuras já estão definidas aqui para que o modelo
 * não precise ser reconstruído; a implementação de cada uma acontece na etapa
 * indicada.
 */
import type { CompanyAdminPermissions } from "./permissions.js";
import type { CompanyStatus, Role, SupervisorFuncao, UserStatus } from "./roles.js";

/** Representação neutra de Timestamp (Date no Worker, Timestamp no SDK web). */
export type Ts = Date;

export interface Audited {
  createdAt: Ts;
  createdBy: string;
  updatedAt: Ts;
  updatedBy: string;
  /** true para dados de demonstração (removíveis em lote). */
  demo?: boolean;
}

// ---------------------------------------------------------------- Etapa 1

/** config/publico — legível sem login (tela de login exibe o nome). */
export interface PublicConfig {
  nomeSistema: string;
  updatedAt: Ts;
  updatedBy: string;
}

/** users/{uid} — perfil e escopo. Fonte da verdade do controle de acesso. */
export interface UserProfile extends Audited {
  uid: string;
  email: string;
  nome: string;
  role: Role;
  funcao?: SupervisorFuncao;
  companyId: string | null;
  /** Postos aos quais o supervisor/vigilante tem acesso. */
  postIds: string[];
  /** Contratos aos quais o supervisor tem acesso (todos os postos do contrato). */
  contractIds: string[];
  status: UserStatus;
  telefone?: string;
  /** Matrícula interna (opcional). Evite coletar CPF sem necessidade (LGPD). */
  matricula?: string;
}

/** auditLogs/{id} — imutável. */
export interface AuditLog {
  id: string;
  at: Ts;
  actorUid: string;
  actorRole: Role;
  companyId: string | null;
  action: string; // ex.: "usuario.criar", "sistema.configurar"
  targetType: string; // ex.: "user", "company"
  targetId: string;
  /** Somente os campos alterados (antes/depois). */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId: string;
  motivo?: string;
}

// ---------------------------------------------------------------- Etapa 2

/** companies/{id} */
export interface Company extends Audited {
  id: string;
  nome: string;
  cnpj?: string;
  responsaveis: { nome: string; telefone?: string; email?: string }[];
  status: CompanyStatus;
  permissoesAdmin: CompanyAdminPermissions;
  /** Dias de retenção de fotos (padrão 7), sobrescrevível por contrato. */
  retencaoFotosDias: number;
}

export type ContractStatus = "ativo" | "suspenso" | "encerrado";

/** contracts/{id} */
export interface Contract extends Audited {
  id: string;
  companyId: string;
  nome: string;
  cliente: string;
  vigenciaInicio: string; // YYYY-MM-DD
  vigenciaFim: string | null;
  status: ContractStatus;
  retencaoFotosDias?: number;
}

/**
 * Regra de associação de turnos que atravessam a meia-noite:
 * - "inicio_turno": todas as rondas do turno 18:00(seg)→08:00(ter) pertencem à data de segunda.
 * - "data_civil": cada ronda pertence à data civil do seu horário previsto.
 */
export type ShiftDateRule = "inicio_turno" | "data_civil";

/** posts/{id} */
export interface Post extends Audited {
  id: string;
  companyId: string;
  contractId: string;
  nome: string;
  endereco: string;
  geo: { lat: number; lng: number } | null;
  timezone: string; // padrão "America/Sao_Paulo"
  diasOperacao: number[]; // 0=domingo … 6=sábado
  horarioFuncionamento: { inicio: string; fim: string } | null; // "HH:mm"
  shiftDateRule: ShiftDateRule;
  status: ContractStatus;
}

// ---------------------------------------------------------------- Etapa 3

export type GeoPolicy = "bloquear" | "excecao_justificada" | "analise";

/** checkpoints/{id} — o segredo do QR fica em checkpointSecrets/{id} (só backend). */
export interface Checkpoint extends Audited {
  id: string;
  companyId: string;
  contractId: string;
  postId: string;
  nome: string;
  codigo: string; // código legível, ex. "P-01" — NÃO valida passagem sozinho
  geo: { lat: number; lng: number } | null;
  raioMetros: number;
  geoPolicy: GeoPolicy;
  obrigatorio: boolean;
  exigeFoto: boolean;
  checklistId: string | null;
  instrucoes?: string;
  status: "ativo" | "inativo";
  /** Versão do QR; incrementar invalida o QR impresso anterior. */
  qrVersion: number;
}

/** checkpointSecrets/{checkpointId} — inacessível a clientes. */
export interface CheckpointSecret {
  /** SHA-256 do token aleatório contido no QR. */
  tokenHash: string;
  qrVersion: number;
}

export type QuestionType =
  | "sim_nao"
  | "conforme"
  | "multipla_escolha"
  | "texto_curto"
  | "texto_longo"
  | "numero"
  | "data_hora"
  | "ocorrencia"
  | "foto";

export interface ChecklistQuestion {
  id: string;
  texto: string;
  tipo: QuestionType;
  obrigatoria: boolean;
  opcoes?: string[];
  /** Respostas que disparam ações (ex.: "nao", "nao_conforme"). */
  respostasCriticas?: string[];
  acoesCriticas?: ("gerar_ocorrencia" | "exigir_foto" | "alertar_central")[];
}

/** checklists/{id} + checklists/{id}/versions/{n} (versões imutáveis). */
export interface Checklist extends Audited {
  id: string;
  companyId: string;
  contractId: string | null;
  postId: string | null;
  turno: "diurno" | "noturno" | null;
  nome: string;
  versaoAtual: number;
}

// ---------------------------------------------------------------- Etapa 4

export type ScheduleModel = "quantidade_fixa" | "turnos" | "intervalo" | "horarios_fixos";

export interface ShiftConfig {
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm" — se fim <= inicio, o turno atravessa a meia-noite
  quantidade: number | null;
  intervaloMin: number | null;
  /** Como compatibilizar quantidade x intervalo; nunca é inferido em silêncio. */
  distribuicao: "uniforme" | "intervalo" | "manual";
  horariosManuais?: string[];
}

/** schedules/{id}/versions/{n} — versões com vigência; nunca alteram o passado. */
export interface ScheduleVersion {
  scheduleId: string;
  version: number;
  companyId: string;
  contractId: string;
  postId: string;
  modelo: ScheduleModel;
  diasSemana: number[];
  feriadosExcluidos: string[]; // YYYY-MM-DD
  excecoes: { data: string; acao: "pular" | "horarios"; horarios?: string[] }[];
  turnos: { diurno?: ShiftConfig; noturno?: ShiftConfig };
  quantidadeDia?: number;
  horariosFixos?: string[];
  intervaloMin?: number;
  janela: { antecedenciaMin: number; toleranciaMin: number; janelaMaxMin: number };
  pontosObrigatorios: string[] | "todos";
  vigenciaInicio: string;
  vigenciaFim: string | null;
  createdAt: Ts;
  createdBy: string;
}

export type RoundStatus =
  | "prevista"
  | "disponivel"
  | "em_andamento"
  | "concluida"
  | "incompleta"
  | "atrasada"
  | "nao_realizada";

/**
 * rounds/{roundId} — rondas previstas geradas antecipadamente.
 * roundId é determinístico: `${postId}_${scheduledAt UTC yyyyMMddHHmm}` —
 * gerar de novo não duplica (create com precondição "não existe").
 */
export interface PlannedRound {
  id: string;
  companyId: string;
  contractId: string;
  postId: string;
  scheduleId: string;
  scheduleVersion: number;
  operationalDate: string;
  turno: "diurno" | "noturno" | "unico";
  scheduledAt: Ts;
  windowStart: Ts;
  windowEnd: Ts;
  toleranciaMin: number;
  requiredCheckpointIds: string[];
  validatedCheckpointIds: string[];
  status: RoundStatus;
  /** Justificativa é separada do status: não apaga a falha original. */
  justificada: boolean;
  justificativaId: string | null;
  startedAt: Ts | null;
  completedAt: Ts | null;
  executorUid: string | null;
}

// ---------------------------------------------------------------- Etapa 5

/** scans/{scanId} — scanId gerado no aparelho (UUID) = chave de idempotência. */
export interface Scan {
  id: string;
  companyId: string;
  contractId: string;
  postId: string;
  roundId: string;
  checkpointId: string;
  userId: string;
  serverReceivedAt: Ts;
  deviceReportedAt: Ts;
  coletadoOffline: boolean;
  geo: { lat: number; lng: number; accuracyM: number } | null;
  distanciaM: number | null;
  resultado: "validado" | "rejeitado" | "em_analise";
  motivo?: string;
  checklistVersion: number | null;
  respostas: Record<string, unknown>;
  fotoIds: string[];
}

/** photos/{id} — metadados; o arquivo fica no R2. */
export interface Photo {
  id: string;
  companyId: string;
  postId: string;
  roundId: string | null;
  checkpointId: string | null;
  incidentId: string | null;
  userId: string;
  r2Key: string;
  bytes: number;
  contentType: "image/jpeg" | "image/webp";
  uploadedAt: Ts;
  expiresAt: Ts | null;
  retencaoLegal: { motivo: string; autorizadoPor: string; ate: Ts | null } | null;
  deletedAt: Ts | null;
}

// ---------------------------------------------------------------- Etapas 6–8

export interface Justification {
  id: string;
  roundId: string;
  companyId: string;
  postId: string;
  texto: string;
  autorUid: string;
  at: Ts;
  aceitaPorContrato: boolean;
}

export type IncidentSeverity = "baixa" | "media" | "alta" | "critica";

export interface Incident extends Audited {
  id: string;
  companyId: string;
  contractId: string;
  postId: string;
  ocorridaEm: Ts;
  vigilanteUid: string;
  categoria: string;
  descricao: string;
  gravidade: IncidentSeverity;
  geo: { lat: number; lng: number; accuracyM: number } | null;
  fotoIds: string[];
  providencias: string;
  responsavelUid: string | null;
  status: "aberta" | "em_acompanhamento" | "encerrada";
}

export interface Alert {
  id: string;
  /** Chave de deduplicação: mesmo evento nunca gera dois alertas. */
  dedupKey: string;
  companyId: string;
  postId: string | null;
  tipo:
    | "janela_fim_proximo"
    | "ronda_atrasada"
    | "ronda_nao_realizada"
    | "ronda_incompleta"
    | "falha_repetida_ponto"
    | "ocorrencia_critica"
    | "checklist_critico"
    | "falha_sincronizacao";
  refId: string;
  criadoEm: Ts;
  entregas: { canal: string; destino: string; status: "pendente" | "enviado" | "erro"; at: Ts }[];
}
