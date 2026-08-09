import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AIInsights } from "./pages/AIInsights";
import { BotDetail } from "./pages/BotDetail";
import { Bots } from "./pages/Bots";
import { Overview } from "./pages/Overview";
import { Portfolio } from "./pages/Portfolio";
import { Signals } from "./pages/Signals";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/bots" element={<Bots />} />
        <Route path="/bots/:id" element={<BotDetail />} />
        <Route path="/ai" element={<AIInsights />} />
        <Route path="/portfolio" element={<Portfolio />} />
      </Routes>
    </Layout>
  );
}
