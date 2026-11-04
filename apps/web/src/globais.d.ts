/** Data e hora do build (ISO), definida no vite.config.ts. */
declare const __DATA_BUILD__: string;

/** API nativa de leitura de códigos (Chrome/Android). Não está no lib.dom do TypeScript. */
interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetector {
  detect(fonte: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare var BarcodeDetector:
  | {
      new (opcoes?: { formats?: string[] }): BarcodeDetector;
      getSupportedFormats(): Promise<string[]>;
    }
  | undefined;
