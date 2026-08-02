// Shared enter/exit motion for the extractor's three swapped panels so they
// all transition identically inside the parent AnimatePresence.
export const panelMotion = (reduced: boolean) => ({
  initial: reduced ? undefined : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: reduced ? undefined : { opacity: 0, y: -12 },
  transition: reduced
    ? { duration: 0 }
    : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
});
