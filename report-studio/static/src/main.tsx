import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installLocalApi } from "./ai-local";
import { installLinkInterceptor } from "./router";
import { boot } from "./store";

installLinkInterceptor();
installLocalApi();
const root = createRoot(document.getElementById("root")!);
boot().finally(() => root.render(<App />));
