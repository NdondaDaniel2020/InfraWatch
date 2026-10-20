import { useState, useEffect, useRef, useCallback } from "react";

export interface UseAutoRotateOptions {
  totalPanels: number;
  intervalMs?: number;
  autoStart?: boolean;
  isPausedExternally?: boolean;
}

export interface UseAutoRotateReturn {
  currentPanel: number;
  progress: number;
  isAutoRotating: boolean;
  nextPanel: () => void;
  prevPanel: () => void;
  setPanel: (index: number) => void;
  toggleAutoRotate: () => void;
  pause: () => void;
  resume: () => void;
  resetTimer: () => void;
}

/**
 * Hook gerenciando o temporizador de rotação do carrossel Wallboard TV
 * com barra de progresso visual de alta precisão e sem vazamento de memória.
 */
export function useAutoRotate({
  totalPanels,
  intervalMs = 30000,
  autoStart = true,
  isPausedExternally = false,
}: UseAutoRotateOptions): UseAutoRotateReturn {
  const [currentPanel, setCurrentPanel] = useState<number>(0);
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(autoStart);
  const [progress, setProgress] = useState<number>(0);

  const startTimeRef = useRef<number>(Date.now());
  const elapsedBeforePauseRef = useRef<number>(0);

  const isPaused = !isAutoRotating || isPausedExternally;

  const resetTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    elapsedBeforePauseRef.current = 0;
    setProgress(0);
  }, []);

  const nextPanel = useCallback(() => {
    setCurrentPanel((prev) => (totalPanels > 0 ? (prev + 1) % totalPanels : 0));
    resetTimer();
  }, [totalPanels, resetTimer]);

  const prevPanel = useCallback(() => {
    setCurrentPanel((prev) =>
      totalPanels > 0 ? (prev - 1 + totalPanels) % totalPanels : 0
    );
    resetTimer();
  }, [totalPanels, resetTimer]);

  const setPanel = useCallback(
    (index: number) => {
      if (totalPanels > 0 && index >= 0 && index < totalPanels) {
        setCurrentPanel(index);
        resetTimer();
      }
    },
    [totalPanels, resetTimer]
  );

  const pause = useCallback(() => {
    setIsAutoRotating(false);
  }, []);

  const resume = useCallback(() => {
    setIsAutoRotating(true);
    startTimeRef.current = Date.now() - elapsedBeforePauseRef.current;
  }, []);

  const toggleAutoRotate = useCallback(() => {
    if (isAutoRotating) {
      pause();
    } else {
      resume();
    }
  }, [isAutoRotating, pause, resume]);

  // Efeito principal do ticker de progresso e rotação
  useEffect(() => {
    if (isPaused || totalPanels <= 1 || intervalMs <= 0) {
      return;
    }

    startTimeRef.current = Date.now() - elapsedBeforePauseRef.current;

    const tickInterval = 100; // 100ms para animação suave da barra de progresso
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      elapsedBeforePauseRef.current = elapsed;

      if (elapsed >= intervalMs) {
        // Rotaciona para o próximo painel
        setCurrentPanel((prev) => (prev + 1) % totalPanels);
        startTimeRef.current = Date.now();
        elapsedBeforePauseRef.current = 0;
        setProgress(0);
      } else {
        const currentProgress = Math.min(100, (elapsed / intervalMs) * 100);
        setProgress(Number(currentProgress.toFixed(1)));
      }
    }, tickInterval);

    return () => {
      clearInterval(timer);
    };
  }, [isPaused, totalPanels, intervalMs]);

  // Se os painéis diminuírem e o currentPanel estiver fora do limite
  useEffect(() => {
    if (totalPanels > 0 && currentPanel >= totalPanels) {
      setCurrentPanel(0);
      resetTimer();
    }
  }, [totalPanels, currentPanel, resetTimer]);

  return {
    currentPanel,
    progress,
    isAutoRotating,
    nextPanel,
    prevPanel,
    setPanel,
    toggleAutoRotate,
    pause,
    resume,
    resetTimer,
  };
}
