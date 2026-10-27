// Copia o worker do pdf.js do pacote instalado para `public/vendor/`, para ele
// ser servido pelo NOSSO domínio e sempre na mesma versão do `pdfjs-dist`.
// Roda antes de `dev` e `build` (predev/prebuild). Ver `workerDoPdf` em
// src/lib/ocr-local.ts para o motivo.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/vendor/pdf.worker.min.mjs");
