import panelPackage from "../package.json";

export const PANEL_VERSION =
  import.meta.env.VITE_APP_VERSION || panelPackage.version;
