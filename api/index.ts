import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/context";
import { config, assertProductionConfig } from "../server/config";
import { createOauthState, setOauthState, exchangeGithubCode, clearOauthState } from "../server/auth";

assertProductionConfig();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "25mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "aegiscore-vercel", version: "2.0.0" }));

app.get("/api/auth/github", (_req, res) => {
  if (!config.github.clientId) return res.status(503).send("GitHub OAuth is not configured.");
  const state = createOauthState();
  setOauthState(res, state);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.clientId);
  url.searchParams.set("redirect_uri", `${config.appUrl}/api/auth/github/callback`);
  url.searchParams.set("scope", config.github.scopes);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/api/auth/github/callback", async (req, res) => {
  try {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!code || !state) return res.status(400).send("Missing OAuth callback parameters.");
    const expected = (req.headers.cookie ?? "").split(";").map(c => c.trim().split("=")).find(([k]) => k === "aegis_oauth_state")?.[1];
    await exchangeGithubCode(code, state, expected, req, res);
    res.redirect("/");
  } catch (error) {
    clearOauthState(res);
    res.status(400).send(error instanceof Error ? error.message : "GitHub login failed");
  }
});

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

export default app;
