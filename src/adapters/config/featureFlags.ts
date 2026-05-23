export const FEATURE_FLAGS = {
  inlineAutosave: import.meta.env.VITE_FEATURE_INLINE_AUTOSAVE !== 'false',
} as const;
