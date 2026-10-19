import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // El repo tiene dos package-lock.json (backend en la raíz y este del
    // frontend). Sin esto Next adivina la raíz del workspace, toma la del
    // backend y avisa en cada build. El frontend no importa nada de fuera de
    // esta carpeta, así que su raíz es ella misma.
    root: path.join(__dirname),
  },
};

export default nextConfig;
