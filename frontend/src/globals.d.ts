export {};

declare global {
  interface Window {
    __resetNudgeProfile?: () => void;
  }
}
