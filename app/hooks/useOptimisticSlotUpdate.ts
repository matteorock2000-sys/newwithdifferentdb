import { useState, useCallback, useRef, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import type { PlayerSlot, SlotSyncState } from "~/types";
import { debounce } from "~/utils/debounce";
import { logger } from "~/utils/logger";
import { useGlobalToast } from "~/utils/toast";
import type { StandardErrorResponse } from "~/utils/errors";
import { retryOperation } from "~/utils/retry";

interface UseOptimisticSlotUpdateOptions {
  roomCode: string | null;
  currentParty: PlayerSlot[];
  onPartyUpdate: (party: PlayerSlot[]) => void;
  debounceDelay?: number;
}

export function useOptimisticSlotUpdate({
  roomCode,
  currentParty,
  onPartyUpdate,
  debounceDelay = 300
}: UseOptimisticSlotUpdateOptions) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const [slotSyncStates, setSlotSyncStates] = useState<Map<number, SlotSyncState>>(
    new Map()
  );
  const [slotHistory, setSlotHistory] = useState<Map<number, PlayerSlot>>(
    new Map()
  );
  const pendingUpdates = useRef<Map<number, PlayerSlot>>(new Map());
  const { showToast } = useGlobalToast();

  // Debounced server update function with retry logic
  const debouncedServerUpdate = useRef(
    debounce((slotIndex: number, slotData: PlayerSlot) => {
      if (!roomCode) return;

      logger.debug("Submitting debounced slot update", { slotIndex, roomCode });

      // Set status to syncing when fetcher.submit is called
      setSlotSyncStates((prev) => {
        const updated = new Map(prev);
        if (updated.get(slotIndex)?.status === "pending") {
          updated.set(slotIndex, { status: "syncing" });
        }
        return updated;
      });

      // Track pending update
      pendingUpdates.current.set(slotIndex, slotData);

      // Submit with retry logic
      retryOperation(
        () => {
          return new Promise((resolve, reject) => {
            // Monitor fetcher state for completion
            const checkComplete = setInterval(() => {
              if (fetcher.state === "idle") {
                clearInterval(checkComplete);
                if (fetcher.data?.error) {
                  reject(new Error(fetcher.data.error));
                } else {
                  resolve(fetcher.data);
                }
              }
            }, 100);

            fetcher.submit(
              {
                intent: "updateSlot",
                slotIndex: slotIndex.toString(),
                slotData: JSON.stringify(slotData),
                roomCode: roomCode,
              },
              { method: "post", action: "/game" }
            );
          });
        },
        {
          maxAttempts: 2,
          delayMs: 500,
          shouldRetry: (error) => {
            // Retry on network errors but not on validation errors
            return (
              error?.message?.includes("network") ||
              error?.message?.includes("ETIMEDOUT") ||
              error?.message?.includes("ECONNRESET")
            );
          },
          onRetry: (error, attempt) => {
            logger.info("Retrying slot update", {
              slotIndex,
              attempt,
              error: error.message,
            });
          },
        }
      ).catch((error) => {
        logger.error("Slot update failed after retries", { slotIndex, error });
        showToast("Could not save changes. Please try again.", "error");
      });
    }, debounceDelay)
  ).current;

  // Handle fetcher response
  useEffect(() => {
    if (!fetcher.data) return;

    // Check if there's a submission context
    const submission = fetcher.submission;
    if (!submission) {
      logger.warn("Fetcher data received without submission context - resetting syncing states");
      
      // Reset all syncing states back to synced
      setSlotSyncStates((prev) => {
        const updated = new Map(prev);
        updated.forEach((state, slotIndex) => {
          if (state.status === "syncing") {
            updated.set(slotIndex, { status: "synced" });
          }
        });
        return updated;
      });
      
      // Clear any pending updates
      pendingUpdates.current.clear();
      return;
    }

    // Get slotIndex from the submission that triggered this response
    const slotIndexStr = submission.formData?.get('slotIndex')?.toString();
    const slotIndex = parseInt(slotIndexStr || '', 10);
    
    // Defensive check: bail out if slotIndex is invalid
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= currentParty.length) {
      logger.warn("Invalid slotIndex in server response", { slotIndex, slotIndexStr });
      return;
    }

    // Clear pending update for this slot
    pendingUpdates.current.delete(slotIndex);

if (fetcher.data.error) {
        // Handle both old and new error formats for backward compatibility
        const errorMessage = (fetcher.data as StandardErrorResponse)?.error?.userMessage || 
                            fetcher.data.error;
        
        logger.error("Slot update failed", { slotIndex, error: fetcher.data.error });
        showToast(errorMessage, "error");

        // Rollback to previous state
        const previousSlot = slotHistory.get(slotIndex);
        if (previousSlot) {
          const newParty = [...currentParty];
          newParty[slotIndex] = previousSlot;
          onPartyUpdate(newParty);

          // Clear history
          setSlotHistory((prev) => {
            const updated = new Map(prev);
            updated.delete(slotIndex);
            return updated;
          });
        }

        // Mark as error
        setSlotSyncStates((prev) => {
          const updated = new Map(prev);
          updated.set(slotIndex, {
            status: "error",
            errorMessage: errorMessage,
          });
          return updated;
        });      // Clear error after 3 seconds
      setTimeout(() => {
        setSlotSyncStates((prev) => {
          const updated = new Map(prev);
          updated.delete(slotIndex);
          return updated;
        });
      }, 3000);
    } else {
      // Success - mark as synced
      logger.debug("Slot update succeeded", { slotIndex });

      setSlotSyncStates((prev) => {
        const updated = new Map(prev);
        updated.set(slotIndex, { status: "synced" });
        return updated;
      });

      // Clear synced status after 2 seconds
      setTimeout(() => {
        setSlotSyncStates((prev) => {
          const updated = new Map(prev);
          updated.delete(slotIndex);
          return updated;
        });
      }, 2000);

      // Clear history
      setSlotHistory((prev) => {
        const updated = new Map(prev);
        updated.delete(slotIndex);
        return updated;
      });
    }
  }, [fetcher.data, fetcher.submission, slotHistory, currentParty, onPartyUpdate]);

  const updateSlot = useCallback(
    (slotIndex: number, newSlotData: PlayerSlot) => {
      logger.debug("Optimistic slot update", { slotIndex, newSlotData });

      // Store previous state for rollback
      const previousSlot = currentParty[slotIndex];
      setSlotHistory((prev) => new Map(prev).set(slotIndex, previousSlot));

      // Mark as pending
      setSlotSyncStates((prev) => {
        const updated = new Map(prev);
        updated.set(slotIndex, { status: "pending" });
        return updated;
      });

      // Optimistic UI update
      const newParty = [...currentParty];
      newParty[slotIndex] = newSlotData;
      onPartyUpdate(newParty);

      // Store pending update
      pendingUpdates.current.set(slotIndex, newSlotData);

      // Debounced server update
      if (roomCode) {
        debouncedServerUpdate(slotIndex, newSlotData);
      }
    },
    [currentParty, roomCode, onPartyUpdate, debouncedServerUpdate, debounceDelay]
  );

  const getSlotSyncState = useCallback(
    (slotIndex: number): SlotSyncState => {
      return slotSyncStates.get(slotIndex) || { status: "synced" };
    },
    [slotSyncStates]
  );

  const isSlotUpdating = useCallback(
    (slotIndex: number): boolean => {
      const status = getSlotSyncState(slotIndex).status;
      return status === "pending" || status === "syncing";
    },
    [getSlotSyncState]
  );

  return {
    currentParty,
    updateSlot,
    getSlotSyncState,
    isSlotUpdating,
    // Keep isUpdating for backward compatibility (global fetcher state)
    isUpdating: fetcher.state !== "idle",
  };
}
