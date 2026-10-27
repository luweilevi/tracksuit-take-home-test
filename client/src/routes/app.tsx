import { useCallback, useEffect, useState } from "react";
import { Header } from "../components/header/header.tsx";
import { Insights } from "../components/insights/insights.tsx";
import styles from "./app.module.css";
import type { Insight } from "../schemas/insight.ts";

type ApiInsight = {
  id: number;
  brand: number;
  createdAt: string;
  text: string;
};

export const App = () => {
  const [insights, setInsights] = useState<Insight[]>([]);

  const loadInsights = useCallback(() => {
    // /api is stripped by the Vite dev proxy and, in production, by the
    fetch(`/api/insights`)
      .then((res) => res.json())
      .then((data: ApiInsight[]) => {
        const next = data.map((row) => ({
          id: row.id,
          brandId: row.brand,
          date: new Date(row.createdAt),
          text: row.text,
        }));
        setInsights(next);
      });
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  return (
    <main className={styles.main}>
      <Header onInsightCreated={loadInsights} />
      <Insights className={styles.insights} insights={insights} />
    </main>
  );
};
