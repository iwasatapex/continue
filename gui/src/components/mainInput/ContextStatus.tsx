import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { saveCurrentSession } from "../../redux/thunks/session";
import { useCompactConversation } from "../../util/compactConversation";
import { ToolTip } from "../gui/Tooltip";

const AUTO_COMPACT_PERCENT = 50;
const AUTO_COMPACT_DELAY_MS = 1500;
// Module-level so remounts of ContextStatus don't re-trigger compaction.
let lastAutoCompactKey: string | null = null;

const ContextStatus = () => {
  const dispatch = useAppDispatch();
  const contextPercentage = useAppSelector(
    (state) => state.session.contextPercentage,
  );
  const selectedChatModel = useAppSelector(
    (state) => state.config.config.selectedModelByRole.chat?.model,
  );
  const previousHistoryLength = useRef<number | null>(null);
  const previousSelectedChatModel = useRef<string | null>(null);
  const history = useAppSelector((state) => state.session.history);
  const percent = Math.round((contextPercentage ?? 0) * 100);
  const isPruned = useAppSelector((state) => state.session.isPruned);

  const isDifferentModelAndSameHistory = useMemo(() => {
    if (!selectedChatModel) return false;
    // only reset if history changes
    if (previousHistoryLength.current !== history.length) {
      previousHistoryLength.current = history.length;
      previousSelectedChatModel.current = selectedChatModel;
      return false;
    }
    return previousSelectedChatModel.current !== selectedChatModel;
  }, [history.length, selectedChatModel]);

  const compactConversation = useCompactConversation();
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const isCompacting = useAppSelector((state) =>
    Object.values(state.session.compactionLoading || {}).some(Boolean),
  );
  const sessionId = useAppSelector((state) => state.session.id);

  // Auto-compact: once context passes AUTO_COMPACT_PERCENT and the assistant
  // has finished its turn (not streaming, no pending tool calls), compact the
  // conversation up to the latest message. Keyed on session + history length
  // so each turn is compacted at most once.
  useEffect(() => {
    const length = history.length;
    const last = history[length - 1];
    const key = `${sessionId}:${length}`;
    if (
      isStreaming ||
      isCompacting ||
      percent <= AUTO_COMPACT_PERCENT ||
      length < 2 ||
      lastAutoCompactKey === key ||
      !last ||
      last.message.role !== "assistant" ||
      last.conversationSummary
    ) {
      return;
    }
    if (
      (last.toolCallStates ?? []).some((t) =>
        ["generating", "generated", "calling"].includes(t.status),
      )
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      if (lastAutoCompactKey === key) return;
      lastAutoCompactKey = key;
      void compactConversation(length - 1);
    }, AUTO_COMPACT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isStreaming, isCompacting, percent, history, sessionId]);

  // Always show the context indicator (previously hidden below 60%).

  // if user changed to a different model, we shouldn't show the context status until the user sends a new message
  if (isDifferentModelAndSameHistory) {
    return null;
  }

  const barColorClass = isPruned ? "bg-error" : "bg-description";

  return (
    <div>
      <ToolTip
        closeEvents={{
          // blur: false,
          mouseleave: true,
          click: true,
          mouseup: false,
        }}
        clickable
        content={
          <div className="flex flex-col gap-0 text-left text-xs">
            <span className="inline-block">
              {`${percent}% of context filled.`}
            </span>
            {isPruned && (
              <span className="inline-block">
                {`Oldest messages are being removed.`}
              </span>
            )}
            {history.length > 0 && (
              <div className="flex flex-col gap-1 whitespace-pre">
                <div>
                  <span
                    className="hover:text-link inline-block cursor-pointer underline"
                    onClick={() => compactConversation(history.length - 1)}
                  >
                    Compact conversation
                  </span>
                  {"\n"}
                  <span
                    className="hover:text-link inline-block cursor-pointer underline"
                    onClick={() => {
                      void dispatch(
                        saveCurrentSession({
                          openNewSession: true,
                          generateTitle: false,
                        }),
                      );
                    }}
                  >
                    Start a new session
                  </span>
                </div>
              </div>
            )}
          </div>
        }
      >
        <div className="border-command-border relative h-[20px] w-[10px] rounded-[2px] border border-solid md:h-[18px] md:w-[9px]">
          <div
            className={`transition-height absolute bottom-0 left-0 w-full duration-300 ease-in-out ${barColorClass}`}
            style={{ height: `${percent}%` }}
          />
        </div>
      </ToolTip>
    </div>
  );
};

export default ContextStatus;
