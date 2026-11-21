
import { useEffect, useState } from "react";

export function useQuizTabDetection(
  enabled: boolean,
  resetKey?: string
) {
  const [tabSwitchCount, setTabSwitchCount] =
    useState(0);

  // Reset kapag ibang quiz ang binuksan.
  useEffect(() => {
    setTabSwitchCount(0);
  }, [resetKey]);

  // Makinig kapag umalis sa active browser tab.
  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        setTabSwitchCount((count) => count + 1);
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [enabled]);

  function resetTabSwitchCount() {
    setTabSwitchCount(0);
  }

  return {
    tabSwitchCount,
    resetTabSwitchCount,
  };
}
