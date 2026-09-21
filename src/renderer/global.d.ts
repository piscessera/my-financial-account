declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

interface Window {
  api: import('../../electron/preload').PreloadApi;
}
