interface TawkAPI {
  maximize: () => void;
  minimize: () => void;
  toggle: () => void;
  hideWidget: () => void;
  showWidget: () => void;
  onLoad?: () => void;
}

declare global {
  interface Window {
    Tawk_API?: TawkAPI;
  }
}

export {};
