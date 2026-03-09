import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { useHarnessStore } from "../../stores/harnessStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUiStore } from "../../stores/uiStore";
import { writeCommandToNewSession } from "../../lib/ipc";
import { copyTextToClipboard } from "../../lib/clipboard";
import { handleDragDoubleClick, handleDragMouseDown } from "../../lib/windowDrag";
import { getHarnessIcon } from "../shared/HarnessLogos";
import type { HarnessInfo } from "../../types";

/* ─── Install command map (mirrors backend harness definitions) ─── */
const NPM_INSTALL_COMMANDS: Record<string, string> = {
  codex: "@openai/codex",
  "claude-code": "@anthropic-ai/claude-code",
  "gemini-cli": "@google/gemini-cli",
  opencode: "opencode",
  "kilo-code": "kilo-code",
};

const SCRIPT_INSTALL_COMMANDS: Record<string, string> = {
  kiro: "curl -fsSL https://cli.kiro.dev/install | bash",
  "factory-droid": "curl -fsSL https://app.factory.ai/cli | sh",
};

function installCommandFor(harnessId: string, preferredInstallMethod: string | null): string | null {
  const npmPackage = NPM_INSTALL_COMMANDS[harnessId];
  if (npmPackage) {
    if (preferredInstallMethod === "mise") {
      return `mise use -g npm:${npmPackage}`;
    }
    return `npm install -g ${npmPackage}`;
  }

  return SCRIPT_INSTALL_COMMANDS[harnessId] ?? null;
}

/* ─── Harness tile ─── */
function HarnessTile({
  harness,
  description,
  installCommand,
  onInstallInTerminal,
  onCopyCommand,
  onLaunch,
}: {
  harness: HarnessInfo;
  description: string;
  installCommand: string | null;
  onInstallInTerminal: () => void;
  onCopyCommand: () => void;
  onLaunch: () => void;
}) {
  const { t } = useTranslation("app");

  return (
    <div className={`hp-tile${harness.native ? " hp-tile-native" : ""}${harness.found ? " hp-tile-installed" : ""}`}>
      <div className="hp-tile-icon">
        {getHarnessIcon(harness.id, harness.native ? 22 : 18)}
      </div>

      <div className="hp-tile-body">
        <div className="hp-tile-name-row">
          <span className="hp-tile-name">{harness.name}</span>
          {harness.native && <span className="hp-tile-badge">{t("harnesses.native")}</span>}
        </div>
        <p className="hp-tile-desc">{description}</p>
        {harness.found && (
          <div className="hp-tile-meta">
            <span className="hp-tile-status-ok">
              <CheckCircle2 size={10} />
              {t("harnesses.installed")}
            </span>
            {harness.version && <span className="hp-tile-version">{harness.version}</span>}
          </div>
        )}
      </div>

      <div className="hp-tile-action">
        {harness.found ? (
          <button type="button" className="hp-btn hp-btn-launch" onClick={onLaunch}>
            <Play size={11} />
            {t("harnesses.launch")}
          </button>
        ) : installCommand ? (
          <div className="hp-tile-action-group">
            <button
              type="button"
              className="hp-btn hp-btn-copy"
              onClick={onCopyCommand}
              title={installCommand}
            >
              <ClipboardCopy size={11} />
            </button>
            <button
              type="button"
              className="hp-btn hp-btn-install"
              onClick={onInstallInTerminal}
            >
              <Download size={11} />
              {t("harnesses.install")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Main panel (full page) ─── */
export function HarnessPanel() {
  const { t } = useTranslation("app");
  const phase = useHarnessStore((s) => s.phase);
  const harnesses = useHarnessStore((s) => s.harnesses);
  const error = useHarnessStore((s) => s.error);
  const scan = useHarnessStore((s) => s.scan);
  const launch = useHarnessStore((s) => s.launch);
  const preferredInstallMethod = useHarnessStore((s) => s.preferredInstallMethod);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setLayoutMode = useTerminalStore((s) => s.setLayoutMode);
  const createSession = useTerminalStore((s) => s.createSession);
  const terminalWorkspaces = useTerminalStore((s) => s.workspaces);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const installedCount = harnesses.filter((h) => h.found).length;
  const goBack = useCallback(() => setActiveView("chat"), [setActiveView]);

  const spawnInTerminal = useCallback(
    async (command: string) => {
      if (!activeWorkspaceId) return;

      const wsState = terminalWorkspaces[activeWorkspaceId];
      if (!wsState || (wsState.layoutMode !== "terminal" && wsState.layoutMode !== "split")) {
        await setLayoutMode(activeWorkspaceId, "terminal");
      }

      const sessionId = await createSession(activeWorkspaceId);
      if (sessionId) {
        void writeCommandToNewSession(activeWorkspaceId, sessionId, command);
      }

      setActiveView("chat");
    },
    [activeWorkspaceId, terminalWorkspaces, setLayoutMode, createSession, setActiveView],
  );

  async function handleLaunch(harnessId: string) {
    const command = await launch(harnessId);
    if (command) await spawnInTerminal(command);
  }

  function handleInstallInTerminal(harnessId: string) {
    const cmd = installCommandFor(harnessId, preferredInstallMethod);
    if (cmd) void spawnInTerminal(cmd);
  }

  function handleCopyCommand(harnessId: string) {
    const cmd = installCommandFor(harnessId, preferredInstallMethod);
    if (cmd) {
      void copyTextToClipboard(cmd)
        .then(() => {
          void import("../../stores/toastStore").then(({ toast }) => {
            toast.success(t("harnesses.copySuccess"));
          });
        })
        .catch(() => {
          void import("../../stores/toastStore").then(({ toast }) => {
            toast.error(t("harnesses.copyFailed"));
          });
        });
    }
  }

  return (
    <div className="hp-root">
      <div className="hp-scroll">
        <div className="hp-inner">
          {/* Header */}
          <div className="hp-header">
            <div
              className="hp-header-top"
              onMouseDown={handleDragMouseDown}
              onDoubleClick={handleDragDoubleClick}
            >
              <button type="button" className="wsp-back" onClick={goBack} title={t("workspace:actions.back")}>
                <ArrowLeft size={14} />
              </button>
              <div className="hp-header-icon">
                <Terminal size={16} />
              </div>
              <div className="hp-header-text">
                <h1 className="hp-title">{t("harnesses.title")}</h1>
                <p className="hp-subtitle">
                  {phase === "scanning"
                    ? t("harnesses.scanning")
                    : t("harnesses.detectedCount", {
                        installed: installedCount,
                        total: harnesses.length,
                      })}
                </p>
              </div>
              <button
                type="button"
                className="hp-rescan"
                onClick={() => void scan()}
                disabled={phase === "scanning"}
                title={t("harnesses.rescan")}
              >
                <RefreshCw
                  size={12}
                  style={{
                    animation: phase === "scanning" ? "spin 1s linear infinite" : "none",
                  }}
                />
              </button>
            </div>
          </div>

          {/* Content */}
          {phase === "scanning" && harnesses.length === 0 ? (
            <div className="hp-loading">
              <Loader2
                size={20}
                style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }}
              />
              <p>{t("harnesses.loading")}</p>
            </div>
          ) : (
            <div className="hp-grid">
              {harnesses.map((h) => (
                <HarnessTile
                  key={h.id}
                  harness={h}
                  description={t(`harnesses.descriptions.${h.id}`, { defaultValue: h.description })}
                  installCommand={installCommandFor(h.id, preferredInstallMethod)}
                  onInstallInTerminal={() => handleInstallInTerminal(h.id)}
                  onCopyCommand={() => handleCopyCommand(h.id)}
                  onLaunch={() => void handleLaunch(h.id)}
                />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="hp-error">
              <p>{error}</p>
              <button
                type="button"
                className="hp-btn hp-btn-install"
                onClick={() => void scan()}
              >
                {t("harnesses.retry")}
              </button>
            </div>
          )}

          {/* Footer hint */}
          <div className="hp-footer">
            <ArrowRight size={11} />
            <span>{t("harnesses.footerHint")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
