import type { FormEvent } from "react";
import { BRANDS } from "../../lib/consts.ts";
import { Button } from "../button/button.tsx";
import { Modal, type ModalProps } from "../modal/modal.tsx";
import styles from "./add-insight.module.css";

type AddInsightProps = ModalProps & {
  onCreated?: () => void;
};

export const AddInsight = ({ onCreated, ...props }: AddInsightProps) => {
  const addInsight = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const brand = Number(data.get("brand"));
    const text = String(data.get("text") ?? "").trim();
    // #region agent log
    fetch("http://127.0.0.1:7282/ingest/b51e5113-d5e9-4bbc-829d-ee1174a7bb31", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "a110e8",
      },
      body: JSON.stringify({
        sessionId: "a110e8",
        runId: "post-fix",
        hypothesisId: "A",
        location: "add-insight.tsx:addInsight",
        message: "form submit prevented navigation",
        data: {
          brand,
          textLength: text.length,
          defaultPrevented: event.defaultPrevented,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!text || Number.isNaN(brand)) return;

    const res = await fetch("/api/insights/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, text }),
    });
    // #region agent log
    fetch("http://127.0.0.1:7282/ingest/b51e5113-d5e9-4bbc-829d-ee1174a7bb31", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "a110e8",
      },
      body: JSON.stringify({
        sessionId: "a110e8",
        runId: "post-fix",
        hypothesisId: "D",
        location: "add-insight.tsx:response",
        message: "create response",
        data: { status: res.status },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!res.ok) return;

    form.reset();
    props.onClose();
    onCreated?.();
  };

  return (
    <Modal {...props}>
      <h1 className={styles.heading}>Add a new insight</h1>
      <form className={styles.form} onSubmit={addInsight}>
        <label className={styles.field}>
          <select
            className={styles["field-input"]}
            name="brand"
            defaultValue={BRANDS[0]?.id}
          >
            {BRANDS.map(({ id, name }) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Insight
          <textarea
            className={styles["field-input"]}
            name="text"
            rows={5}
            placeholder="Something insightful..."
          />
        </label>
        <Button className={styles.submit} type="submit" label="Add insight" />
      </form>
    </Modal>
  );
};
