import { defineConfig } from "vite";
import { appConfig } from "./vite.base";

export default defineConfig(appConfig("cliente", 3000));
