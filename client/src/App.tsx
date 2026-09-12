import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Repositories from "./pages/Repositories";
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/repositories" component={Repositories} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [arabic, setArabic] = useState(() => localStorage.getItem("aegis-locale") === "ar");
  useEffect(() => {
    document.documentElement.lang = arabic ? "ar" : "en";
    document.documentElement.dir = arabic ? "rtl" : "ltr";
    localStorage.setItem("aegis-locale", arabic ? "ar" : "en");
  }, [arabic]);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" />
          <button type="button" onClick={() => setArabic((value) => !value)} className="fixed right-5 top-5 z-50 rounded-full border bg-background/90 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur hover:bg-accent" aria-label="Change language">
            {arabic ? "English" : "العربية"}
          </button>
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
