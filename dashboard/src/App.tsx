import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Overview } from "./pages/Overview";
import { RunDetail } from "./pages/RunDetail";
import { Trends } from "./pages/Trends";

export function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/run/:runId" element={<RunDetail />} />
          <Route path="/trends" element={<Trends />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
