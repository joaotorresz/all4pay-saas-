/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    // A escala de texto roda DEPOIS do Tailwind: é no CSS gerado que moram as
    // ~600 classes `text-[Npx]` e os tokens de tipografia. Ver o arquivo.
    "./src/design/postcss-escala-texto.cjs": {},
    autoprefixer: {},
  },
};

export default config;
